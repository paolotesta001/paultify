import { apiUrl } from './config.js';

// Client wrapper around the helper's /api/download + /api/health endpoints.
// In dev these resolve same-origin (Vite middleware); in production the
// HELPER_BASE env points elsewhere.

export async function checkHelperHealth() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    const r = await fetch(apiUrl('/api/health'), { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

// Returns a File so the existing upload pipeline (metadata extraction →
// addSong → LRCLIB) handles it without modification.
//
// `duration` (in seconds) is passed through to yt-dlp's --match-filter so
// it picks the studio version, not the music video with the long intro.
//
// Hard-capped at 120s. Normal song downloads finish in ~20-40s; the helper
// itself runs up to 4 yt-dlp tiers per song so a worst-case match can take
// ~90s. Anything past 120s almost always means the helper is unreachable
// (Tailscale down, helper not started) — failing fast lets the queue worker
// move on and surface the error to the user instead of sitting forever.
const DOWNLOAD_TIMEOUT_MS = 120_000;

export async function downloadFromYoutube(query, { signal, duration } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  const onCallerAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onCallerAbort);
  try {
    const r = await fetch(apiUrl('/api/download'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, duration: duration ?? null }),
      signal: ctrl.signal
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(err.error || 'download failed');
    }
    const filename = decodeURIComponent(r.headers.get('X-Filename') || 'track.mp3');
    const blob = await r.blob();
    return new File([blob], filename, { type: 'audio/mpeg' });
  } catch (err) {
    if (err.name === 'AbortError') {
      // Distinguish caller-cancel from our timeout — caller abort means the
      // user removed the item; timeout means the helper never answered.
      if (signal?.aborted) throw err;
      throw new Error('helper unreachable (timed out after 120s)');
    }
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      throw new Error('helper unreachable (network error)');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}
