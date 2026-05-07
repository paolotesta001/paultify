import { useState } from 'react';
import { fetchSpotifyDetails } from '../lib/spotifyImport.js';
import { createPlaylist } from '../lib/playlists.js';
import { useDownloadQueue } from '../hooks/useDownloadQueue.jsx';

// Two-step UI:
//   1. Paste URL → click "Fetch" → preview track count + name
//   2. Click "Import N tracks" → playlist created, every track enqueued
//      with playlistId + expected metadata (so dedup + auto-link work).
//
// We don't auto-import on first click so the user can confirm before
// queuing a 200-song download.
export default function SpotifyImport({ onImported }) {
  const { enqueue } = useDownloadQueue();
  const [url, setUrl] = useState('');
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setUrl('');
    setDetails(null);
    setError(null);
  };

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setDetails(null);
    try {
      const data = await fetchSpotifyDetails(url.trim());
      if (!data.tracks?.length) {
        throw new Error('No tracks found at that URL.');
      }
      setDetails(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!details) return;
    setImporting(true);
    try {
      // Create the playlist immediately so the user can navigate to it and
      // watch songs trickle in as the queue processes them.
      const playlistName = details.name || 'Spotify import';
      const playlistId = await createPlaylist(playlistName);

      for (const track of details.tracks) {
        // yt-dlp's ytsearch1 gets the best match for "Artist - Title".
        enqueue(`${track.artist} - ${track.title}`, {
          playlistId,
          expectedArtist: track.artist,
          expectedTitle: track.title
        });
      }

      // Hand control back to the parent — typically navigates to the new
      // playlist so the user sees songs landing.
      onImported?.(playlistId);
      reset();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-xl bg-ink-800/60 border border-ink-700 p-3 mb-5">
      <div className="flex items-center gap-2 mb-2">
        <svg viewBox="0 0 24 24" width="18" height="18" className="text-[#1DB954]" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 1 1-.277-1.215c3.81-.871 7.077-.496 9.713 1.115a.623.623 0 0 1 .206.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 1 1-.452-1.494c3.632-1.102 8.147-.568 11.232 1.331a.78.78 0 0 1 .257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.247 9.726a.935.935 0 1 1-.542-1.79c3.594-1.091 9.467-.881 13.213 1.343a.936.936 0 0 1-.953 1.611z" />
        </svg>
        <h4 className="text-sm font-semibold text-ink-100">Import from Spotify</h4>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="url"
          placeholder="https://open.spotify.com/playlist/…"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleFetch(); }}
          disabled={loading || importing}
          className="flex-1 bg-ink-900 rounded-lg px-3 py-2 text-sm placeholder-ink-500 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
        />
        <button
          onClick={handleFetch}
          disabled={loading || importing || !url.trim()}
          className="px-3 py-2 rounded-lg bg-ink-700 text-ink-100 text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Fetching…' : 'Fetch'}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400 break-words">{error}</p>
      )}

      {details && (
        <div className="mt-3 rounded-lg bg-ink-900/60 border border-ink-700/60 p-3">
          <p className="text-xs uppercase tracking-wider text-ink-500">
            {details.type}
          </p>
          <p className="text-sm font-semibold text-ink-100 truncate">{details.name}</p>
          {details.artist && (
            <p className="text-xs text-ink-400 truncate">{details.artist}</p>
          )}
          <p className="text-xs text-ink-300 mt-1">
            {details.tracks.length} {details.tracks.length === 1 ? 'track' : 'tracks'} found
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex-1 px-3 py-2 rounded-lg bg-accent text-ink-900 text-sm font-semibold disabled:opacity-50 active:scale-[0.98]"
            >
              {importing ? 'Adding to queue…' : `Import ${details.tracks.length} tracks`}
            </button>
            <button
              onClick={reset}
              disabled={importing}
              className="px-3 py-2 rounded-lg bg-ink-700 text-ink-200 text-sm"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-[10px] text-ink-500 leading-relaxed">
            Tracks already in your library are skipped automatically. Keep this
            tab open while the queue runs — closing it cancels pending downloads.
          </p>
        </div>
      )}
    </div>
  );
}
