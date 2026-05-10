import { useEffect, useRef, useState } from 'react';
import { searchOverview, getArtistTopTracks, getArtistAlbums, getAlbum } from '../lib/discover.js';
import { useDownloadQueue } from '../hooks/useDownloadQueue.jsx';
import { checkHelperHealth } from '../lib/youtubeHelper.js';
import SongActionSheet from './SongActionSheet.jsx';

// Browse Deezer's catalog. Type → debounced search → tap a result to open
// the action sheet (Download / Add to playlist). No more inline `+` button —
// the user's mental model is "tap the song to do something with it", which
// matches Spotify / Apple Music exactly.

export default function Discover() {
  const [helperOk, setHelperOk] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState({ kind: 'overview' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTrack, setActiveTrack] = useState(null);
  const reqRef = useRef(0);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const ok = await checkHelperHealth();
      if (active) setHelperOk(ok);
    };
    check();
    const id = setInterval(check, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (view.kind !== 'overview') return;
    const q = query.trim();
    if (q.length < 2) {
      setData(null);
      setError(null);
      return;
    }
    const myReq = ++reqRef.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const r = await searchOverview(q);
        if (myReq === reqRef.current) {
          setData(r);
          setLoading(false);
        }
      } catch (err) {
        if (myReq === reqRef.current) {
          setError(err.message);
          setLoading(false);
        }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, view.kind]);

  useEffect(() => {
    const myReq = ++reqRef.current;
    if (view.kind === 'artist') {
      setLoading(true);
      setError(null);
      Promise.all([
        getArtistTopTracks(view.artist.id),
        getArtistAlbums(view.artist.id)
      ]).then(([tracks, albums]) => {
        if (myReq === reqRef.current) {
          setData({ tracks, albums });
          setLoading(false);
        }
      }).catch(err => {
        if (myReq === reqRef.current) {
          setError(err.message);
          setLoading(false);
        }
      });
    } else if (view.kind === 'album') {
      setLoading(true);
      setError(null);
      getAlbum(view.album.id).then(album => {
        if (myReq === reqRef.current) {
          setData({ album });
          setLoading(false);
        }
      }).catch(err => {
        if (myReq === reqRef.current) {
          setError(err.message);
          setLoading(false);
        }
      });
    }
  }, [view]);

  // Helper UX: rather than hiding the panel, surface a soft inline notice.
  // The search input still works (Deezer hits will fail until helper is up).
  const helperWarning = helperOk === false
    ? 'Helper offline — start the helper on your laptop to see results.'
    : null;

  // Convert a Deezer track into the shape SongActionSheet wants. Both Deezer
  // overview tracks and album-tracks have slightly different shapes, so we
  // normalize before passing.
  const openSheet = track => {
    const artistName = track.artist?.name || track.artist || '';
    setActiveTrack({
      id: track.id,
      title: track.title,
      artist: artistName,
      album: track.album || null,
      duration: track.duration || null,
      coverUrl: track.album?.cover_xl || track.album?.cover_big || null
    });
  };

  return (
    <div className="flex flex-col">
      <div
        className="sticky top-0 z-[1] bg-ink-950/95 backdrop-blur-xl px-4 pt-3 pb-3 border-b border-ink-700/40"
      >
        <SearchInput
          query={query}
          onChange={v => {
            setQuery(v);
            if (view.kind !== 'overview') setView({ kind: 'overview' });
          }}
          placeholder="Artists, songs, albums"
        />
        {(view.kind === 'artist' || view.kind === 'album') && (
          <button
            onClick={() => setView({ kind: 'overview' })}
            className="mt-2 text-[11px] uppercase tracking-wider text-ink-400 hover:text-ink-200"
          >
            ← Back to results
          </button>
        )}
        {helperWarning && (
          <p className="mt-2 text-[11px] text-amber-400">{helperWarning}</p>
        )}
      </div>

      <div>
        {loading && <Hint>Searching…</Hint>}
        {error && <Hint className="text-red-400">{error}</Hint>}
        {!loading && !error && view.kind === 'overview' && (
          query.trim().length < 2
            ? <Hint>Type to search — try "Ed Sheeran" or "Heat Waves".</Hint>
            : <OverviewResults
                data={data}
                onArtist={a => setView({ kind: 'artist', artist: a })}
                onAlbum={a => setView({ kind: 'album', album: a })}
                onTrack={openSheet}
              />
        )}
        {!loading && !error && view.kind === 'artist' && (
          <DiscoverArtistView
            artist={view.artist}
            data={data}
            onAlbum={a => setView({ kind: 'album', album: a })}
            onTrack={openSheet}
          />
        )}
        {!loading && !error && view.kind === 'album' && (
          <DiscoverAlbumView album={data?.album} onTrack={openSheet} />
        )}
      </div>

      {activeTrack && (
        <SongActionSheet
          track={activeTrack}
          onClose={() => setActiveTrack(null)}
        />
      )}
    </div>
  );
}

// ─── Big search input ──────────────────────────────────────────────────

export function SearchInput({ query, onChange, placeholder, autoFocus }) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="text"
        inputMode="search"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={query}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-ink-100 text-ink-900 rounded-full pl-11 pr-4 py-3.5 text-base font-medium placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );
}

function Hint({ children, className = '' }) {
  return <p className={`px-4 py-6 text-xs text-ink-400 ${className}`}>{children}</p>;
}

