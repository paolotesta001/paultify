import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../hooks/usePlayer.jsx';

// Reads currentTime via rAF so the slider tracks playback smoothly without
// causing the parent component to re-render every frame.
export default function ProgressBar() {
  const { audioRef, duration, seek } = usePlayer();
  const [time, setTime] = useState(0);
  const [scrubbing, setScrubbing] = useState(null); // null | number
  const rafRef = useRef(0);

  useEffect(() => {
    const audio = audioRef.current;
    const tick = () => {
      // While the user is dragging, freeze the displayed time so the thumb
      // doesn't snap back as new currentTime updates arrive.
      if (scrubbing === null) setTime(audio.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioRef, scrubbing]);

  const value = scrubbing ?? time;
  const max = duration > 0 ? duration : 1;

  const commit = () => {
    if (scrubbing !== null) seek(scrubbing);
    setScrubbing(null);
  };

  return (
    <div className="w-full select-none">
      <input
        type="range"
        className="seek"
        min={0}
        max={max}
        step={0.01}
        value={Math.min(value, max)}
        onChange={e => setScrubbing(parseFloat(e.target.value))}
        // Commit on release. We use the in-state `scrubbing` value rather
        // than e.target.value because pointerup/touchend can fire after
        // change with a stale target value on some browsers.
        onPointerUp={commit}
        onTouchEnd={commit}
        onMouseUp={commit}
      />
      <div className="flex justify-between text-xs text-ink-400 mt-1 tabular-nums">
        <span>{fmt(value)}</span>
        <span>-{fmt(Math.max(0, duration - value))}</span>
      </div>
    </div>
  );
}

function fmt(s) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
