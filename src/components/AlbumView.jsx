import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteSong } from '../db/database.js';
import { usePlayer } from '../hooks/usePlayer.jsx';
import { findTrack, fetchCoverBlob } from '../lib/discover.js';
import { Music, Trash } from './Icons.jsx';

// Album page from your own library. Lists every song you have tagged with
// this album name. Tapping a song plays the album as a queue. Per-song
// trash here permanently removes a track from the library (unlike the
// playlist trash, which only unlinks).
export default function AlbumView({ albumName, artistName, displayName, onBack, onPlay }) {
  const { currentSong, playFromQueue } = usePlayer();

  // Two modes:
  //   - albumName set → find every song tagged with that album
  //   - albumName null/empty (the "Singles & EPs" case) → find every song
  //     by `artistName` that has NO album set. This is the path ArtistView
  //     hits when it folds non-album tracks into a single tile.
  const songs = useLiveQuery(
    async () => {
      let rows;
      if (albumName) {
        rows = await db.songs.where('album').equalsIgnoreCase(albumName).toArray();
      } else if (artistName) {
        const byArtist = await db.songs.where('artist').equalsIgnoreCase(artistName).toArray();
        rows = byArtist.filter(r => !r.album);
      } else {
        rows = [];
      }
      return rows
        .map(({ blob, coverBlob, ...meta }) => ({ ...meta, _hasCover: !!coverBlob }))
        .sort((a, b) => a.title.localeCompare(b.title));
    },
    [albumName, artistName]
  );

  // What to show in the header. For Singles & EPs we use the friendly
  // label rather than "(no album)".
  const headerTitle = albumName || displayName || 'Singles & EPs';

  // Pull one cover Blob URL for the header. Released on unmount.
  const [coverUrl, setCoverUrl] = useState(null);
  useEffect(() => {
    if (!songs?.length) return;
    const withCover = songs.find(s => s._hasCover);
    if (!withCover) return;
    let url = null;
    let cancelled = false;
    db.songs.get(withCover.id).then(row => {
      if (cancelled) return;
      if (row?.coverBlob) {
        url = URL.createObjectURL(row.coverBlob);
        setCoverUrl(url);
      }
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [songs]);

  const handlePlay = async song => {
    if (!songs?.length) return;
    const ids = songs.map(s => s.id);
    const start = ids.indexOf(song.id);
    await playFromQueue(ids, start === -1 ? 0 : start);
    onPlay?.();
  };

  const handlePlayAll = async () => {
    if (!songs?.length) return;
    await playFromQueue(songs.map(s => s.id), 0);
    onPlay?.();
  };

  const handleDelete = async (e, song) => {
    e.stopPropagation();
    const ok = confirm(
      `Permanently delete "${song.title}" from your library? It will leave any playlists it's in.`
    );
    if (!ok) return;
    await deleteSong(song.id);
  };

  // "Auto-organize from Deezer" — shown only on the Singles & EPs tile.
  // For each null-album song, look it up on Deezer and write back the
  // album name + cover (if missing). The song's reactive query then moves
  // it out of this view into its actual album's tile on the Artist page.
  const isSingles = !albumName;
  const [organizing, setOrganizing] = useState(false);
  const [organizeProgress, setOrganizeProgress] = useState(0);
  const [organizeResult, setOrganizeResult] = useState(null);

  const handleOrganize = async () => {
    if (!songs?.length || organizing) return;
    setOrganizing(true);
    setOrganizeProgress(0);
    setOrganizeResult(null);
    let updated = 0;
    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      try {
        const t = await findTrack(song.artist, song.title);
        // Sanity check: Deezer's match should share at least one title word
        // with what we have. Otherwise we'd happily file "Invidia" under
        // "Che gusto c'è" the same way the queue used to.
        if (t && titleOverlap(song.title, t.title)) {
          const updates = {};
          if (t.album?.title) updates.album = t.album.title;
          if (!song._hasCover) {
            const coverUrl = t.album?.cover_xl || t.album?.cover_big;
            if (coverUrl) {
              const blob = await fetchCoverBlob(coverUrl);
              if (blob) updates.coverBlob = blob;
            }
          }
          if (Object.keys(updates).length) {
            await db.songs.update(song.id, updates);
            updated++;
          }
        }
      } catch {
        // Skip — one bad lookup shouldn't kill the run.
      }
      setOrganizeProgress(i + 1);
    }
    setOrganizing(false);
    setOrganizeResult({ updated, total: songs.length });
  };

  return (
    <div className="pb-6">
      <button
        onClick={onBack}
        className="px-4 pt-4 text-xs uppercase tracking-wider text-ink-400 hover:text-ink-200"
      >
        ← Back
      </button>

      <header className="px-4 pt-3 pb-4 flex items-center gap-4">
        <div className="w-24 h-24 rounded-lg overflow-hidden bg-gradient-to-br from-ink-700 to-ink-800 flex items-center justify-center text-3xl font-bold text-ink-100 shrink-0">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            headerTitle.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{headerTitle}</h1>
          {artistName && (
            <p className="text-sm text-ink-400 truncate">{artistName}</p>
          )}
          <p className="text-xs text-ink-500 mt-0.5">
            {songs?.length || 0} {songs?.length === 1 ? 'song' : 'songs'} in your library
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={handlePlayAll}
              disabled={!songs?.length}
              className="px-4 py-1.5 rounded-full bg-accent text-ink-900 text-xs font-semibold disabled:opacity-50"
            >
              ▶ Play all
            </button>
            {isSingles && songs?.length > 0 && (
              <button
                onClick={handleOrganize}
                disabled={organizing}
                className="px-3 py-1.5 rounded-full bg-ink-700 text-ink-100 text-xs font-medium disabled:opacity-60"
              >
                {organizing
                  ? `Organizing ${organizeProgress}/${songs.length}…`
                  : 'Auto-organize from Deezer'}
              </button>
            )}
          </div>
          {organizeResult && (
            <p className="mt-2 text-[11px] text-accent">
              Moved {organizeResult.updated} of {organizeResult.total} songs into their albums.
            </p>
          )}
        </div>
      </header>

      {/* helper — kept here so the validation rule lives next to the
          only place it's used. */}
      <ul>
        {songs?.map((song, i) => {
          const isCurrent = currentSong?.id === song.id;
          return (
            <li key={song.id}>
              <button
                onClick={() => handlePlay(song)}
                className={
                  'w-full flex items-center gap-3 px-4 py-2.5 active:bg-ink-800 ' +
                  (isCurrent ? 'text-accent' : 'text-ink-100')
                }
              >
                <span className="w-5 text-center text-xs text-ink-500 tabular-nums shrink-0">
                  {i + 1}
                </span>
                <div className="w-9 h-9 rounded bg-ink-800 flex items-center justify-center text-ink-400 shrink-0">
                  <Music size={16} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{song.title}</p>
                  <p className="text-[11px] text-ink-400 truncate">{song.artist}</p>
                </div>
                <span
                  onClick={e => handleDelete(e, song)}
                  className="w-9 h-9 flex items-center justify-center text-ink-500 hover:text-red-400 shrink-0"
                  role="button"
                  aria-label="Delete permanently"
                >
                  <Trash size={16} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Same idea as the queue's looksLikeMatch but compares titles only — we
// already know the artist matches (we filtered by it in the query). Keeps
// the auto-organize rule from filing a song under the wrong album just
// because Deezer's top hit was the artist's most popular track.
function titleOverlap(local, remote) {
  const STOP = new Set([
    'the', 'a', 'an', 'of', 'di', 'del', 'la', 'le', 'il', 'lo', 'i', 'e',
    'and', 'feat', 'ft', 'featuring', 'with', 'remix', 'version', 'official',
    'audio', 'video', 'lyrics', 'song', 'music', 'remastered'
  ]);
  const tok = s => new Set(
    (s || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w))
  );
  const a = tok(local);
  const b = tok(remote);
  if (!a.size) return true;
  for (const w of a) if (b.has(w)) return true;
  return false;
}
