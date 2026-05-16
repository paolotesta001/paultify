import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { usePlayer } from '../hooks/usePlayer.jsx';
import { searchOverview, getArtistTopTracks } from '../lib/discover.js';
import { useDownloadQueue } from '../hooks/useDownloadQueue.jsx';
import { Music } from './Icons.jsx';

// Artist page. Tapping an artist (from Home → Top artists, or any artist
// link) lands here. We split their music into album tiles — tap one to
// see its tracks in AlbumView. A "More from this artist" rail at the
// bottom suggests Deezer top tracks you don't yet own.
export default function ArtistView({ artistName, onBack, onPlay, onOpen }) {
  const { playFromQueue } = usePlayer();
  const { enqueue } = useDownloadQueue();

  const songs = useLiveQuery(
    () => db.songs.where('artist').equalsIgnoreCase(artistName).toArray()
      .then(rows => rows.map(({ blob, coverBlob, ...m }) => ({ ...m, hasCover: !!coverBlob }))),
    [artistName]
  );

  // Group by album. Songs missing an album collect under a single "Singles
  // & EPs" bucket so they're still browsable.
  const albums = useMemo(() => {
    if (!songs) return [];
    const groups = new Map();
    for (const s of songs) {
      const key = s.album || '__singles__';
      const name = s.album || 'Singles & EPs';
      if (!groups.has(key)) groups.set(key, { key, name, songs: [] });
      groups.get(key).songs.push(s);
    }
    return [...groups.values()].sort((a, b) =>
      a.key === '__singles__' ? 1 : b.key === '__singles__' ? -1 : a.name.localeCompare(b.name)
    );
  }, [songs]);

  // Lazily-loaded thumbnails: one Blob URL per album, sourced from the
  // first song in that album that actually has a cover. Built once when
  // `albums` settles; revoked on cleanup so we don't leak memory.
  const [albumCovers, setAlbumCovers] = useState({});
  useEffect(() => {
    if (!albums.length) return;
    let cancelled = false;
    const urls = [];
    (async () => {
      const next = {};
      for (const al of albums) {
        const withCover = al.songs.find(s => s.hasCover);
        if (!withCover) continue;
        const full = await db.songs.get(withCover.id);
        if (cancelled) return;
        if (full?.coverBlob) {
          const u = URL.createObjectURL(full.coverBlob);
          urls.push(u);
          next[al.key] = u;
        }
      }
      if (!cancelled) setAlbumCovers(next);
    })();
    return () => {
      cancelled = true;
      urls.forEach(u => URL.revokeObjectURL(u));
    };
  }, [albums]);

  // Recommendations rail — Deezer top tracks for this artist that we don't
  // already own. Best-effort; silently empty when the helper is offline.
  const [moreTracks, setMoreTracks] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const found = await searchOverview(artistName);
        const top = found?.artists?.[0];
        if (!top) return;
        const tracks = await getArtistTopTracks(top.id, 20);
        if (!active) return;
        const owned = new Set((songs || []).map(s => s.title.toLowerCase()));
        setMoreTracks(tracks.filter(t => !owned.has(t.title.toLowerCase())).slice(0, 12));
      } catch {
        if (active) setMoreTracks([]);
      }
    })();
    return () => { active = false; };
  }, [artistName, songs]);

  const handlePlayAll = async () => {
    if (!songs?.length) return;
    await playFromQueue(songs.map(s => s.id), 0);
    onPlay?.();
  };

  const handleShuffleAll = async () => {
    if (!songs?.length) return;
    const ids = songs.map(s => s.id).sort(() => Math.random() - 0.5);
    await playFromQueue(ids, 0);
    onPlay?.();
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
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-ink-700 to-ink-800 flex items-center justify-center text-3xl font-bold text-ink-100 shrink-0">
          {artistName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{artistName}</h1>
          <p className="text-sm text-ink-400">
            {songs?.length || 0} {songs?.length === 1 ? 'song' : 'songs'} · {albums.length} {albums.length === 1 ? 'album' : 'albums'}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={handlePlayAll}
              disabled={!songs?.length}
              className="px-3 py-1.5 rounded-full bg-accent text-ink-900 text-xs font-semibold disabled:opacity-50"
            >
              ▶ Play all
            </button>
            <button
              onClick={handleShuffleAll}
              disabled={!songs?.length}
              className="px-3 py-1.5 rounded-full bg-ink-800 text-ink-100 text-xs font-medium disabled:opacity-50"
            >
              ⤨ Shuffle
            </button>
          </div>
        </div>
      </header>

      {albums.length > 0 && (
        <section className="mt-2">
          <h2 className="px-4 text-sm font-semibold text-ink-200 mb-3">Albums</h2>
          <div className="grid grid-cols-2 gap-3 px-4">
            {albums.map(al => (
              <button
                key={al.key}
                onClick={() => onOpen({ kind: 'album', name: al.name, artist: artistName })}
                className="text-left active:scale-[0.98] transition-transform"
              >
                <div className="aspect-square rounded-lg overflow-hidden bg-ink-800 mb-2">
                  {albumCovers[al.key] ? (
                    <img
                      src={albumCovers[al.key]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-ink-500">
                      <Music size={36} />
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-ink-100 truncate">{al.name}</p>
                <p className="text-[11px] text-ink-400">
                  {al.songs.length} {al.songs.length === 1 ? 'song' : 'songs'}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {moreTracks && moreTracks.length > 0 && (
        <section className="mt-6">
          <h2 className="px-4 text-sm font-semibold text-ink-200 mb-2">
            More from {artistName}
          </h2>
          <ul className="px-2">
            {moreTracks.map(track => (
              <li key={track.id} className="flex items-center gap-2 px-2 py-2">
                <img
                  src={track.album?.cover_small}
                  alt=""
                  className="w-9 h-9 rounded object-cover bg-ink-800 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-100 truncate">{track.title}</p>
                  <p className="text-[11px] text-ink-400 truncate">{track.album?.title}</p>
                </div>
                <button
                  onClick={() => enqueue(`${artistName} - ${track.title}`, {
                    expectedArtist: artistName,
                    expectedTitle: track.title,
                    expectedDuration: track.duration,
                    expectedCoverUrl: track.album?.cover_xl
                  })}
                  className="shrink-0 w-8 h-8 rounded-full bg-ink-700 text-ink-100 hover:bg-ink-600 flex items-center justify-center text-base font-medium"
                  aria-label="Download"
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
