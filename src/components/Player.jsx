import { useRef } from 'react';
import { usePlayer } from '../hooks/usePlayer.jsx';
import Controls from './Controls.jsx';
import ProgressBar from './ProgressBar.jsx';
import Lyrics from './Lyrics.jsx';
import { Music } from './Icons.jsx';

// Full-screen player. Vertical scroll layout, Spotify-style:
//   Section 1 (first screen) — album art, title, progress, controls,
//                              easy-to-reach "back" button
//   Section 2 (scroll down)  — synced lyrics with the 3-mode switcher
//
// The "Back to library" button lives just below the controls so it sits in
// the bottom thumb zone, where one-handed reach is comfortable. There's
// still a small × at top for habit, but the bottom button is the primary
// way to dismiss.
export default function Player({ onClose }) {
  const { currentSong } = usePlayer();
  const lyricsRef = useRef(null);

  if (!currentSong) return null;

  const scrollToLyrics = () => {
    lyricsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-gradient-to-b from-ink-800 via-ink-900 to-ink-950">
      {/* ─── Section 1: art + controls ─────────────────────────────────── */}
      <section
        className="min-h-screen flex flex-col px-5"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 8px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)'
        }}
      >
        <header className="flex items-center justify-between py-2">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-ink-300 active:text-ink-100"
            aria-label="Close player"
          >
            ✕
          </button>
          <span className="text-[10px] uppercase tracking-widest text-ink-500">
            Now Playing
          </span>
          <div className="w-10" />
        </header>

        {/* Cover gets the lion's share of the screen. Aspect-square keeps
            it visually correct regardless of the viewport ratio. */}
        <div className="flex-1 flex items-center justify-center min-h-0 py-4">
          <AlbumArt coverUrl={currentSong.coverUrl} title={currentSong.title} />
        </div>

        <div className="mb-3">
          <h2 className="text-2xl font-bold truncate">{currentSong.title}</h2>
          <p className="text-sm text-ink-400 truncate">{currentSong.artist}</p>
        </div>

        <ProgressBar />

        <div className="mt-4">
          <Controls size="lg" showShuffle />
        </div>

        {/* Big, low-on-screen dismiss button. Right where your thumb sits. */}
        <button
          onClick={onClose}
          className="mt-5 mx-auto px-6 py-2.5 rounded-full bg-ink-800/80 active:bg-ink-700 text-ink-200 text-sm font-medium flex items-center gap-2"
        >
          <span className="text-base">▼</span>
          Back to library
        </button>

        <button
          onClick={scrollToLyrics}
          className="mt-3 mb-1 mx-auto text-[11px] uppercase tracking-widest text-ink-500 active:text-ink-200 flex items-center gap-1.5"
        >
          Pull for lyrics
          <span className="animate-bounce">↓</span>
        </button>
      </section>

      {/* ─── Section 2: lyrics, full screen worth of space ─────────────── */}
      <section
        ref={lyricsRef}
        className="min-h-screen flex flex-col"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        <div className="flex-1 min-h-0 flex flex-col">
          <Lyrics />
        </div>
        <button
          onClick={onClose}
          className="mt-2 mx-auto px-5 py-2 rounded-full bg-ink-800/80 active:bg-ink-700 text-ink-200 text-sm font-medium"
        >
          ▼ Back to library
        </button>
      </section>
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
  // Fallback when no embedded art was found — gradient block + glyph.
  return (
    <div className="w-full max-w-[420px] aspect-square rounded-xl bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900 flex items-center justify-center text-ink-500 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
      <Music size={96} />
    </div>
  );
}
