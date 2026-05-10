import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { parseLRC } from '../lib/lrcParser.js';
import { useLyricsSync } from '../hooks/useLyricsSync.js';
import { usePlayer } from '../hooks/usePlayer.jsx';
import { refetchLyricsForSong } from '../lib/refetchLyrics.js';

// Two modes:
//   karaoke — auto-scrolling list, current line bright white, others dim
//   big     — only the previous, current, and next lines, displayed huge
//
// "Full" mode was removed — the karaoke view already lets you scroll
// freely (manual scroll pauses auto-follow for ~6s, then resumes).
const MODES = [
  { id: 'karaoke', label: 'Karaoke' },
  { id: 'big', label: 'Big' }
];

export default function Lyrics({ initialMode = 'karaoke' }) {
  const { currentSong, audioRef, seek } = usePlayer();
  const songId = currentSong?.id;
  const [mode, setMode] = useState(initialMode);

  const lyricsRow = useLiveQuery(
    () => (songId ? db.lyrics.get(songId).then(r => r ?? null) : null),
    [songId]
  );

  const { lines, plain } = useMemo(() => {
    if (!lyricsRow) return { lines: [], plain: null };
    if (lyricsRow.lrcText) {
      const { lines } = parseLRC(lyricsRow.lrcText);
      if (lines.length) return { lines, plain: null };
    }
    return { lines: [], plain: lyricsRow.plainText || null };
  }, [lyricsRow]);

  const activeIndex = useLyricsSync(audioRef, lines);

  if (!songId) return null;

  return (
    <div className="flex flex-col h-full">
      <ModeSwitcher mode={mode} onChange={setMode} disabled={!lines.length && !plain} />

      <div className="flex-1 min-h-0">
        {lyricsRow === undefined && <Centered>Loading…</Centered>}

        {lyricsRow !== undefined && !lines.length && plain && (
          <PlainText text={plain}>
            <RefetchButton songId={songId} />
          </PlainText>
        )}

        {lyricsRow !== undefined && !lines.length && !plain && (
          <Centered>
            <div className="flex flex-col items-center gap-3">
              <p className="text-ink-400 text-sm">
                {lyricsRow === null ? 'Searching for lyrics…' : 'No synced lyrics found'}
              </p>
              {lyricsRow !== null && <RefetchButton songId={songId} />}
            </div>
          </Centered>
        )}

        {lines.length > 0 && mode === 'karaoke' && (
          <KaraokeView lines={lines} activeIndex={activeIndex} onSeek={seek} />
        )}
        {lines.length > 0 && mode === 'big' && (
          <BigView lines={lines} activeIndex={activeIndex} />
        )}
      </div>
    </div>
  );
}

// ─── Mode pills ─────────────────────────────────────────────────────────

function ModeSwitcher({ mode, onChange, disabled }) {
  return (
    <div className="flex justify-center gap-1 px-4 py-2">
      {MODES.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          disabled={disabled}
          className={
            'px-4 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-30 ' +
            (mode === m.id
              ? 'bg-ink-100 text-ink-900'
              : 'bg-ink-800 text-ink-300 hover:bg-ink-700')
          }
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ─── Karaoke ────────────────────────────────────────────────────────────

function KaraokeView({ lines, activeIndex, onSeek }) {
  const containerRef = useRef(null);
  // Auto-scroll resumes ~6s after the user last touched the scroll. That
  // way you can browse ahead without the rAF fighting your finger, but if
  // you put your phone down it snaps back to the active line.
  const lastUserScrollRef = useRef(0);
  const [autoFollow, setAutoFollow] = useState(true);

  // Manual scroll detection. We compare the current scrollTop to the value
  // we last set programmatically; if they diverge, the user scrolled.
  const programmaticTopRef = useRef(0);
  const onScroll = () => {
    const c = containerRef.current;
    if (!c) return;
    if (Math.abs(c.scrollTop - programmaticTopRef.current) > 4) {
      lastUserScrollRef.current = Date.now();
      setAutoFollow(false);
    }
  };

  // Tick that re-arms autoFollow after the timeout.
  useEffect(() => {
    if (autoFollow) return;
    const id = setInterval(() => {
      if (Date.now() - lastUserScrollRef.current >= 6000) {
        setAutoFollow(true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [autoFollow]);

  useEffect(() => {
    if (!autoFollow) return;
    const c = containerRef.current;
    if (!c || activeIndex < 0) return;
    const active = c.querySelector(`[data-idx="${activeIndex}"]`);
    if (!active) return;
    const cRect = c.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    const targetTop = c.scrollTop + (aRect.top - cRect.top) - cRect.height / 2 + aRect.height / 2;
    programmaticTopRef.current = targetTop;
    c.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, [activeIndex, autoFollow]);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="h-full overflow-y-auto no-scrollbar lyric-fade px-6"
    >
      <div className="h-[40vh]" aria-hidden />
      {lines.map((l, i) => {
        const isActive = i === activeIndex;
        const isPast = i < activeIndex;
        return (
          <p
            key={i}
            data-idx={i}
            onClick={() => {
              onSeek(l.time);
              // Treating tap-to-seek as a "follow me" gesture.
              setAutoFollow(true);
            }}
            className={
              'cursor-pointer text-2xl md:text-3xl leading-snug py-2 transition-colors duration-200 ' +
              (isActive
                ? 'text-white font-bold'
                : isPast
                  ? 'text-ink-600 font-medium'
                  : 'text-ink-400 font-medium')
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

// ─── Big mode (prev / current / next, full screen) ──────────────────────

function BigView({ lines, activeIndex }) {
  const prev = activeIndex - 1 >= 0 ? lines[activeIndex - 1] : null;
  const current = activeIndex >= 0 ? lines[activeIndex] : null;
  const upcoming = lines[activeIndex + 1] || null;
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center gap-6 select-none">
      <p className="text-2xl md:text-3xl font-medium leading-tight text-ink-500">
        {prev?.text || ''}
      </p>
      <p className="text-4xl md:text-6xl font-bold leading-tight text-white">
        {current?.text || (activeIndex < 0 ? '…' : '♪')}
      </p>
      <p className="text-2xl md:text-3xl font-medium leading-tight text-ink-500">
        {upcoming?.text || ''}
      </p>
    </div>
  );
}

// ─── Atoms ──────────────────────────────────────────────────────────────

function PlainText({ text, children }) {
  return (
    <div className="px-6 py-6 text-ink-300 leading-relaxed whitespace-pre-wrap text-lg">
      {children}
      {text}
    </div>
  );
}

function Centered({ children }) {
  return (
    <div className="h-full flex items-center justify-center px-4 text-center">
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
