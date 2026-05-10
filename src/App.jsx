import { useState } from 'react';
import { PlayerProvider } from './hooks/usePlayer.jsx';
import { DownloadQueueProvider } from './hooks/useDownloadQueue.jsx';
import Player from './components/Player.jsx';
import MiniPlayer from './components/MiniPlayer.jsx';
import DownloadQueue from './components/DownloadQueue.jsx';
import BottomTabs from './components/BottomTabs.jsx';
import Home from './components/Home.jsx';
import Search from './components/Search.jsx';
import Add from './components/Add.jsx';
import Playlists from './components/Playlists.jsx';
import PlaylistView from './components/PlaylistView.jsx';
import ArtistView from './components/ArtistView.jsx';
import AlbumView from './components/AlbumView.jsx';
import AllSongsView from './components/AllSongsView.jsx';

// Mobile-first shell with three bottom tabs (Home, Search, Playlists). Each
// tab can drill into a sub-view (artist, album, playlist) without losing
// queue / playback state.
//
// Navigation model:
//   - tab is the bottom-bar selection
//   - sub is a per-tab drill-in. Tab switches reset it.
//   - playerOpen flips on/off to overlay the full-screen player

export default function App() {
  const [tab, setTab] = useState('home');
  const [sub, setSub] = useState(null);
  const [playerOpen, setPlayerOpen] = useState(false);

  const openTarget = target => {
    if (target.kind === 'tab') {
      setTab(target.id);
      setSub(null);
    } else {
      setSub(target);
    }
  };

  const handleTabChange = id => {
    setTab(id);
    setSub(null);
  };

  const showPlayer = () => setPlayerOpen(true);
  const goBack = () => setSub(null);

  let content;
  if (sub?.kind === 'playlist') {
    content = (
      <PlaylistView
        playlistId={sub.id}
        onBack={goBack}
        onPlay={showPlayer}
      />
    );
  } else if (sub?.kind === 'artist') {
    content = (
      <ArtistView
        artistName={sub.name}
        onBack={goBack}
        onPlay={showPlayer}
        onOpen={openTarget}
      />
    );
  } else if (sub?.kind === 'album') {
    content = (
      <AlbumView
        albumName={sub.name}
        artistName={sub.artist}
        onBack={goBack}
        onPlay={showPlayer}
      />
    );
  } else if (sub?.kind === 'all-songs') {
    content = (
      <AllSongsView
        onBack={goBack}
        onPlay={showPlayer}
        onOpen={openTarget}
      />
    );
  } else if (tab === 'home') {
    content = <Home onOpen={openTarget} onPlay={showPlayer} />;
  } else if (tab === 'search') {
    content = <Search />;
  } else if (tab === 'add') {
    // After a Spotify import, jump straight into the new playlist so the
    // user sees songs landing in real time.
    content = (
      <Add onSpotifyImported={id => {
        setTab('playlists');
        setSub({ kind: 'playlist', id });
      }} />
    );
  } else if (tab === 'playlists') {
    content = (
      <Playlists onOpen={id => setSub({ kind: 'playlist', id })} />
    );
  }

  return (
    <DownloadQueueProvider>
      <PlayerProvider>
        <div className="h-full flex flex-col bg-ink-950 text-ink-100">
          <main className="flex-1 min-h-0 overflow-y-auto safe-pt">
            {content}
          </main>
          <MiniPlayer onExpand={showPlayer} />
          <BottomTabs active={tab} onChange={handleTabChange} />
        </div>
        <DownloadQueue />
        {playerOpen && <Player onClose={() => setPlayerOpen(false)} />}
      </PlayerProvider>
    </DownloadQueueProvider>
  );
}
