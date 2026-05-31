import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { downloadFromYoutube } from '../lib/youtubeHelper.js';
import { addSong, db, setLyrics } from '../db/database.js';
import { extractMetadata } from '../lib/metadata.js';
import { fetchLyricsFromLrclib } from '../lib/lrclib.js';
import { addSongToPlaylist } from '../lib/playlists.js';
import { findTrack, fetchCoverBlob } from '../lib/discover.js';

// A non-blocking download queue. Enqueue many songs; the worker pulls up to
// MAX_CONCURRENT items at a time so the user isn't held hostage by a slow
// YouTube fetch. Status updates flow through the reducer; the sidebar
// component subscribes via context.

const MAX_CONCURRENT = 2;
const KEEP_DONE_MS = 4000;

const Ctx = createContext(null);

function reducer(items, action) {
  switch (action.type) {
    case 'hydrate':
      return action.items;
    case 'enqueue':
      return [
        ...items,
        {
          id: crypto.randomUUID(),
          query: action.query,
          status: 'queued',
          createdAt: Date.now(),
          // Optional context — used by Spotify imports so each track shows
          // its real name in the queue *before* yt-dlp returns, and so we
          // can dedup against existing songs and link to a playlist.
          playlistId: action.playlistId || null,
          expectedTitle: action.expectedTitle || null,
          expectedArtist: action.expectedArtist || null,
          // Album name (from Deezer/Spotify). yt-dlp downloads rarely have
          // a useful ID3 album tag, so without this every song lands in
          // "Singles & EPs" on the Artist page.
          expectedAlbum: action.expectedAlbum || null,
          // Studio duration (Deezer). yt-dlp filters candidate videos by
          // ±15s of this so we get the audio version, not the music video.
          expectedDuration: action.expectedDuration || null,
          // Album cover URL (Deezer CDN). Fetched as a Blob after download
          // and persisted alongside the song.
          expectedCoverUrl: action.expectedCoverUrl || null,
          title: action.expectedTitle || null,
          artist: action.expectedArtist || null
        }
      ];
    case 'update':
      return items.map(it => (it.id === action.id ? { ...it, ...action.patch } : it));
    case 'remove':
      return items.filter(it => it.id !== action.id);
    case 'clear-done':
      return items.filter(it => it.status !== 'done' && it.status !== 'error');
    default:
      return items;
  }
}

// Mirror in-memory queue state to Dexie so the queue survives a tab close.
// We never persist the audio Blob through the queue — once a download
// finishes, the song lives in the songs table and the queue row is dropped.
async function persistQueue(items) {
  try {
    // Skip transient "done" items — they auto-remove from memory anyway,
    // and we don't want them resurrecting after a refresh.
    const toStore = items.filter(it => it.status !== 'done');
    await db.transaction('rw', db.queue, async () => {
      await db.queue.clear();
      if (toStore.length) await db.queue.bulkPut(toStore);
    });
  } catch {
    // Queue persistence is best-effort. Failures (storage full, etc.)
    // shouldn't block the actual downloads.
  }
}

// Re-arm any item that was downloading/parsing/lyrics when the tab last
// closed — we lost the work in flight, so move it back to 'queued' for a
// fresh attempt.
function rehydrate(rows) {
  const STALE = new Set(['downloading', 'parsing', 'lyrics']);
  return rows.map(r => STALE.has(r.status) ? { ...r, status: 'queued' } : r);
}

// Case-insensitive exact match on artist + title against the songs table.
// Used for dedup when importing a Spotify playlist that overlaps with
// what's already in the library.
async function findExistingSong(artist, title) {
  const t = title?.trim();
  const a = artist?.trim();
  if (!t || !a) return null;
  try {
    const candidates = await db.songs.where('title').equalsIgnoreCase(t).toArray();
    return candidates.find(s =>
      s.artist?.trim().toLowerCase() === a.toLowerCase()
    ) || null;
  } catch {
    return null;
  }
}

// Filler words that don't carry any matching signal between a user query
// and a Deezer track title. Without this, "Tutto in un giorno of Fabri
// Fibra" matched "Centoquindici" because Deezer's first hit happened to be
// a different Fabri Fibra song — we don't want to silently trust that.
const STOP = new Set([
  'the', 'a', 'an', 'of', 'di', 'del', 'la', 'le', 'il', 'lo', 'i', 'e',
  'and', 'feat', 'ft', 'featuring', 'with', 'remix', 'version', 'official',
  'audio', 'video', 'lyrics', 'song', 'music'
]);

