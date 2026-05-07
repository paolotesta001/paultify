import { usePlayer } from '../hooks/usePlayer.jsx';
import { Play, Pause, Music } from './Icons.jsx';

// Compact playback rail. Sits as a flex item in the App shell, BETWEEN main
// content and the bottom tab bar — so it never overlaps the iOS home
// indicator or the tab buttons. Tapping the body opens the full Player;
// the inline buttons stop their click from propagating.
export default function MiniPlayer({ onExpand }) {
  const { currentSong, isPlaying, togglePlay, stop } = usePlayer();
  if (!currentSong) return null;

  return (
    <div
      onClick={onExpand}
      className="border-t border-ink-700/60 bg-ink-800/95 backdrop-blur cursor-pointer"
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="w-9 h-9 rounded bg-ink-700 flex items-center justify-center text-ink-300 shrink-0">
          <Music size={16} />
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <p className="text-xs font-medium truncate">{currentSong.title}</p>
          <p className="text-[10px] text-ink-400 truncate">{currentSong.artist}</p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); togglePlay(); }}
          className="w-9 h-9 flex items-center justify-center text-ink-100 shrink-0"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          onClick={e => { e.stopPropagation(); stop(); }}
          className="w-8 h-8 flex items-center justify-center text-ink-400 hover:text-ink-100 text-lg leading-none shrink-0"
          aria-label="Close player"
        >
          ×
        </button>
      </div>
    </div>
  );
}
