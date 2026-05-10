import { useState } from 'react';
import { usePlayer } from '../hooks/usePlayer.jsx';
import { useDownloadQueue } from '../hooks/useDownloadQueue.jsx';
import Controls from './Controls.jsx';
import ProgressBar from './ProgressBar.jsx';
import Lyrics from './Lyrics.jsx';
import { Music } from './Icons.jsx';

// Single-screen player. Album art on top, controls underneath, a low-on-
// screen "Back to library" button. Lyrics are NOT in a long scroll — they
// open as a separate fullscreen window so closing the lyrics returns you
// straight to the album art (no scroll-up frustration).
export default function Player({ onClose }) {
  const { currentSong } = usePlayer();
  const { enqueue } = useDownloadQueue();
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  if (!currentSong) return null;

  // Streamed track: lives only in memory; user can hit "Save" to enqueue
  // a real download into the library.
  const handleSave = () => {
    if (!currentSong.streamQuery) return;
    enqueue(currentSong.streamQuery, {
      expectedTitle: currentSong.title,
      expectedArtist: currentSong.artist,
      expectedDuration: currentSong.duration
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col bg-gradient-to-b from-ink-800 via-ink-900 to-ink-950"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 8px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)'
      }}
    >
      <header className="flex items-center justify-between px-5 py-2">
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center text-ink-300 active:text-ink-100"
          aria-label="Close player"
        >
          ✕
        </button>
        <span className="text-[10px] uppercase tracking-widest text-ink-500">
          {currentSong.isStream ? 'Streaming' : 'Now Playing'}
        </span>
        {currentSong.isStream ? (
          <button
            onClick={handleSave}
            disabled={savedFlash}
            className="px-3 h-10 flex items-center text-xs font-semibold text-accent active:text-accent-dim"
          >
            {savedFlash ? '✓ Saving' : '↓ Save'}
          </button>
        ) : (
          <div className="w-10" />
        )}
      </header>

      <div className="flex-1 flex items-center justify-center min-h-0 px-5">
        <AlbumArt coverUrl={currentSong.coverUrl} title={currentSong.title} />
      </div>

      <div className="px-5 mb-3">
        <h2 className="text-2xl font-bold truncate">{currentSong.title}</h2>
        <p className="text-sm text-ink-400 truncate">{currentSong.artist}</p>
      </div>

      <div className="px-5">
        <ProgressBar />
      </div>

      <div className="px-5 mt-4">
        <Controls size="lg" showShuffle />
      </div>

      <div className="px-5 mt-4 flex items-center justify-center gap-3">
        <button
          onClick={() => setLyricsOpen(true)}
          className="px-5 py-2.5 rounded-full bg-ink-100 text-ink-900 text-sm font-semibold active:scale-95"
        >
          Lyrics
        </button>
        <button
          onClick={onClose}
          className="px-5 py-2.5 rounded-full bg-ink-800/80 active:bg-ink-700 text-ink-200 text-sm font-medium flex items-center gap-2"
        >
          <span className="text-base">▼</span>
          Back
        </button>
      </div>

      {lyricsOpen && (
        <LyricsWindow song={currentSong} onClose={() => setLyricsOpen(false)} />
      )}
    </div>
  );
}

function AlbumArt({ coverUrl, title }) {
  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt={title}
        className="w-full max-w-[420px] aspect-square rounded-xl object-cover shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      />
    );
  }
  return (
    <div className="w-full max-w-[420px] aspect-square rounded-xl bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900 flex items-center justify-center text-ink-500 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
      <Music size={96} />
    </div>
  );
}

// Fullscreen lyrics overlay. Tapping × dismisses and returns to the album-
// art view. The Lyrics component itself owns the Karaoke / Big switch.
function LyricsWindow({ song, onClose }) {
  return (
    <div className="fixed inset-0 z-40 bg-ink-950 flex flex-col"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 8px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)'
      }}
    >
      <header className="flex items-center justify-between px-4 py-2">
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center text-ink-300 active:text-ink-100 text-xl"
          aria-label="Close lyrics"
        >
          ✕
        </button>
        <div className="text-center min-w-0 flex-1 px-2">
          <p className="text-sm font-semibold truncate">{song.title}</p>
          <p className="text-[11px] text-ink-400 truncate">{song.artist}</p>
        </div>
        <div className="w-10" />
      </header>
      <div className="flex-1 min-h-0">
        <Lyrics />
      </div>
      {/* Bottom dismiss for thumb-reach. */}
      <div className="px-5 pt-2">
        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 rounded-full bg-ink-800 active:bg-ink-700 text-ink-200 text-sm font-medium flex items-center justify-center gap-2"
        >
          <span>▼</span>
          Close lyrics
        </button>
      </div>
    </div>
  );
}
