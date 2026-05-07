import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { downloadFromYoutube } from '../lib/youtubeHelper.js';
import { addSong, db, setLyrics } from '../db/database.js';
import { extractMetadata } from '../lib/metadata.js';
import { fetchLyricsFromLrclib } from '../lib/lrclib.js';
import { addSongToPlaylist } from '../lib/playlists.js';

// A non-blocking download queue. Enqueue many songs; the worker pulls up to
// MAX_CONCURRENT items at a time so the user isn't held hostage by a slow
// YouTube fetch. Status updates flow through the reducer; the sidebar
// component subscribes via context.

const MAX_CONCURRENT = 2;
const KEEP_DONE_MS = 4000;

const Ctx = createContext(null);

function reducer(items, action) {
  switch (action.type) {
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

export function DownloadQueueProvider({ children }) {
  const [items, dispatch] = useReducer(reducer, []);
  const inFlightRef = useRef(new Set());

  // Stable processor — never re-created, so the worker effect's identity
  // doesn't churn. dispatch from useReducer is also stable.
  const processItem = useCallback(async (id, query, opts = {}) => {
    const { playlistId, expectedTitle, expectedArtist } = opts;
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

      dispatch({ type: 'update', id, patch: { status: 'downloading' } });
      const file = await downloadFromYoutube(query);

      dispatch({ type: 'update', id, patch: { status: 'parsing' } });
      const meta = await extractMetadata(file);
      const songId = crypto.randomUUID();
      await addSong({
        id: songId,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        duration: meta.duration,
        mimeType: 'audio/mpeg',
        blob: file,
        coverBlob: meta.coverBlob,
        addedAt: Date.now()
      });

      dispatch({ type: 'update', id, patch: { status: 'lyrics', title: meta.title, artist: meta.artist } });
      const fetched = await fetchLyricsFromLrclib({
        artist: meta.artist,
        title: meta.title,
        album: meta.album,
        duration: meta.duration
      }).catch(() => null);
      await setLyrics(songId, {
        lrcText: fetched?.syncedLyrics || null,
        plainText: fetched?.plainLyrics || null,
        source: fetched ? 'lrclib' : 'none'
      });

      // Add to the requesting playlist *after* the song row exists, so the
      // playlist's bulkGet sees a hydrated song.
      if (playlistId) await addSongToPlaylist(playlistId, songId);

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
          expectedArtist: item.expectedArtist
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
      expectedArtist: opts.expectedArtist
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
