import { usePlayer } from '../hooks/usePlayer.jsx';
import { Play, Pause, Next, Prev } from './Icons.jsx';

// Playback controls — used in the full-screen Player. Optional shuffle
// toggle on the left lights up green when active.
export default function Controls({ size = 'lg', showShuffle = false }) {
  const { isPlaying, togglePlay, next, prev, shuffle, toggleShuffle } = usePlayer();
  const playSize = size === 'lg' ? 36 : 24;
  const sideSize = size === 'lg' ? 28 : 20;
  return (
    <div className="flex items-center justify-around">
      {showShuffle && (
        <button
          onClick={toggleShuffle}
          className={
            'w-12 h-12 flex items-center justify-center transition-colors ' +
            (shuffle ? 'text-accent' : 'text-ink-400 active:text-ink-200')
          }
          aria-label="Shuffle"
        >
          <ShuffleIcon size={22} />
        </button>
      )}
      <button
        onClick={prev}
        className="w-12 h-12 flex items-center justify-center text-ink-200 active:text-white"
        aria-label="Previous"
      >
        <Prev size={sideSize} />
      </button>
      <button
        onClick={togglePlay}
        className="w-16 h-16 flex items-center justify-center rounded-full bg-white text-ink-900 active:scale-95 transition-transform"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={playSize} /> : <Play size={playSize} />}
      </button>
      <button
        onClick={next}
        className="w-12 h-12 flex items-center justify-center text-ink-200 active:text-white"
        aria-label="Next"
      >
        <Next size={sideSize} />
      </button>
      {showShuffle && <div className="w-12" />}
    </div>
  );
}

function ShuffleIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}
