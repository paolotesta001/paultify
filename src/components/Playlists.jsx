import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { createPlaylist, deletePlaylist } from '../lib/playlists.js';
import SpotifyImport from './SpotifyImport.jsx';
import YouTubeSearch from './YouTubeSearch.jsx';
import UploadZone from './UploadZone.jsx';

// Playlists tab — also doubles as the "add stuff to your library" page.
//   • Quick Add (yt-dlp by query / URL)        ← was on Search; lives here now
//   • Upload from device (drag-drop MP3 + LRC) ← was on Search; lives here now
//   • Spotify import (paste a public URL)
//   • Create / open / delete playlists
//
// Three add-source panels collapse into a single "Add to library" header
// so the page stays scannable. The playlist list sits below.
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
      <h1 className="text-2xl font-bold mb-4">Playlists</h1>

      {/* ─── Add-to-library section ─────────────────────────────────── */}
      <section className="mb-6 space-y-3">
        <h2 className="text-[11px] uppercase tracking-widest text-ink-500">
          Add to library
        </h2>
        <YouTubeSearch />
        <SpotifyImport onImported={onOpen} />
        <details className="rounded-xl bg-ink-800/40 border border-ink-700/60">
          <summary className="px-4 py-3 cursor-pointer text-sm text-ink-200 select-none">
            Upload your own MP3s
          </summary>
          <div className="px-3 pb-3">
            <UploadZone />
          </div>
        </details>
      </section>

      {/* ─── Your playlists ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] uppercase tracking-widest text-ink-500">
            Your playlists ({playlists?.length ?? 0})
          </h2>
          {!creating && (
            <button
              onClick={handleStart}
              className="px-3 py-1 rounded-full bg-accent text-ink-900 text-xs font-semibold active:scale-95"
            >
              + New
            </button>
          )}
        </div>

        {creating && (
          <div className="mb-4 rounded-xl bg-ink-800/60 border border-ink-700 p-3 flex gap-2">
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

        {playlists && playlists.length === 0 && !creating && (
          <div className="text-center text-ink-400 py-10">
            <p className="text-sm">No playlists yet.</p>
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
      </section>
    </div>
  );
}
