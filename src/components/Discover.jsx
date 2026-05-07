import { useEffect, useRef, useState } from 'react';
import { searchOverview, getArtistTopTracks, getArtistAlbums, getAlbum } from '../lib/discover.js';
import { useDownloadQueue } from '../hooks/useDownloadQueue.jsx';
import { checkHelperHealth } from '../lib/youtubeHelper.js';

// Browse Deezer's catalog. As you type, fetches matching tracks/artists/
// albums. Click an artist → top songs + albums; click an album → its full
// tracklist. Every track has a "+" that enqueues it for download.
//
// Used as the body of the Search tab. Mobile-first; on desktop it sits in
// the same flexible content column as everything else.
export default function Discover() {
  const [helperOk, setHelperOk] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState({ kind: 'overview' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqRef = useRef(0);

  // Helper status — without it Deezer can't be reached.
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

  // Debounced overview search whenever the query changes (and we're in the
  // overview view). 300ms feels responsive without spamming Deezer on every
  // keystroke.
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

  // Whenever the view changes to an artist or album, fetch its detail.
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

  if (helperOk === false) {
    return (
      <Hint>
        Helper not running — start <code className="text-accent">npm run helper</code> to use Discover.
      </Hint>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-[1] bg-ink-950/95 backdrop-blur-xl px-4 pt-3 pb-3 border-b border-ink-700/40">
        <input
          type="text"
          inputMode="search"
          placeholder="Search artists, songs, albums…"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            if (view.kind !== 'overview') setView({ kind: 'overview' });
          }}
          className="w-full bg-ink-800 rounded-full px-4 py-2.5 text-sm placeholder-ink-500 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {(view.kind === 'artist' || view.kind === 'album') && (
          <button
            onClick={() => setView({ kind: 'overview' })}
            className="mt-2 text-[11px] uppercase tracking-wider text-ink-400 hover:text-ink-200"
          >
            ← Back to results
          </button>
        )}
      </div>

      <div>
        {loading && <Hint>Searching…</Hint>}
        {error && <Hint className="text-red-400">{error}</Hint>}
        {!loading && !error && view.kind === 'overview' && (
          query.trim().length < 2
            ? <Hint>Type to search — try "Ed Sheeran" or "Heat Waves".</Hint>
            : <OverviewResults data={data} onArtist={a => setView({ kind: 'artist', artist: a })} onAlbum={a => setView({ kind: 'album', album: a })} />
        )}
        {!loading && !error && view.kind === 'artist' && (
          <DiscoverArtistView
            artist={view.artist}
            data={data}
            onAlbum={a => setView({ kind: 'album', album: a })}
          />
        )}
        {!loading && !error && view.kind === 'album' && (
          <DiscoverAlbumView album={data?.album} />
        )}
      </div>
    </div>
  );
}

function Hint({ children, className = '' }) {
  return <p className={`px-4 py-6 text-xs text-ink-400 ${className}`}>{children}</p>;
}

// ─── Result blocks ──────────────────────────────────────────────────────

function OverviewResults({ data, onArtist, onAlbum }) {
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
              <img src={a.picture_small} alt="" className="w-9 h-9 rounded-full object-cover bg-ink-700" />
              <span className="text-sm text-ink-100 truncate">{a.name}</span>
            </button>
          ))}
        </Section>
      )}
      {data.tracks?.length > 0 && (
        <Section title="Songs">
          {data.tracks.map(t => <TrackRow key={t.id} track={t} />)}
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

function DiscoverArtistView({ artist, data, onAlbum }) {
  const [tab, setTab] = useState('songs');
  if (!data) return null;
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-3 mb-4 px-1">
        {artist.picture_medium && (
          <img src={artist.picture_medium} alt="" className="w-12 h-12 rounded-full object-cover" />
        )}
        <h4 className="text-base font-semibold text-ink-100 truncate">{artist.name}</h4>
      </div>
      <div className="flex gap-1 mb-3 border-b border-ink-700/60">
        <Tab active={tab === 'songs'} onClick={() => setTab('songs')}>Songs</Tab>
        <Tab active={tab === 'albums'} onClick={() => setTab('albums')}>Albums</Tab>
      </div>
      {tab === 'songs' && (
        <div className="space-y-1">
          {data.tracks?.map(t => <TrackRow key={t.id} track={t} />)}
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

function DiscoverAlbumView({ album }) {
  const { enqueue } = useDownloadQueue();
  if (!album) return null;
  const handleAddAll = () => {
    for (const t of album.tracks) {
      enqueue(`${album.artist?.name || ''} - ${t.title}`.trim());
    }
  };
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-3 mb-3 px-1">
        {album.cover_medium && (
          <img src={album.cover_medium} alt="" className="w-14 h-14 rounded object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-100 truncate">{album.title}</p>
          <p className="text-[11px] text-ink-400 truncate">
            {album.artist?.name}{album.release_date ? ` · ${album.release_date.slice(0, 4)}` : ''}
          </p>
        </div>
      </div>
      <button
        onClick={handleAddAll}
        className="w-full mb-3 px-3 py-2 rounded-lg bg-accent text-ink-900 text-xs font-semibold active:scale-[0.98]"
      >
        Add all {album.tracks.length} tracks
      </button>
      <div className="space-y-1">
        {album.tracks.map((t, i) => (
          <TrackRow
            key={t.id}
            track={{ ...t, artist: t.artist || album.artist }}
            number={i + 1}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Atoms ──────────────────────────────────────────────────────────────

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
        'px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ' +
        (active ? 'border-accent text-ink-100' : 'border-transparent text-ink-400 hover:text-ink-200')
      }
    >
      {children}
    </button>
  );
}

function TrackRow({ track, number }) {
  const { enqueue } = useDownloadQueue();
  const [added, setAdded] = useState(false);
  const handle = () => {
    enqueue(`${track.artist?.name || ''} - ${track.title}`.trim());
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-ink-800 group">
      {number ? (
        <span className="w-6 text-center text-[11px] text-ink-500 tabular-nums">{number}</span>
      ) : (
        <img
          src={track.album?.cover_small}
          alt=""
          className="w-9 h-9 rounded object-cover bg-ink-700"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink-100 truncate">{track.title}</p>
        <p className="text-[11px] text-ink-400 truncate">{track.artist?.name}</p>
      </div>
      <button
        onClick={handle}
        className={
          'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base font-medium transition-colors ' +
          (added
            ? 'bg-accent text-ink-900'
            : 'bg-ink-700 text-ink-100 hover:bg-ink-600 active:bg-ink-600')
        }
        aria-label="Add to download queue"
      >
        {added ? '✓' : '+'}
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
      <img src={album.cover_small} alt="" className="w-9 h-9 rounded object-cover bg-ink-700" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink-100 truncate">{album.title}</p>
        <p className="text-[11px] text-ink-400 truncate">
          {album.artist?.name}{album.nb_tracks ? ` · ${album.nb_tracks} tracks` : ''}
        </p>
      </div>
    </button>
  );
}
