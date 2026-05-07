import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { usePlayer } from '../hooks/usePlayer.jsx';
import { searchOverview, getArtistTopTracks, getArtistAlbums } from '../lib/discover.js';
import { useDownloadQueue } from '../hooks/useDownloadQueue.jsx';
import { Music } from './Icons.jsx';

// Artist page: shows your songs by this artist (grouped by album), plus —
// when the helper is reachable — a "More from this artist" rail of Deezer
// top tracks you don't yet have.
export default function ArtistView({ artistName, onBack, onPlay, onOpen }) {
  const { currentSong, playFromQueue } = usePlayer();
  const { enqueue } = useDownloadQueue();

  const songs = useLiveQuery(
    () => db.songs.where('artist').equalsIgnoreCase(artistName).toArray()
      .then(rows => rows
        .map(({ blob, ...m }) => m)
        .sort((a, b) => (a.album || '').localeCompare(b.album || '') || a.title.localeCompare(b.title))),
    [artistName]
  );

  // Group your library's songs by album so the page reads like a discography.
  const albums = useMemo(() => {
    if (!songs) return [];
    const groups = new Map();
    for (const s of songs) {
      const k = s.album || '— Singles & EPs —';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    }
    return [...groups.entries()].map(([name, items]) => ({ name, items }));
  }, [songs]);

  const [moreTracks, setMoreTracks] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Fuzzy match the artist on Deezer; take the top result then pull
        // their top tracks. We filter out tracks we already own so the rail
        // only suggests new material.
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
            {songs?.length || 0} {songs?.length === 1 ? 'song' : 'songs'} in your library
          </p>
          <button
            onClick={handlePlayAll}
            disabled={!songs?.length}
            className="mt-2 px-4 py-1.5 rounded-full bg-accent text-ink-900 text-xs font-semibold disabled:opacity-50"
          >
            ▶ Play all
          </button>
        </div>
      </header>

      {albums.map(album => (
        <section key={album.name} className="mb-4">
          <h2 className="px-4 text-sm font-semibold text-ink-200 mb-1">{album.name}</h2>
          <ul>
            {album.items.map(song => {
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
                    <div className="w-9 h-9 rounded bg-ink-800 flex items-center justify-center text-ink-400 shrink-0">
                      <Music size={16} />
                    </div>
                    <p className="text-sm font-medium truncate text-left flex-1">{song.title}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

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
                    expectedTitle: track.title
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
