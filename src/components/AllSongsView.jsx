import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteSong } from '../db/database.js';
import { usePlayer } from '../hooks/usePlayer.jsx';
import { Music, Trash } from './Icons.jsx';

// "All songs" view — a virtual playlist of every track in the library.
// Same shape as PlaylistView but pulls from db.songs directly. Includes
// an inline filter so a 500-track library is still navigable.
export default function AllSongsView({ onBack, onPlay, onOpen }) {
  const { currentSong, playFromQueue } = usePlayer();
  const [filter, setFilter] = useState('');

  const songs = useLiveQuery(
    () => db.songs.orderBy('addedAt').reverse().toArray()
      .then(rows => rows.map(({ blob, coverBlob, ...m }) => m)),
    []
  );

  const filtered = useMemo(() => {
    if (!songs) return [];
    const q = filter.toLowerCase().trim();
    if (!q) return songs;
    return songs.filter(s =>
      s.title.toLowerCase().includes(q) ||
      (s.artist || '').toLowerCase().includes(q) ||
      (s.album || '').toLowerCase().includes(q)
    );
  }, [songs, filter]);

  const handlePlay = async song => {
    if (!filtered.length) return;
    const ids = filtered.map(s => s.id);
    const start = ids.indexOf(song.id);
    await playFromQueue(ids, start === -1 ? 0 : start);
    onPlay?.();
  };

  const handlePlayAll = async () => {
    if (!filtered.length) return;
    await playFromQueue(filtered.map(s => s.id), 0);
    onPlay?.();
  };

  const handleShuffle = async () => {
    if (!filtered.length) return;
    const shuffled = filtered.map(s => s.id).sort(() => Math.random() - 0.5);
    await playFromQueue(shuffled, 0);
    onPlay?.();
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this song?')) return;
    await deleteSong(id);
  };

  return (
    <div className="pb-6">
      <button
        onClick={onBack}
        className="px-4 pt-4 text-xs uppercase tracking-wider text-ink-400 hover:text-ink-200"
      >
        ← Home
      </button>

      <header className="px-4 pt-3 pb-4 flex items-center gap-4">
        <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-accent/40 to-accent-dim/30 flex items-center justify-center text-ink-100 shrink-0">
          <Music size={36} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">All songs</h1>
          <p className="text-sm text-ink-400">
            {songs?.length || 0} tracks in your library
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={handlePlayAll}
              disabled={!filtered.length}
              className="px-3 py-1.5 rounded-full bg-accent text-ink-900 text-xs font-semibold disabled:opacity-50"
            >
              ▶ Play all
            </button>
            <button
              onClick={handleShuffle}
              disabled={!filtered.length}
              className="px-3 py-1.5 rounded-full bg-ink-800 text-ink-100 text-xs font-medium disabled:opacity-50"
            >
              ⤨ Shuffle
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 mb-2">
        <input
          type="text"
          inputMode="search"
          placeholder="Filter your library…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full bg-ink-800 rounded-lg px-3 py-2 text-sm placeholder-ink-500 focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <ul>
        {filtered.length === 0 && songs?.length > 0 && (
          <li className="text-center text-xs text-ink-500 py-6">No matches.</li>
        )}
        {filtered.map(song => {
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
                <div className="w-10 h-10 rounded bg-ink-800 flex items-center justify-center text-ink-400 shrink-0">
                  <Music size={18} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{song.title}</p>
                  <p className="text-xs text-ink-400 truncate">
                    <span
                      onClick={e => { e.stopPropagation(); onOpen?.({ kind: 'artist', name: song.artist }); }}
                      className="hover:underline"
                      role="link"
                    >
                      {song.artist}
                    </span>
                    {song.album && (
                      <>
                        {' · '}
                        <span
                          onClick={e => { e.stopPropagation(); onOpen?.({ kind: 'album', name: song.album, artist: song.artist }); }}
                          className="hover:underline"
                          role="link"
                        >
                          {song.album}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <span
                  onClick={e => handleDelete(e, song.id)}
                  className="w-9 h-9 flex items-center justify-center text-ink-500 hover:text-red-400 shrink-0"
                  role="button"
                  aria-label="Delete"
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
