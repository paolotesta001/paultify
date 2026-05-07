import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { parseLRC } from '../lib/lrcParser.js';
import { useLyricsSync } from '../hooks/useLyricsSync.js';
import { usePlayer } from '../hooks/usePlayer.jsx';
import { refetchLyricsForSong } from '../lib/refetchLyrics.js';

// Three lyric modes:
//   karaoke  — one centered active line, others dimmed (the original)
//   full     — all lines visible, scrollable, no auto-centering
//   big      — only the active line + the next, displayed huge
//
// Mode is picked by a small pill switcher above the lyrics.
const MODES = [
  { id: 'karaoke', label: 'Karaoke' },
  { id: 'full', label: 'Full' },
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
          <FullText text={plain}>
            <RefetchButton songId={songId} />
          </FullText>
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
        {lines.length > 0 && mode === 'full' && (
          <FullView lines={lines} activeIndex={activeIndex} onSeek={seek} />
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
            'px-3 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-30 ' +
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

// ─── Views ──────────────────────────────────────────────────────────────

function KaraokeView({ lines, activeIndex, onSeek }) {
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

  return (
    <div ref={containerRef} className="h-full overflow-y-auto no-scrollbar lyric-fade px-6">
      <div className="h-[40vh]" aria-hidden />
      {lines.map((l, i) => {
        const isActive = i === activeIndex;
        const isPast = i < activeIndex;
        return (
          <p
            key={i}
            data-idx={i}
            onClick={() => onSeek(l.time)}
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

function FullView({ lines, activeIndex, onSeek }) {
  // No auto-scroll, no centering — just a comfortable reading column. The
  // active line still pops a little so you can find your place if you look
  // up after reading ahead.
  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      {lines.map((l, i) => {
        const isActive = i === activeIndex;
        return (
          <p
            key={i}
            onClick={() => onSeek(l.time)}
            className={
              'cursor-pointer text-base leading-relaxed py-1 transition-colors ' +
              (isActive ? 'text-white font-medium' : 'text-ink-300 hover:text-ink-100')
            }
          >
            {l.text || '♪'}
          </p>
        );
      })}
    </div>
  );
}

function BigView({ lines, activeIndex }) {
  // Active + next line, both huge. Designed for sing-along: no need to keep
  // your eyes on a moving cursor, just two blocks of text.
  const current = activeIndex >= 0 ? lines[activeIndex] : null;
  const upcoming = lines[activeIndex + 1] || null;
  return (
    <div className="h-full flex flex-col items-center justify-center px-8 text-center gap-6">
      <p className="text-3xl md:text-5xl font-bold leading-tight text-white">
        {current?.text || (activeIndex < 0 ? '…' : '♪')}
      </p>
      {upcoming && (
        <p className="text-xl md:text-2xl font-medium leading-snug text-ink-500">
          {upcoming.text || '♪'}
        </p>
      )}
    </div>
  );
}

function FullText({ text, children }) {
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
