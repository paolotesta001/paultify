import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { useDownloadQueue } from '../hooks/useDownloadQueue.jsx';
import { addSongToPlaylist, createPlaylist } from '../lib/playlists.js';
import { Music } from './Icons.jsx';

// Bottom-sheet menu shown when the user taps "⋮" on a search result.
//
// The sheet describes a Deezer track (we don't yet have it locally). Two
// terminal actions:
//   1. Download — enqueue the yt-dlp grab. Once the queue finishes, the
//      song is in the library and shows up on Home.
//   2. Add to playlist — pick / create a playlist, then enqueue with
//      playlistId metadata. Dedup logic in the queue means we don't
//      re-download a song the user already owns.
//
// Why a sheet instead of a popover? Sheets sit above the bottom-tab nav,
// keep the touch target large, and match the iOS "more options" pattern
// the user already knows from Spotify / Apple Music.
export default function SongActionSheet({ track, onClose }) {
  const { enqueue } = useDownloadQueue();
  const [view, setView] = useState('main'); // 'main' | 'pickPlaylist'
  const [feedback, setFeedback] = useState(null);

  // Esc closes the sheet — quality-of-life on desktop, ignored on mobile.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!track) return null;

  const query = `${track.artist} - ${track.title}`;

  const handleDownload = () => {
    enqueue(query, {
      expectedArtist: track.artist,
      expectedTitle: track.title,
      expectedDuration: track.duration,
      expectedCoverUrl: track.coverUrl
    });
    setFeedback('Added to download queue');
    setTimeout(onClose, 700);
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-ink-950/85 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-ink-900 border-t border-ink-700 rounded-t-2xl w-full max-w-md flex flex-col"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <header className="px-4 pt-3 pb-3 flex items-center gap-3 border-b border-ink-800">
          {track.album?.cover_small ? (
            <img
              src={track.album.cover_small}
              alt=""
              className="w-12 h-12 rounded object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-ink-800 flex items-center justify-center text-ink-500">
              <Music size={20} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-100 truncate">{track.title}</p>
            <p className="text-xs text-ink-400 truncate">{track.artist}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-ink-400 hover:text-ink-100 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {view === 'main' && (
          <ul className="py-2">
            <Action icon="↓" label="Download" onClick={handleDownload} disabled={!!feedback} />
            <Action icon="＋" label="Add to a playlist" onClick={() => setView('pickPlaylist')} disabled={!!feedback} />
          </ul>
        )}

        {view === 'pickPlaylist' && (
          <PickPlaylist
            track={track}
            query={query}
            onPicked={() => {
              setFeedback('Added — download queued');
              setTimeout(onClose, 700);
            }}
            onBack={() => setView('main')}
          />
        )}

        {feedback && (
          <p className="px-4 py-3 text-xs text-accent text-center">{feedback}</p>
        )}
      </div>
    </div>
  );
}

function Action({ icon, label, onClick, disabled }) {
  return (
    <li>
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-ink-800 disabled:opacity-50"
      >
        <span className="w-8 h-8 rounded-full bg-ink-800 flex items-center justify-center text-ink-200 text-base shrink-0">
          {icon}
        </span>
        <span className="text-sm text-ink-100">{label}</span>
      </button>
    </li>
  );
}

function PickPlaylist({ track, query, onPicked, onBack }) {
  const playlists = useLiveQuery(
    () => db.playlists.orderBy('createdAt').reverse().toArray(),
    []
  );
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const { enqueue } = useDownloadQueue();

  const addToExisting = async playlistId => {
    // First check if we already own this song. If yes: just link it. If no:
    // enqueue with playlistId so the worker links it after download.
    const existing = await db.songs
      .where('title').equalsIgnoreCase(track.title)
      .toArray()
      .then(rows => rows.find(s =>
        s.artist?.trim().toLowerCase() === track.artist.toLowerCase()
      ));
    if (existing) {
      await addSongToPlaylist(playlistId, existing.id);
    } else {
      enqueue(query, {
        playlistId,
        expectedArtist: track.artist,
        expectedTitle: track.title,
        expectedDuration: track.duration,
        expectedCoverUrl: track.coverUrl
      });
    }
    onPicked();
  };

  const createAndAdd = async () => {
    if (!newName.trim()) return;
    const id = await createPlaylist(newName);
    await addToExisting(id);
  };

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-2 pb-1 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-[11px] uppercase tracking-wider text-ink-400 hover:text-ink-200"
        >
          ← Back
        </button>
        <span className="text-[11px] uppercase tracking-widest text-ink-500">
          Pick a playlist
        </span>
      </div>

      <ul className="max-h-[55vh] overflow-y-auto py-1">
        <li>
          {creating ? (
            <div className="flex gap-2 px-3 py-2">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createAndAdd();
                  if (e.key === 'Escape') setCreating(false);
                }}
                placeholder="New playlist name"
                className="flex-1 bg-ink-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                onClick={createAndAdd}
                disabled={!newName.trim()}
                className="px-3 py-2 rounded-lg bg-accent text-ink-900 text-sm font-semibold disabled:opacity-50"
              >
                Create
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-ink-800"
            >
              <span className="w-9 h-9 rounded bg-accent/20 flex items-center justify-center text-accent text-base shrink-0">
                ＋
              </span>
              <span className="text-sm font-medium text-ink-100">New playlist</span>
            </button>
          )}
        </li>

        {playlists?.map(p => (
          <li key={p.id}>
            <button
              onClick={() => addToExisting(p.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-ink-800"
            >
              <span className="w-9 h-9 rounded bg-gradient-to-br from-accent/40 to-accent-dim/30 flex items-center justify-center text-ink-100 font-bold text-sm shrink-0">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-100 truncate">{p.name}</p>
                <p className="text-[11px] text-ink-400">
                  {p.songIds.length} {p.songIds.length === 1 ? 'song' : 'songs'}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
