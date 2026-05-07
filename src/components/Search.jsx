import YouTubeSearch from './YouTubeSearch.jsx';
import Discover from './Discover.jsx';
import UploadZone from './UploadZone.jsx';

// The "Search" tab: combines all three ways of getting music in.
//   - Quick Add: type → enqueues yt-dlp directly
//   - Discover (Deezer): browse and tap to enqueue
//   - Upload: drag MP3 files in
// All three feed the same download queue; users can leave the tab while
// downloads run in the background.
export default function Search() {
  return (
    <div className="pb-6">
      <header className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold mb-1">Search & download</h1>
        <p className="text-sm text-ink-400">
          Type a song, browse by artist, or drop your own MP3s.
        </p>
      </header>

      <div className="px-4 pt-3">
        <YouTubeSearch />
      </div>

      <div className="mt-1">
        <Discover />
      </div>

      <details className="px-4 mt-6">
        <summary className="text-xs uppercase tracking-widest text-ink-400 cursor-pointer select-none">
          Or upload your own files
        </summary>
        <div className="mt-3">
          <UploadZone />
        </div>
      </details>
    </div>
  );
}