function tokens(s) {
  return new Set(
    (s || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w))
  );
}

// Stricter validator. Two rules:
//   1. If the user typed enough words to imply they specified an artist
//      (3+ meaningful tokens) AND we can identify the candidate's artist
//      tokens, at least one user word MUST be in those artist tokens.
//      Otherwise Deezer is offering us a different artist entirely —
//      e.g. "vasco rossi una nuova canzone per lei" came back as
//      "Una Nuova Canzone" by an unrelated Italian artist, and the title
//      overlap alone (una/nuova/canzone) was enough to wrongly accept it.
//   2. The user's *title-words* (their query minus the words that match
//      the candidate's artist) must overlap with the candidate's title.
//      Stops "invidia of fabri fibra" becoming "Che gusto c'è".
function looksLikeMatch(userQuery, track) {
  const userTokens = tokens(userQuery);
  if (!userTokens.size) return true;
  const titleTokens = tokens(track.title);
  const artistTokens = tokens(track.artist?.name || '');

  // Rule 1 — artist overlap.
  if (userTokens.size >= 3 && artistTokens.size > 0) {
    let artistHit = false;
    for (const t of userTokens) if (artistTokens.has(t)) { artistHit = true; break; }
    if (!artistHit) return false;
  }

  // Rule 2 — title overlap.
  const userTitleTokens = new Set([...userTokens].filter(t => !artistTokens.has(t)));
  if (!userTitleTokens.size) return true; // pure artist search
  for (const t of userTitleTokens) if (titleTokens.has(t)) return true;
  return false;
}

// Common parenthetical / dash annotations like "(Remastered 2025)" or
// " - Remastered" or "(Deluxe Edition)" make the YouTube search too
// specific — there's often no upload titled exactly that. We strip them
// from the *search* string only; the canonical title we store in the
// library still includes them.
function stripVariantTags(title) {
  if (!title) return title;
  return title
    // "(Whatever Remastered 2025)" or "[2025 Remaster]" etc.
    .replace(/\s*[(\[][^)\]]*\b(?:remaster(?:ed)?|deluxe|edition|extended|version|anniversary|expanded|mono|stereo|reissue|bonus|disc|cd)\b[^)\]]*[)\]]/gi, '')
    // " - Remastered" or " - Remastered 2025"
    .replace(/\s*[-—]\s*(?:\d{4}\s+)?(?:remaster(?:ed)?|deluxe|extended|anniversary|reissue)(?:\s+\d{4})?\s*$/gi, '')
    .trim() || title;
}

