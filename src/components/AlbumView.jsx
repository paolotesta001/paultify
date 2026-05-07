import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { usePlayer } from '../hooks/usePlayer.jsx';
import { Music } from './Icons.jsx';

// Album page from your own library. Lists every song you have tagged with
// this album name. Tapping a song plays the album as a queue.
export default function AlbumView({ albumName, artistName, onBack, onPlay }) {
  const { currentSong, playFromQueue } = usePlayer();

  const songs = useLiveQuery(
    () => db.songs.where('album').equalsIgnoreCase(albumName).toArray()
      .then(rows => rows
        .map(({ blob, ...m }) => m)
        // Same-album tracks may have different artists (compilations); we
        // surface those plainly. Sort by title since we don't have track
        // numbers from yt-dlp/uploads.
        .sort((a, b) => a.title.localeCompare(b.title))),
    [albumName]
  );

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
        <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-ink-700 to-ink-800 flex items-center justify-center text-3xl font-bold text-ink-100 shrink-0">
          {albumName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{albumName}</h1>
          {artistName && (
            <p className="text-sm text-ink-400 truncate">{artistName}</p>
          )}
          <p className="text-xs text-ink-500 mt-0.5">
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
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
