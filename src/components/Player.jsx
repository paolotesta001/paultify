import { usePlayer } from '../hooks/usePlayer.jsx';
import Controls from './Controls.jsx';
import ProgressBar from './ProgressBar.jsx';
import Lyrics from './Lyrics.jsx';
import { Down } from './Icons.jsx';

export default function Player({ onClose }) {
  const { currentSong } = usePlayer();
  if (!currentSong) return null;

  return (
    <div className="fixed inset-0 z-30 bg-gradient-to-b from-ink-800 via-ink-900 to-ink-950 flex flex-col">
      <header className="flex items-center justify-between px-4 pt-3 pb-2">
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center text-ink-200"
          aria-label="Close player"
        >
          <Down size={28} />
        </button>
        <div className="text-center text-xs uppercase tracking-widest text-ink-400">
          Now Playing
        </div>
        <div className="w-10 h-10" />
      </header>

      <div className="flex-1 min-h-0">
        <Lyrics />
      </div>

      <footer className="px-6 pt-2 pb-6 bg-ink-950/40 backdrop-blur-md">
        <div className="mb-3">
          <h2 className="text-lg font-semibold truncate">{currentSong.title}</h2>
          <p className="text-sm text-ink-400 truncate">{currentSong.artist}</p>
        </div>
        <ProgressBar />
        <div className="mt-4">
          <Controls size="lg" />
        </div>
      </footer>
    </div>
  );
}
