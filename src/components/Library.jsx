import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteSong } from '../db/database.js';
import { usePlayer } from '../hooks/usePlayer.jsx';
import UploadZone from './UploadZone.jsx';
import YouTubeSearch from './YouTubeSearch.jsx';
import { Music, Trash } from './Icons.jsx';

export default function Library({ onPlay }) {
  const { currentSong, playFromQueue } = usePlayer();

  // Don't pull Blobs into the list view — only metadata. addedAt index
  // makes ordering O(log n) instead of an in-memory sort.
  const songs = useLiveQuery(
    () => db.songs.orderBy('addedAt').reverse().toArray()
      .then(rows => rows.map(({ blob, ...meta }) => meta)),
    []
  );

  const handlePlay = async song => {
    const ids = (songs || []).map(s => s.id);
    const start = ids.indexOf(song.id);
    await playFromQueue(ids, start === -1 ? 0 : start);
    onPlay?.();
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this song?')) return;
    await deleteSong(id);
  };

  return (
    <div className="px-4 pt-6 pb-20 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-1">Library</h1>
      <p className="text-sm text-ink-400 mb-6">
        {songs ? `${songs.length} ${songs.length === 1 ? 'song' : 'songs'}` : '…'}
      </p>

      <YouTubeSearch />

      <div className="mb-8">
        <UploadZone />
      </div>

      {songs && songs.length === 0 && (
        <div className="text-center text-ink-400 py-12">
          <p className="text-sm">Drop your first MP3 above to get started.</p>
        </div>
      )}

      <ul className="divide-y divide-ink-700/60">
        {songs?.map(song => {
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
                  onClick={e => handleDelete(e, song.id)}
                  className="w-10 h-10 flex items-center justify-center text-ink-500 hover:text-red-400 active:text-red-400"
                  aria-label="Delete"
                  role="button"
                >
                  <Trash size={18} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
