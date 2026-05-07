import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { parseLRC } from '../lib/lrcParser.js';
import { useLyricsSync } from '../hooks/useLyricsSync.js';
import { usePlayer } from '../hooks/usePlayer.jsx';
import { refetchLyricsForSong } from '../lib/refetchLyrics.js';

export default function Lyrics() {
  const { currentSong, audioRef, seek } = usePlayer();
  const songId = currentSong?.id;

  // Pull lyrics row reactively. useLiveQuery re-runs when the row changes
  // (e.g. when LRCLIB fetch completes after upload).
  // Coerce missing rows to `null` so we can distinguish "still loading"
  // (undefined) from "no row exists yet" (null).
  const lyricsRow = useLiveQuery(
    () => (songId ? db.lyrics.get(songId).then(r => r ?? null) : null),
    [songId]
  );

  // Parse once per row.
  const { lines, plain } = useMemo(() => {
    if (!lyricsRow) return { lines: [], plain: null };
    if (lyricsRow.lrcText) {
      const { lines } = parseLRC(lyricsRow.lrcText);
      if (lines.length) return { lines, plain: null };
    }
    return { lines: [], plain: lyricsRow.plainText || null };
  }, [lyricsRow]);

  const activeIndex = useLyricsSync(audioRef, lines);

  // Auto-scroll the active line into the centered "karaoke" position.
  const containerRef = useRef(null);
  useEffect(() => {
    const c = containerRef.current;
    if (!c || activeIndex < 0) return;
    const active = c.querySelector(`[data-idx="${activeIndex}"]`);
    if (!active) return;
    const cRect = c.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    const targetTop = c.scrollTop + (aRect.top - cRect.top) - cRect.height / 2 + aRect.height / 2;
    c.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, [activeIndex]);

  if (!songId) {
    return null;
  }

  if (lyricsRow === undefined) {
    return <Hint>Loading…</Hint>;
  }

  if (!lines.length && plain) {
    return (
      <div className="px-6 py-8 text-ink-300 leading-relaxed whitespace-pre-wrap text-lg">
        <RefetchButton songId={songId} />
        {plain}
      </div>
    );
  }

  if (!lines.length) {
    // lyricsRow === null → row not written yet (LRCLIB fetch in flight).
    // lyricsRow exists but has no synced + no plain → genuinely nothing found.
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-ink-400 text-sm">
          {lyricsRow === null ? 'Searching for lyrics…' : 'No synced lyrics found'}
        </p>
        {lyricsRow !== null && <RefetchButton songId={songId} />}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto no-scrollbar lyric-fade px-6"
    >
      {/* Top spacer so the first line can sit centered */}
      <div className="h-[40vh]" aria-hidden />
      {lines.map((l, i) => {
        const isActive = i === activeIndex;
        const isPast = i < activeIndex;
        return (
          <p
            key={i}
            data-idx={i}
            onClick={() => seek(l.time)}
            className={
              'cursor-pointer text-2xl md:text-3xl font-semibold leading-snug py-2 transition-all duration-300 ' +
              (isActive
                ? 'text-white scale-[1.02]'
                : isPast
                  ? 'text-ink-500'
                  : 'text-ink-400')
            }
          >
            {l.text || '♪'}
          </p>
        );
      })}
      <div className="h-[40vh]" aria-hidden />
    </div>
  );
}

function Hint({ children }) {
  return (
    <div className="flex items-center justify-center h-full text-ink-400 text-sm">
      {children}
    </div>
  );
}

function RefetchButton({ songId }) {
  const [status, setStatus] = useState(null);
  const handle = async e => {
    e.stopPropagation();
    setStatus('working');
    try {
      const result = await refetchLyricsForSong(songId);
      setStatus(result);
      if (result === 'synced') setTimeout(() => setStatus(null), 1200);
    } catch {
      setStatus('error');
    }
  };
  const label =
    status === 'working' ? 'Searching…' :
    status === 'synced' ? '✓ Found synced lyrics' :
    status === 'plain' ? 'Only plain lyrics available' :
    status === 'none' ? 'Nothing on LRCLIB' :
    status === 'error' ? 'Failed' :
    'Try synced lyrics';
  return (
    <button
      onClick={handle}
      disabled={status === 'working'}
      className="mb-4 px-3 py-1.5 rounded-full bg-ink-700 hover:bg-ink-600 active:bg-ink-600 text-xs text-ink-200 disabled:opacity-60"
    >
      {label}
    </button>
  );
}
