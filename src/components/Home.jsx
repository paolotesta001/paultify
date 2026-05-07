import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { usePlayer } from '../hooks/usePlayer.jsx';
import { Music, Play } from './Icons.jsx';

// Spotify-style landing page. Pulls everything from the local DB; renders a
// greeting, recently-played rail, your playlists rail, top artists, and a
// scroll-friendly "all songs" list at the bottom.
//
// Each section is a no-op when its source data is empty, so a brand-new
// install shows a clean "let's get started" state rather than blank rails.
export default function Home({ onOpen, onPlay }) {
  const { currentSong, playFromQueue } = usePlayer();

  // All non-Blob columns. We filter for Recents (must have lastPlayedAt) and
  // re-derive top artists from the same set, so a single read powers most
  // sections.
  const songs = useLiveQuery(
    () => db.songs.orderBy('addedAt').reverse().toArray()
      .then(rows => rows.map(({ blob, ...m }) => m)),
    []
  );
  const playlists = useLiveQuery(
    () => db.playlists.orderBy('createdAt').reverse().limit(10).toArray(),
    []
  );

  const recent = useMemo(() => {
    if (!songs) return [];
    return songs
      .filter(s => s.lastPlayedAt)
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, 8);
  }, [songs]);

  const topArtists = useMemo(() => {
    if (!songs) return [];
    const counts = new Map();
    for (const s of songs) {
      const a = s.artist?.trim();
      if (!a) continue;
      counts.set(a, (counts.get(a) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [songs]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const handlePlaySong = async song => {
    if (!songs) return;
    const ids = songs.map(s => s.id);
    const start = ids.indexOf(song.id);
    await playFromQueue(ids, start === -1 ? 0 : start);
    onPlay?.();
  };

  const handleShuffle = async () => {
    if (!songs?.length) return;
    const shuffled = [...songs].map(s => s.id).sort(() => Math.random() - 0.5);
    await playFromQueue(shuffled, 0);
    onPlay?.();
  };

  const isEmpty = songs && songs.length === 0;

  return (
    <div className="pb-6">
      <header className="px-4 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{greeting}</h1>
        {songs?.length > 0 && (
          <button
            onClick={handleShuffle}
            className="px-3 py-1.5 rounded-full bg-ink-800 text-ink-100 text-xs font-medium active:scale-95"
          >
            Shuffle all
          </button>
        )}
      </header>

      {isEmpty && (
        <EmptyState
          onSearch={() => onOpen({ kind: 'tab', id: 'search' })}
          onPlaylists={() => onOpen({ kind: 'tab', id: 'playlists' })}
        />
      )}

      {recent.length > 0 && (
        <Section title="Recently played">
          <Rail>
            {recent.map(song => (
              <RailCard
                key={song.id}
                title={song.title}
                subtitle={song.artist}
                active={currentSong?.id === song.id}
                onClick={() => handlePlaySong(song)}
              >
                <Music size={28} />
              </RailCard>
            ))}
          </Rail>
        </Section>
      )}

      {playlists?.length > 0 && (
        <Section title="Your playlists" actionLabel="See all" onAction={() => onOpen({ kind: 'tab', id: 'playlists' })}>
          <Rail>
            {playlists.map(p => (
              <RailCard
                key={p.id}
                title={p.name}
                subtitle={`${p.songIds.length} ${p.songIds.length === 1 ? 'song' : 'songs'}`}
                onClick={() => onOpen({ kind: 'playlist', id: p.id })}
                accent
              >
                <span className="text-3xl font-bold">{p.name.slice(0, 1).toUpperCase()}</span>
              </RailCard>
            ))}
          </Rail>
        </Section>
      )}

      {topArtists.length > 0 && (
        <Section title="Top artists">
          <Rail>
            {topArtists.map(a => (
              <button
                key={a.name}
                onClick={() => onOpen({ kind: 'artist', name: a.name })}
                className="shrink-0 w-28 text-center"
              >
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-ink-700 to-ink-800 flex items-center justify-center text-2xl font-bold text-ink-100 mx-auto">
                  {a.name.slice(0, 1).toUpperCase()}
                </div>
                <p className="mt-2 text-xs font-medium text-ink-100 truncate px-1">{a.name}</p>
                <p className="text-[10px] text-ink-400">
                  {a.count} {a.count === 1 ? 'song' : 'songs'}
                </p>
              </button>
            ))}
          </Rail>
        </Section>
      )}

      {songs && songs.length > 0 && (
        <section className="mt-2 px-4">
          <h2 className="text-base font-semibold mb-2">Library</h2>
          <button
            onClick={() => onOpen({ kind: 'all-songs' })}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-ink-800/60 border border-ink-700/60 active:bg-ink-700/60 text-left"
          >
            <div className="w-14 h-14 rounded bg-gradient-to-br from-accent/40 to-accent-dim/30 flex items-center justify-center text-ink-100 shrink-0">
              <Music size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink-100">All songs</p>
              <p className="text-xs text-ink-400">
                {songs.length} {songs.length === 1 ? 'track' : 'tracks'} · tap to browse
              </p>
            </div>
            <span className="text-ink-500">›</span>
          </button>
        </section>
      )}
    </div>
  );
}

// ─── Layout atoms ───────────────────────────────────────────────────────

function Section({ title, actionLabel, onAction, children }) {
  return (
    <section className="mt-2 mb-3">
      <div className="px-4 mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {actionLabel && (
          <button
            onClick={onAction}
            className="text-[11px] uppercase tracking-wider text-ink-400 hover:text-ink-200"
          >
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Rail({ children }) {
  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar snap-x snap-mandatory">
      {children}
    </div>
  );
}

function RailCard({ title, subtitle, onClick, active, accent, children }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 w-32 text-left snap-start"
    >
      <div
        className={
          'w-32 h-32 rounded-lg flex items-center justify-center text-ink-100 mb-2 ' +
          (accent
            ? 'bg-gradient-to-br from-accent/40 to-accent-dim/30'
            : 'bg-ink-800')
        }
      >
        {children}
      </div>
      <p
        className={
          'text-sm font-medium truncate ' +
          (active ? 'text-accent' : 'text-ink-100')
        }
      >
        {title}
      </p>
      {subtitle && (
        <p className="text-[11px] text-ink-400 truncate">{subtitle}</p>
      )}
    </button>
  );
}

function EmptyState({ onSearch, onPlaylists }) {
  return (
    <div className="px-4 pt-4 pb-12">
      <div className="rounded-2xl bg-gradient-to-br from-ink-800 to-ink-900 border border-ink-700/60 p-6 text-center">
        <div className="text-5xl mb-3">🎧</div>
        <h2 className="text-lg font-semibold mb-1">Your library is empty</h2>
        <p className="text-sm text-ink-400 mb-5">
          Search for a song to download it, or import a Spotify playlist.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onSearch}
            className="px-4 py-2 rounded-full bg-accent text-ink-900 text-sm font-semibold"
          >
            Search music
          </button>
          <button
            onClick={onPlaylists}
            className="px-4 py-2 rounded-full bg-ink-700 text-ink-100 text-sm font-medium"
          >
            Import playlist
          </button>
        </div>
      </div>
    </div>
  );
}
