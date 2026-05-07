import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { createPlaylist, deletePlaylist } from '../lib/playlists.js';
import SpotifyImport from './SpotifyImport.jsx';

// Top-level playlists screen. Shows every playlist and a "New" button.
// Tapping a playlist drills into <PlaylistView /> via the parent's onOpen.
export default function Playlists({ onOpen }) {
  const playlists = useLiveQuery(
    () => db.playlists.orderBy('createdAt').reverse().toArray(),
    []
  );
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef(null);

  const handleStart = () => {
    setCreating(true);
    setNewName('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleCreate = async () => {
    const id = await createPlaylist(newName);
    setCreating(false);
    setNewName('');
    onOpen(id);
  };

  const handleDelete = async (e, p) => {
    e.stopPropagation();
    if (!confirm(`Delete playlist "${p.name}"? Songs themselves stay in the library.`)) return;
    await deletePlaylist(p.id);
  };

  return (
    <div className="px-4 pt-6 pb-20 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold">Playlists</h1>
          <p className="text-sm text-ink-400">
            {playlists ? `${playlists.length} ${playlists.length === 1 ? 'playlist' : 'playlists'}` : '…'}
          </p>
        </div>
        {!creating && (
          <button
            onClick={handleStart}
            className="px-4 py-2 rounded-full bg-accent text-ink-900 text-sm font-semibold active:scale-95"
          >
            + New
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-5 rounded-xl bg-ink-800/60 border border-ink-700 p-3 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Playlist name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
            className="flex-1 bg-ink-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-3 py-2 rounded-lg bg-accent text-ink-900 text-sm font-semibold disabled:opacity-50"
          >
            Create
          </button>
          <button
            onClick={() => setCreating(false)}
            className="px-3 py-2 rounded-lg bg-ink-700 text-ink-200 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      <SpotifyImport onImported={onOpen} />

      {playlists && playlists.length === 0 && !creating && (
        <div className="text-center text-ink-400 py-12">
          <p className="text-sm">You don't have any playlists yet.</p>
          <button
            onClick={handleStart}
            className="mt-3 px-4 py-2 rounded-full bg-accent text-ink-900 text-sm font-semibold"
          >
            Create your first one
          </button>
        </div>
      )}

      <ul className="divide-y divide-ink-700/60">
        {playlists?.map(p => (
          <li key={p.id}>
            <button
              onClick={() => onOpen(p.id)}
              className="w-full flex items-center gap-3 py-3 text-left active:bg-ink-700/40 rounded-lg"
            >
              <div className="w-12 h-12 rounded bg-gradient-to-br from-accent/40 to-accent-dim/30 flex items-center justify-center text-ink-100 font-bold text-lg shrink-0">
                {p.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-ink-400">
                  {p.songIds.length} {p.songIds.length === 1 ? 'song' : 'songs'}
                </p>
              </div>
              <span
                onClick={e => handleDelete(e, p)}
                className="w-9 h-9 flex items-center justify-center text-ink-500 hover:text-red-400 text-lg shrink-0"
                role="button"
                aria-label="Delete playlist"
              >
                ×
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
