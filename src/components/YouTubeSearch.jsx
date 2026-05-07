import { useEffect, useState } from 'react';
import { checkHelperHealth } from '../lib/youtubeHelper.js';
import { useDownloadQueue } from '../hooks/useDownloadQueue.jsx';

// "Quick add" bar at the top of the library. Type something + Enter →
// pushed onto the download queue, input clears immediately. The actual
// download happens in the background; status shows in the left sidebar.
export default function YouTubeSearch() {
  const [helperOk, setHelperOk] = useState(null);
  const [query, setQuery] = useState('');
  const { enqueue } = useDownloadQueue();

  useEffect(() => {
    let active = true;
    const check = async () => {
      const ok = await checkHelperHealth();
      if (active) setHelperOk(ok);
    };
    check();
    const id = setInterval(check, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const submit = () => {
    const q = query.trim();
    if (!q) return;
    enqueue(q);
    setQuery('');
  };

  if (helperOk === null) return null;

  if (!helperOk) {
    return (
      <div className="rounded-xl bg-ink-800/60 border border-ink-700 p-4 mb-4 text-sm">
        <p className="text-ink-200 font-medium mb-1">Helper not running.</p>
        <p className="text-ink-400">
          In a second terminal: <code className="text-accent">npm run helper</code>
        </p>
        <p className="text-ink-500 text-xs mt-2">
          One-time prerequisite: <code>winget install yt-dlp</code> +{' '}
          <code>winget install ffmpeg</code>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-ink-800/60 border border-ink-700 p-4 mb-4">
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="search"
          placeholder="Quick add — type a song or paste a YouTube URL"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          className="flex-1 bg-ink-900 rounded-lg px-3 py-2.5 text-sm placeholder-ink-500 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          onClick={submit}
          disabled={!query.trim()}
          className="px-4 py-2.5 rounded-lg bg-accent text-ink-900 text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform"
        >
          Add
        </button>
      </div>
      <p className="mt-2 text-[11px] text-ink-500">
        Returns instantly — track downloads in the queue on the left.
      </p>
    </div>
  );
}
