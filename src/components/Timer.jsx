import { useEffect, useRef, useState } from 'react';

// Gym timer — countdown + set counter, all on one screen so you don't have
// to leave the music app between exercises.
//
// Implementation notes
//   - We compute remaining seconds from a wall-clock anchor (Date.now())
//     rather than counting setInterval ticks. setInterval drift on iOS
//     when the tab is backgrounded would mean the alarm fires several
//     seconds late; the wall-clock approach stays accurate as long as
//     the tab eventually wakes up.
//   - Two short beeps via Web Audio so the alarm doesn't fight the
//     music player's <audio> element. AudioContext is independent.
//   - Sets counter is plain numeric state; +/- buttons step by 1.
export default function Timer() {
  const [initial, setInitial] = useState(60);     // seconds the timer was set to
  const [remaining, setRemaining] = useState(60); // seconds left
  const [running, setRunning] = useState(false);
  const [sets, setSets] = useState(0);
  const anchorRef = useRef(null); // { startMs, baseRemaining } while running

  // Wall-clock countdown loop. Uses requestAnimationFrame for smooth
  // visual updates but reads Date.now() each tick so iOS backgrounding
  // doesn't make us drift.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const { startMs, baseRemaining } = anchorRef.current;
      const elapsed = (Date.now() - startMs) / 1000;
      const r = Math.max(0, baseRemaining - elapsed);
      setRemaining(r);
      if (r <= 0) {
        setRunning(false);
        anchorRef.current = null;
        beep();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  // Adjust the timer total. Disabled while running so users can't change
  // an anchor mid-countdown without an explicit reset.
  const adjust = (delta) => {
    if (running) return;
    const next = Math.max(5, Math.min(60 * 60, initial + delta));
    setInitial(next);
    setRemaining(next);
  };

  const start = () => {
    if (remaining <= 0) setRemaining(initial);
    anchorRef.current = { startMs: Date.now(), baseRemaining: remaining > 0 ? remaining : initial };
    setRunning(true);
  };
  const pause = () => {
    anchorRef.current = null;
    setRunning(false);
  };
  const reset = () => {
    anchorRef.current = null;
    setRunning(false);
    setRemaining(initial);
  };

  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  // Visual progress arc — 0 at start, 1 at zero.
  const progress = initial > 0 ? 1 - remaining / initial : 0;

  return (
    <div className="px-4 pt-6 pb-20 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Gym timer</h1>
      <p className="text-sm text-ink-400 mb-6">
        Countdown + set counter. Music keeps playing in the background.
      </p>

      <div className="rounded-2xl bg-ink-800/60 border border-ink-700/60 p-6 mb-6">
        <div className="flex flex-col items-center">
          <ProgressRing progress={progress} size={220}>
            <span className="text-5xl font-bold tabular-nums text-ink-100">{display}</span>
            <span className="text-[11px] uppercase tracking-widest text-ink-500 mt-1">
              {running ? 'Running' : remaining === 0 ? 'Done' : 'Ready'}
            </span>
          </ProgressRing>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-6">
          <AdjustBtn onClick={() => adjust(-30)} disabled={running}>-30s</AdjustBtn>
          <AdjustBtn onClick={() => adjust(-10)} disabled={running}>-10s</AdjustBtn>
          <AdjustBtn onClick={() => adjust(10)} disabled={running}>+10s</AdjustBtn>
          <AdjustBtn onClick={() => adjust(30)} disabled={running}>+30s</AdjustBtn>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-2">
          <AdjustBtn onClick={() => { setInitial(30); setRemaining(30); }} disabled={running}>:30</AdjustBtn>
          <AdjustBtn onClick={() => { setInitial(60); setRemaining(60); }} disabled={running}>1:00</AdjustBtn>
          <AdjustBtn onClick={() => { setInitial(120); setRemaining(120); }} disabled={running}>2:00</AdjustBtn>
        </div>

        <div className="flex gap-2 mt-5">
          {!running ? (
            <button
              onClick={start}
              className="flex-1 px-4 py-3 rounded-xl bg-accent text-ink-900 font-semibold active:scale-[0.98]"
            >
              {remaining === 0 ? 'Restart' : 'Start'}
            </button>
          ) : (
            <button
              onClick={pause}
              className="flex-1 px-4 py-3 rounded-xl bg-ink-100 text-ink-900 font-semibold active:scale-[0.98]"
            >
              Pause
            </button>
          )}
          <button
            onClick={reset}
            className="px-4 py-3 rounded-xl bg-ink-700 text-ink-100 font-medium active:scale-[0.98]"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-ink-800/60 border border-ink-700/60 p-6">
        <h2 className="text-sm font-semibold text-ink-200 mb-1">Sets</h2>
        <p className="text-xs text-ink-400 mb-4">Tap + after each set; − to undo.</p>
        <div className="flex items-center justify-center gap-5">
          <button
            onClick={() => setSets(s => Math.max(0, s - 1))}
            className="w-14 h-14 rounded-full bg-ink-700 text-ink-100 text-2xl font-semibold active:bg-ink-600"
            aria-label="Decrease sets"
          >
            −
          </button>
          <span className="text-6xl font-bold tabular-nums text-ink-100 min-w-[3ch] text-center">
            {sets}
          </span>
          <button
            onClick={() => setSets(s => s + 1)}
            className="w-14 h-14 rounded-full bg-accent text-ink-900 text-2xl font-semibold active:scale-95"
            aria-label="Increase sets"
          >
            +
          </button>
        </div>
        <button
          onClick={() => setSets(0)}
          className="block mx-auto mt-4 text-xs uppercase tracking-wider text-ink-400 hover:text-ink-200"
        >
          Reset count
        </button>
      </div>
    </div>
  );
}

function AdjustBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-2 rounded-lg bg-ink-700 active:bg-ink-600 text-ink-100 text-xs font-semibold disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ProgressRing({ progress, size, children }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgb(38, 38, 45)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgb(30, 215, 96)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.2s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// Short two-tone beep so the alarm is unmissable but doesn't sound like
// a dropped audio frame from the music player.
function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const playTone = (freq, startOffset, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + startOffset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + dur);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + dur + 0.05);
    };
    playTone(880, 0, 0.3);
    playTone(1320, 0.4, 0.4);
    // Close the context once tones finish so we don't hold a Web Audio
    // graph alive between alarm firings.
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {}
}
