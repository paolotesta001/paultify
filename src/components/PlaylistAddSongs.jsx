import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { addSongToPlaylist, removeSongFromPlaylist } from '../lib/playlists.js';
import { useDownloadQueue } from '../hooks/useDownloadQueue.jsx';
import { searchOverview } from '../lib/discover.js';
import { checkHelperHealth } from '../lib/youtubeHelper.js';
import { Music } from './Icons.jsx';

// Modal picker for adding songs to a playlist. Two tabs:
//   • Library — songs you already have. Toggling adds/removes immediately.
//   • Search  — Deezer-powered search. Tapping a result enqueues a
//               download with the playlist id, so the song lands in the
//               playlist as soon as the queue finishes (or instantly, if
//               dedup matches an existing library entry).
export default function PlaylistAddSongs({ playlistId, onClose }) {
  const [tab, setTab] = useState('library');

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 bg-ink-950/85 backdrop-blur-sm p-4 flex items-start sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-ink-900 border border-ink-700 rounded-xl w-full max-w-md max-h-[85vh] flex flex-col mt-8 sm:mt-0"
      >
        <header className="px-4 pt-4 pb-2 border-b border-ink-700/60 flex items-center justify-between">
          <h3 className="text-base font-semibold">Add songs</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-ink-400 hover:text-ink-100 text-xl"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="px-3 pt-2 flex gap-1 border-b border-ink-800">
          <TabButton active={tab === 'library'} onClick={() => setTab('library')}>
            Your library
          </TabButton>
          <TabButton active={tab === 'search'} onClick={() => setTab('search')}>
            Search the web
          </TabButton>
        </div>

        {tab === 'library' && <LibraryTab playlistId={playlistId} />}
        {tab === 'search' && <SearchTab playlistId={playlistId} />}

        <div className="px-4 py-3 border-t border-ink-700/60">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg bg-ink-700 text-ink-100 text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        'px-3 py-2 text-xs font-medium border-b-2 -mb-px ' +
        (active ? 'border-accent text-ink-100' : 'border-transparent text-ink-400')
      }
    >
      {children}
    </button>
  );
}

// ─── Library tab ────────────────────────────────────────────────────────

