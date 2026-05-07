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
export function useLyricsSync(audioRef, lines) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const lastIndexRef = useRef(-1);
  const rafRef = useRef(0);

  useEffect(() => {
    // Reset when lyrics change.
    lastIndexRef.current = -1;
    setActiveIndex(-1);

    if (!lines || !lines.length) return;
    const audio = audioRef.current;
    if (!audio) return;

    const tick = () => {
      const t = audio.currentTime;
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
