import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { addSongToPlaylist, removeSongFromPlaylist } from '../lib/playlists.js';
import { Music } from './Icons.jsx';

// Modal picker that lists every song in the library with a search filter.
// Toggling the action button immediately persists the change — no "save"
// step. The user closes the modal when done.
export default function PlaylistAddSongs({ playlistId, onClose }) {
  const songs = useLiveQuery(
    () => db.songs.orderBy('addedAt').reverse().toArray()
      .then(rows => rows.map(({ blob, ...m }) => m)),
    []
  );
  const playlist = useLiveQuery(
    () => db.playlists.get(playlistId),
    [playlistId]
  );
  const inPlaylist = useMemo(
    () => new Set(playlist?.songIds || []),
    [playlist]
  );

  const [filter, setFilter] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on Escape — small but expected in modals.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const toggle = async song => {
    if (inPlaylist.has(song.id)) {
      await removeSongFromPlaylist(playlistId, song.id);
    } else {
      await addSongToPlaylist(playlistId, song.id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-ink-950/85 backdrop-blur-sm p-4 flex items-start sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-ink-900 border border-ink-700 rounded-xl w-full max-w-md max-h-[85vh] flex flex-col mt-8 sm:mt-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-ink-700/60 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Add songs</h3>
            <p className="text-xs text-ink-400">
              {inPlaylist.size} of {songs?.length ?? 0} in playlist
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-ink-400 hover:text-ink-100 text-xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-3 pt-3 pb-2">
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            placeholder="Type to filter your library…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full bg-ink-800 rounded-lg px-3 py-2 text-sm placeholder-ink-500 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <ul className="flex-1 overflow-y-auto px-2 pb-3">
          {filtered.length === 0 && (
            <li className="text-center text-xs text-ink-500 py-8">
              {songs?.length === 0 ? 'No songs in your library yet.' : 'No matches.'}
            </li>
          )}
          {filtered.map(song => {
            const added = inPlaylist.has(song.id);
            return (
              <li key={song.id}>
                <button
                  onClick={() => toggle(song)}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-ink-800 active:bg-ink-800 text-left"
                >
                  <div className="w-9 h-9 rounded bg-ink-700 flex items-center justify-center text-ink-400 shrink-0">
                    <Music size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-100 truncate">{song.title}</p>
                    <p className="text-[11px] text-ink-400 truncate">{song.artist}</p>
                  </div>
                  <span
                    className={
                      'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-base font-medium ' +
                      (added
                        ? 'bg-accent text-ink-900'
                        : 'bg-ink-700 text-ink-100')
                    }
                  >
                    {added ? '✓' : '+'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="px-4 py-3 border-t border-ink-700/60">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg bg-ink-700 text-ink-100 text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