export function DownloadQueueProvider({ children }) {
  const [items, dispatch] = useReducer(reducer, []);
  const inFlightRef = useRef(new Set());
  const hydratedRef = useRef(false);

  // On boot, pull any leftover queue rows from IDB and re-arm them. The
  // worker effect below will pick them up like a fresh enqueue.
  useEffect(() => {
    (async () => {
      try {
        const rows = await db.queue.orderBy('createdAt').toArray();
        if (rows.length) dispatch({ type: 'hydrate', items: rehydrate(rows) });
      } finally {
        hydratedRef.current = true;
      }
    })();
  }, []);

  // Mirror state changes back to IDB. Skipped until the initial hydrate
  // completes so we don't blow away unread rows with an empty array.
  useEffect(() => {
    if (!hydratedRef.current) return;
    persistQueue(items);
  }, [items]);

  // Stable processor — never re-created, so the worker effect's identity
  // doesn't churn. dispatch from useReducer is also stable.
  const processItem = useCallback(async (id, query, opts = {}) => {
    let { playlistId, expectedTitle, expectedArtist, expectedAlbum, expectedDuration, expectedCoverUrl } = opts;
    try {
      // Dedup pass — if Spotify gave us "Artist + Title" and we already have
      // an exact match in the library, skip the download entirely and just
      // link the existing song into the playlist.
      if (expectedTitle && expectedArtist) {
        const existing = await findExistingSong(expectedArtist, expectedTitle);
        if (existing) {
          if (playlistId) await addSongToPlaylist(playlistId, existing.id);
          dispatch({
            type: 'update', id, patch: {
              status: 'done',
              songId: existing.id,
              title: existing.title,
              artist: existing.artist
            }
          });
          setTimeout(() => dispatch({ type: 'remove', id }), 1500);
          return;
        }
      }

      // Enrichment: for free-text Quick Add we have no Deezer track yet.
      // Look it up so yt-dlp can apply the duration filter and so we have
      // a real album cover URL by the time the audio finishes downloading.
      //
      // Critically, we validate Deezer's top hit against the user's query.
      // Deezer's #1 result can be a completely unrelated track when the
      // query is fuzzy ("Tutto in un giorno of Fabri Fibra" → Deezer
      // returned "Centoquindici"). If the tokens don't overlap, we throw
      // the enrichment away and let yt-dlp search the literal query.
      if (!expectedDuration && !/^https?:\/\//i.test(query)) {
        const t = await findTrack(expectedArtist || '', expectedTitle || query);
        if (t && looksLikeMatch(query, t)) {
          expectedDuration = expectedDuration || t.duration;
          expectedCoverUrl = expectedCoverUrl || t.album?.cover_xl || t.album?.cover_big;
          expectedTitle = expectedTitle || t.title;
          expectedArtist = expectedArtist || t.artist?.name;
          expectedAlbum = expectedAlbum || t.album?.title;
          dispatch({
            type: 'update', id, patch: {
              title: expectedTitle, artist: expectedArtist
            }
          });
        }
      }

      // Build a focused yt-dlp query. The "audio" hint nudges YouTube's
      // search toward Topic / Official Audio uploads. The negative tokens
      // dodge the recurring traps:
      //   -cover -karaoke -instrumental   wrong-version traps
      //   -live -remix                    only when the user didn't ask for them
      //   -8d -nightcore -slowed -reverb  edits the user almost never wants
      //   -sped -earrape -reaction        same
      //   -tutorial -lesson -mashup       wrong-genre traps
      //
      // YouTube's search engine honours these `-word` exclusions. We only
      // skip a negative when the user themselves typed that word in their
      // query — e.g. searching "Stairway to Heaven live" should keep `-live`
      // out so the live version actually comes through.
      const isUrlQuery = /^https?:\/\//i.test(query);
      const usingDeezer = !!(expectedTitle && expectedArtist) && !isUrlQuery;
      // Build the negatives list. Only drop a keyword when the user (or
      // the canonical Deezer title) actually mentions it as a word —
      // substring matching would treat "Liverpool" as the user asking for
      // a live version. Anything mentioned by the user → not negated.
      const userText = `${query} ${expectedTitle || ''}`;
      const mentioned = w => new RegExp(`\\b${w}\\b`, 'i').test(userText);
      const allNegatives = [
        'cover', 'karaoke', 'instrumental',
        'live', 'remix',
        '8d', 'nightcore', 'slowed', 'reverb', 'sped', 'earrape',
        'reaction', 'tutorial', 'lesson', 'mashup'
      ];
      const negatives = allNegatives
        .filter(w => !mentioned(w))
        .map(w => `-${w}`)
        .join(' ');
      // Strip "(Remastered 2025)" / "- Deluxe Edition" / etc. from the
      // title BEFORE building the YouTube query. The bare title finds
      // many more candidates for the duration filter to chew through.
      // (The full title still lives on the song row so the user sees it.)
      const searchTitle = stripVariantTags(expectedTitle);
      const ytQuery = isUrlQuery
        ? query
        : usingDeezer
          ? `${expectedArtist} ${searchTitle} audio ${negatives}`.trim()
          : `${query} audio ${negatives}`.trim();

      dispatch({ type: 'update', id, patch: { status: 'downloading' } });
      const file = await downloadFromYoutube(ytQuery, { duration: expectedDuration });

      dispatch({ type: 'update', id, patch: { status: 'parsing' } });
      const meta = await extractMetadata(file);

      // Canonical title/artist come from Deezer when available, NOT from
      // yt-dlp's video metadata. yt-dlp grabbed "Perfect | Lirik Terjemahan"?
      // doesn't matter — the song row says "Ed Sheeran - Perfect" because
      // that's what the user searched for, and that's what LRCLIB will find
      // synced lyrics for.
      const canonicalTitle = expectedTitle || meta.title;
      const canonicalArtist = expectedArtist || meta.artist;

      // Cover priority: Deezer (real album art) → ID3 embedded → none.
      // We prefer Deezer because yt-dlp downloads no longer carry ID3 cover
      // (we removed --embed-thumbnail to keep audio timing intact).
      let coverBlob = null;
      if (expectedCoverUrl) {
        coverBlob = await fetchCoverBlob(expectedCoverUrl);
      }
      if (!coverBlob && canonicalArtist && canonicalTitle) {
        const t = await findTrack(canonicalArtist, canonicalTitle);
        const url = t?.album?.cover_xl || t?.album?.cover_big;
        if (url) coverBlob = await fetchCoverBlob(url);
      }
      coverBlob = coverBlob || meta.coverBlob || null;

      // Canonical album: prefer the value we got from Deezer / Spotify /
      // Discover album view; fall back to whatever yt-dlp wrote into ID3
      // (usually empty). Without this every yt-dlp download landed in the
      // "Singles & EPs" bucket because no album tag survived the embed.
      const canonicalAlbum = expectedAlbum || meta.album || null;

      const songId = crypto.randomUUID();
      await addSong({
        id: songId,
        title: canonicalTitle,
        artist: canonicalArtist,
        album: canonicalAlbum,
        duration: meta.duration,
        mimeType: 'audio/mpeg',
        blob: file,
        coverBlob,
        addedAt: Date.now()
      });

      dispatch({ type: 'update', id, patch: { status: 'lyrics', title: canonicalTitle, artist: canonicalArtist } });

      // Lyrics are best-effort. The song is already saved at this point —
      // a network blip on LRCLIB or an IDB write hiccup must NOT roll the
      // queue row to "error" and trick the user into thinking the download
      // failed. Live recordings + most B-sides simply have no lyrics, and
      // that's fine. We still record source='none' so the player UI shows
      // "No lyrics" instead of a stuck "fetching" state.
      try {
        const fetched = await fetchLyricsFromLrclib({
          artist: canonicalArtist,
          title: canonicalTitle,
          album: canonicalAlbum,
          duration: meta.duration
        }).catch(() => null);
        await setLyrics(songId, {
          lrcText: fetched?.syncedLyrics || null,
          plainText: fetched?.plainLyrics || null,
          source: fetched ? 'lrclib' : 'none'
        });
      } catch {
        // swallow — song is downloaded, that's what matters
      }

      // Add to the requesting playlist *after* the song row exists, so the
      // playlist's bulkGet sees a hydrated song.
      if (playlistId) {
        try { await addSongToPlaylist(playlistId, songId); } catch {}
      }

      dispatch({ type: 'update', id, patch: { status: 'done', songId } });
      setTimeout(() => dispatch({ type: 'remove', id }), KEEP_DONE_MS);
    } catch (err) {
      dispatch({ type: 'update', id, patch: { status: 'error', error: err.message || 'failed' } });
    } finally {
      inFlightRef.current.delete(id);
    }
  }, []);

  // Worker: any time the queue changes, top up the in-flight set.
  // Effect re-runs when an item finishes (status flips to done/error → state
  // changes → effect picks up the next queued one).
  useEffect(() => {
    for (const item of items) {
      if (inFlightRef.current.size >= MAX_CONCURRENT) break;
      if (item.status === 'queued' && !inFlightRef.current.has(item.id)) {
        inFlightRef.current.add(item.id);
        processItem(item.id, item.query, {
          playlistId: item.playlistId,
          expectedTitle: item.expectedTitle,
          expectedAlbum: item.expectedAlbum,
          expectedArtist: item.expectedArtist,
          expectedDuration: item.expectedDuration,
          expectedCoverUrl: item.expectedCoverUrl
        });
      }
    }
  }, [items, processItem]);

  const enqueue = useCallback((query, opts = {}) => {
    const q = (query || '').trim();
    if (!q) return;
    dispatch({
      type: 'enqueue',
      query: q,
      playlistId: opts.playlistId,
      expectedTitle: opts.expectedTitle,
      expectedArtist: opts.expectedArtist,
      expectedAlbum: opts.expectedAlbum,
      expectedDuration: opts.expectedDuration,
      expectedCoverUrl: opts.expectedCoverUrl
    });
  }, []);

  const remove = useCallback(id => dispatch({ type: 'remove', id }), []);
  const clearDone = useCallback(() => dispatch({ type: 'clear-done' }), []);

  const value = useMemo(
    () => ({ items, enqueue, remove, clearDone }),
    [items, enqueue, remove, clearDone]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDownloadQueue() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDownloadQueue must be inside DownloadQueueProvider');
  return ctx;
}
