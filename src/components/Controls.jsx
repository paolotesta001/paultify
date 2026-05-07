import { usePlayer } from '../hooks/usePlayer.jsx';
import { Play, Pause, Next, Prev } from './Icons.jsx';

// 44×44pt minimum touch target per Apple HIG. We use 56 for the play button
// for comfortable thumb-reach.
export default function Controls({ size = 'lg' }) {
  const { isPlaying, togglePlay, next, prev } = usePlayer();
  const playSize = size === 'lg' ? 36 : 24;
  const sideSize = size === 'lg' ? 28 : 20;
  return (
    <div className="flex items-center justify-center gap-6">
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
    </div>
  );
}