// ─── Result blocks ─────────────────────────────────────────────────────

function OverviewResults({ data, onArtist, onAlbum, onTrack }) {
  if (!data) return null;
  return (
    <div className="px-3 py-3 space-y-5">
      {data.artists?.length > 0 && (
        <Section title="Artists">
          {data.artists.map(a => (
            <button
              key={a.id}
              onClick={() => onArtist(a)}
              className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-ink-800 active:bg-ink-800 text-left"
            >
              <img src={a.picture_small} alt="" className="w-10 h-10 rounded-full object-cover bg-ink-700" />
              <span className="text-sm text-ink-100 truncate">{a.name}</span>
            </button>
          ))}
        </Section>
      )}
      {data.tracks?.length > 0 && (
        <Section title="Songs">
          {data.tracks.map(t => <TrackRow key={t.id} track={t} onOpen={onTrack} />)}
        </Section>
      )}
      {data.albums?.length > 0 && (
        <Section title="Albums">
          {data.albums.map(al => (
            <AlbumRow key={al.id} album={al} onClick={() => onAlbum(al)} />
          ))}
        </Section>
      )}
    </div>
  );
}

function DiscoverArtistView({ artist, data, onAlbum, onTrack }) {
  const [tab, setTab] = useState('songs');
  if (!data) return null;
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-3 mb-4 px-1">
        {artist.picture_medium && (
          <img src={artist.picture_medium} alt="" className="w-14 h-14 rounded-full object-cover" />
        )}
        <h4 className="text-lg font-semibold text-ink-100 truncate">{artist.name}</h4>
      </div>
      <div className="flex gap-1 mb-3 border-b border-ink-700/60">
        <Tab active={tab === 'songs'} onClick={() => setTab('songs')}>Songs</Tab>
        <Tab active={tab === 'albums'} onClick={() => setTab('albums')}>Albums</Tab>
      </div>
      {tab === 'songs' && (
        <div className="space-y-1">
          {data.tracks?.map(t => <TrackRow key={t.id} track={t} onOpen={onTrack} />)}
        </div>
      )}
      {tab === 'albums' && (
        <div className="space-y-1">
          {data.albums?.map(al => (
            <AlbumRow key={al.id} album={al} onClick={() => onAlbum(al)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DiscoverAlbumView({ album, onTrack }) {
  const { enqueue } = useDownloadQueue();
  if (!album) return null;
  const handleAddAll = () => {
    const cover = album.cover_xl || album.cover_big;
    for (const t of album.tracks) {
      enqueue(`${album.artist?.name || ''} - ${t.title}`.trim(), {
        expectedArtist: album.artist?.name,
        expectedTitle: t.title,
        expectedDuration: t.duration,
        expectedCoverUrl: cover
      });
    }
  };
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-3 mb-3 px-1">
        {album.cover_medium && (
          <img src={album.cover_medium} alt="" className="w-16 h-16 rounded object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-ink-100 truncate">{album.title}</p>
          <p className="text-xs text-ink-400 truncate">
            {album.artist?.name}{album.release_date ? ` · ${album.release_date.slice(0, 4)}` : ''}
          </p>
        </div>
      </div>
      <button
        onClick={handleAddAll}
        className="w-full mb-3 px-3 py-2.5 rounded-full bg-accent text-ink-900 text-sm font-semibold active:scale-[0.98]"
      >
        Download all {album.tracks.length} tracks
      </button>
      <div className="space-y-1">
        {album.tracks.map((t, i) => (
          <TrackRow
            key={t.id}
            track={{ ...t, artist: t.artist || album.artist, album }}
            number={i + 1}
            onOpen={onTrack}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Atoms ─────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <h5 className="px-1 mb-1.5 text-[11px] uppercase tracking-widest text-ink-500">
        {title}
      </h5>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        'px-3 py-2 text-sm font-medium border-b-2 -mb-px ' +
        (active ? 'border-accent text-ink-100' : 'border-transparent text-ink-400 hover:text-ink-200')
      }
    >
      {children}
    </button>
  );
}

function TrackRow({ track, number, onOpen }) {
  // Whole row + ⋮ both open the action sheet; the kebab is the visual cue.
  return (
    <div
      onClick={() => onOpen(track)}
      className="flex items-center gap-2 p-2 rounded-lg active:bg-ink-800 cursor-pointer"
    >
      {number ? (
        <span className="w-6 text-center text-[11px] text-ink-500 tabular-nums">{number}</span>
      ) : (
        <img
          src={track.album?.cover_small}
          alt=""
          className="w-10 h-10 rounded object-cover bg-ink-700 shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink-100 truncate">{track.title}</p>
        <p className="text-[11px] text-ink-400 truncate">{track.artist?.name || track.artist}</p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onOpen(track); }}
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-ink-400 hover:text-ink-100 active:text-ink-100"
        aria-label="Track options"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
    </div>
  );
}

function AlbumRow({ album, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-ink-800 active:bg-ink-800 text-left"
    >
      <img src={album.cover_small} alt="" className="w-10 h-10 rounded object-cover bg-ink-700" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink-100 truncate">{album.title}</p>
        <p className="text-[11px] text-ink-400 truncate">
          {album.artist?.name}{album.nb_tracks ? ` · ${album.nb_tracks} tracks` : ''}
        </p>
      </div>
    </button>
  );
}
