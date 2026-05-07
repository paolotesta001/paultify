import { useState } from 'react';
import Library from './Library.jsx';
import Playlists from './Playlists.jsx';
import PlaylistView from './PlaylistView.jsx';

// Inner navigation for the main column. Two top-level tabs (Library /
// Playlists) plus a drilled-in playlist view. Kept here so the rest of the
// app doesn't need to know which sub-view is active.
export default function MainPanel({ onPlay }) {
  const [view, setView] = useState({ kind: 'library' });

  const tab = view.kind === 'library' ? 'library' : 'playlists';

  return (
    <div className="flex flex-col h-full">
      <nav className="sticky top-0 z-10 bg-ink-950/95 backdrop-blur border-b border-ink-700/60">
        <div className="max-w-2xl mx-auto px-4 flex">
          <TabButton active={tab === 'library'} onClick={() => setView({ kind: 'library' })}>
            Library
          </TabButton>
          <TabButton active={tab === 'playlists'} onClick={() => setView({ kind: 'playlists' })}>
            Playlists
          </TabButton>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        {view.kind === 'library' && <Library onPlay={onPlay} />}
        {view.kind === 'playlists' && (
          <Playlists onOpen={id => setView({ kind: 'playlist', id })} />
        )}
        {view.kind === 'playlist' && (
          <PlaylistView
            playlistId={view.id}
            onBack={() => setView({ kind: 'playlists' })}
            onPlay={onPlay}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ' +
        (active
          ? 'border-accent text-ink-100'
          : 'border-transparent text-ink-400 hover:text-ink-200')
      }
    >
      {children}
    </button>
  );
}
