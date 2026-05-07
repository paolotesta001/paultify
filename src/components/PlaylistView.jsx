import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { deletePlaylist, removeSongFromPlaylist, renamePlaylist } from '../lib/playlists.js';
import { usePlayer } from '../hooks/usePlayer.jsx';
import PlaylistAddSongs from './PlaylistAddSongs.jsx';
import { Music, Trash } from './Icons.jsx';

// Single playlist screen: rename, delete, add/remove songs, play. The song
// list is derived from playlist.songIds + bulkGet against the songs table,
// which preserves user-defined order while letting useLiveQuery reactively
// update on either side (playlist edits or song deletions).
export default function PlaylistView({ playlistId, onBack, onPlay }) {
  const { currentSong, playFromQueue } = usePlayer();
  const playlist = useLiveQuery(
    () => db.playlists.get(playlistId),
    [playlistId]
  );
  const songs = useLiveQuery(
    async () => {
      const p = await db.playlists.get(playlistId);
      if (!p) return null;
      const rows = await db.songs.bulkGet(p.songIds);
      return rows
        .filter(Boolean)
        .map(({ blob, ...meta }) => meta);
    },
    [playlistId]
  );

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  // Sync the edit input with the current name when entering edit mode.
  useEffect(() => {
    if (editing && playlist) setName(playlist.name);
  }, [editing, playlist?.name]);

  const handleSaveName = async () => {
    if (!name.trim()) return;
    await renamePlaylist(playlistId, name);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${playlist.name}"? Songs themselves stay in the library.`)) return;
    await deletePlaylist(playlistId);
    onBack();
  };

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

  const handleRemoveSong = async (e, songId) => {
    e.stopPropagation();
    await removeSongFromPlaylist(playlistId, songId);
  };

  if (!playlist) {
    return (
      <div className="px-4 pt-6 pb-20 max-w-2xl mx-auto text-ink-400 text-sm">
        Playlist not found.
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-20 max-w-2xl mx-auto">
      <button
        onClick={onBack}
        className="text-xs uppercase tracking-wider text-ink-400 hover:text-ink-200 mb-4"
      >
        ← Playlists
      </button>

      <div className="flex items-start gap-4 mb-5">
        <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-accent/40 to-accent-dim/30 flex items-center justify-center text-ink-100 font-bold text-3xl shrink-0">
          {playlist.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') setEditing(false);
                }}
                className="flex-1 bg-ink-800 rounded-lg px-3 py-2 text-base font-semibold focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                onClick={handleSaveName}
                className="px-3 py-2 rounded-lg bg-accent text-ink-900 text-sm font-semibold"
              >
                Save
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold truncate">{playlist.name}</h1>
              <p className="text-sm text-ink-400">
                {songs?.length ?? 0} {songs?.length === 1 ? 'song' : 'songs'}
              </p>
              <div className="mt-2 flex gap-2 flex-wrap">
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1 rounded-full bg-ink-700 hover:bg-ink-600 text-xs"
                >
                  Rename
                </button>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1 rounded-full bg-ink-700 hover:bg-red-900/40 text-xs text-red-300"
                >
                  Delete playlist
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={handlePlayAll}
          disabled={!songs?.length}
          className="flex-1 px-4 py-2.5 rounded-lg bg-accent text-ink-900 text-sm font-semibold disabled:opacity-40 active:scale-[0.98]"
        >
          ▶ Play all
        </button>
        <button
          onClick={() => setAdding(true)}
          className="px-4 py-2.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-ink-100 text-sm font-medium"
        >
          + Add songs
        </button>
      </div>

      {songs && songs.length === 0 && (
        <div className="text-center text-ink-400 py-12">
          <p className="text-sm">No songs yet.</p>
          <button
            onClick={() => setAdding(true)}
            className="mt-3 px-4 py-2 rounded-full bg-accent text-ink-900 text-sm font-semibold"
          >
            Add some
          </button>
        </div>
      )}

      <ul className="divide-y divide-ink-700/60">
        {songs?.map((song, i) => {
          const isCurrent = currentSong?.id === song.id;
          return (
            <li key={song.id}>
              <button
                onClick={() => handlePlay(song)}
                className={
                  'w-full flex items-center gap-3 py-3 text-left active:bg-ink-700/40 rounded-lg ' +
                  (isCurrent ? 'text-accent' : 'text-ink-100')
                }
              >
                <span className="w-6 text-center text-xs text-ink-500 tabular-nums shrink-0">
                  {i + 1}
                </span>
                <div className="w-10 h-10 rounded bg-ink-700 flex items-center justify-center text-ink-400 shrink-0">
                  <Music size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{song.title}</p>
                  <p className="text-xs text-ink-400 truncate">
                    {song.artist}{song.album ? ` · ${song.album}` : ''}
                  </p>
                </div>
                <span
                  onClick={e => handleRemoveSong(e, song.id)}
                  className="w-9 h-9 flex items-center justify-center text-ink-500 hover:text-red-400 shrink-0"
                  role="button"
                  aria-label="Remove from playlist"
                >
                  <Trash size={18} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {adding && (
        <PlaylistAddSongs
          playlistId={playlistId}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
