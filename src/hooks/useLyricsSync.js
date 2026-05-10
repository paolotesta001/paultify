import { useEffect, useRef, useState } from 'react';
import { findActiveIndex } from '../lib/lrcParser.js';

// Drives lyrics highlighting from the live audio element.
//
// Why rAF instead of `timeupdate`? `timeupdate` fires only every ~250ms on
// most browsers — too coarse for smooth karaoke. rAF runs at the screen
// refresh rate (60–120Hz) so we can animate per-line fill if we want.
//
// We keep React renders cheap by ONLY calling setState when `activeIndex`
// actually changes (typically once every several seconds). The fast path
// stays in plain JS.
//
// `offset` (seconds) shifts the timing of every line. Positive means
// lyrics appear later than the LRC says; negative means earlier. Used by
// the manual resync UI when LRCLIB's timing is slightly off.
export function useLyricsSync(audioRef, lines, offset = 0) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const lastIndexRef = useRef(-1);
  const rafRef = useRef(0);
  // Live offset captured in a ref so the rAF loop doesn't tear down/build
  // up on every nudge. Each tick reads the current value.
  const offsetRef = useRef(offset);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  useEffect(() => {
    // Reset when lyrics change.
    lastIndexRef.current = -1;
    setActiveIndex(-1);

    if (!lines || !lines.length) return;
    const audio = audioRef.current;
    if (!audio) return;

    const tick = () => {
      const t = audio.currentTime - offsetRef.current;
      const idx = findActiveIndex(lines, t);
      if (idx !== lastIndexRef.current) {
        lastIndexRef.current = idx;
        setActiveIndex(idx);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Pause the rAF when tab is hidden — Safari throttles it anyway, but
    // explicit cleanup avoids needless work.
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [audioRef, lines]);

  return activeIndex;
}