function LibraryTab({ playlistId }) {
  const songs = useLiveQuery(
    () => db.songs.orderBy('addedAt').reverse().toArray()
      .then(rows => rows.map(({ blob, coverBlob, ...m }) => m)),
    []
  );
  const playlist = useLiveQuery(
    () => db.playlists.get(playlistId),
    [playlistId]
  );
  const inPlaylist = useMemo(
    () => new Set(playlist?.songIds || []),
    [playlist]
  );

  const [filter, setFilter] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    if (!songs) return [];
    const q = filter.toLowerCase().trim();
    if (!q) return songs;
    return songs.filter(s =>
      s.title.toLowerCase().includes(q) ||
      (s.artist || '').toLowerCase().includes(q) ||
      (s.album || '').toLowerCase().includes(q)
    );
  }, [songs, filter]);

  const toggle = async song => {
    if (inPlaylist.has(song.id)) {
      await removeSongFromPlaylist(playlistId, song.id);
    } else {
      await addSongToPlaylist(playlistId, song.id);
    }
  };

  return (
    <>
      <div className="px-3 pt-3 pb-2">
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          placeholder="Filter your library…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full bg-ink-800 rounded-lg px-3 py-2 text-sm placeholder-ink-500 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <p className="mt-1.5 text-[10px] text-ink-500 text-center">
          {inPlaylist.size} of {songs?.length ?? 0} in playlist
        </p>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 && (
          <li className="text-center text-xs text-ink-500 py-8">
            {songs?.length === 0 ? 'No songs in your library yet.' : 'No matches.'}
          </li>
        )}
        {filtered.map(song => {
          const added = inPlaylist.has(song.id);
          return (
            <li key={song.id}>
              <button
                onClick={() => toggle(song)}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg active:bg-ink-800 text-left"
              >
                <div className="w-9 h-9 rounded bg-ink-700 flex items-center justify-center text-ink-400 shrink-0">
                  <Music size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-100 truncate">{song.title}</p>
                  <p className="text-[11px] text-ink-400 truncate">{song.artist}</p>
                </div>
                <span
                  className={
                    'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-base font-medium ' +
                    (added ? 'bg-accent text-ink-900' : 'bg-ink-700 text-ink-100')
                  }
                >
                  {added ? '✓' : '+'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ─── Search tab ─────────────────────────────────────────────────────────

function SearchTab({ playlistId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [helperOk, setHelperOk] = useState(true);
  const [feedback, setFeedback] = useState(new Map());
  const reqRef = useRef(0);
  const { enqueue } = useDownloadQueue();
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    let active = true;
    checkHelperHealth().then(ok => { if (active) setHelperOk(ok); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
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
          setResults(r);
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
  }, [query]);

  // Add a track to this playlist. Dedup first — if the user already owns
  // it, skip the download and link directly. Otherwise enqueue with the
  // playlist id so the worker links it after download.
  const addTrack = async track => {
    const artist = track.artist?.name || '';
    const title = track.title;
    const existing = await db.songs
      .where('title').equalsIgnoreCase(title)
      .toArray()
      .then(rows => rows.find(s =>
        s.artist?.trim().toLowerCase() === artist.toLowerCase()
      ));
    if (existing) {
      await addSongToPlaylist(playlistId, existing.id);
      flagDone(track.id, '✓ Already had it');
      return;
    }
    enqueue(`${artist} - ${title}`, {
      playlistId,
      expectedArtist: artist,
      expectedTitle: title
    });
    flagDone(track.id, 'Downloading…');
  };

  const flagDone = (id, label) => {
    setFeedback(prev => {
      const next = new Map(prev);
      next.set(id, label);
      return next;
    });
    setTimeout(() => {
      setFeedback(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }, 2500);
  };

  return (
    <>
      <div className="px-3 pt-3 pb-2">
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          placeholder="Search any song or artist…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full bg-ink-800 rounded-lg px-3 py-2 text-sm placeholder-ink-500 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {!helperOk && (
          <p className="mt-1.5 text-[10px] text-amber-400">
            Helper offline — start it on your laptop to search the web.
          </p>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && <li className="text-center text-xs text-ink-500 py-6">Searching…</li>}
        {error && <li className="text-center text-xs text-red-400 py-6">{error}</li>}
        {!loading && !error && results === null && query.trim().length < 2 && (
          <li className="text-center text-xs text-ink-500 py-8">
            Type at least 2 characters to search.
          </li>
        )}
        {!loading && !error && results && (
          <>
            {results.tracks?.length > 0 && results.tracks.map(t => {
              const label = feedback.get(t.id);
              return (
                <li key={t.id}>
                  <button
                    onClick={() => addTrack(t)}
                    disabled={!!label}
                    className="w-full flex items-center gap-2.5 p-2 rounded-lg active:bg-ink-800 text-left disabled:opacity-60"
                  >
                    <img
                      src={t.album?.cover_small}
                      alt=""
                      className="w-9 h-9 rounded object-cover bg-ink-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-100 truncate">{t.title}</p>
                      <p className="text-[11px] text-ink-400 truncate">{t.artist?.name}</p>
                    </div>
                    <span
                      className={
                        'shrink-0 text-[11px] font-semibold px-2 py-1 rounded ' +
                        (label ? 'bg-accent/20 text-accent' : 'bg-ink-700 text-ink-100')
                      }
                    >
                      {label || '+ Add'}
                    </span>
                  </button>
                </li>
              );
            })}
            {results.tracks?.length === 0 && (
              <li className="text-center text-xs text-ink-500 py-6">No matches.</li>
            )}
          </>
        )}
      </ul>
    </>
  );
}
