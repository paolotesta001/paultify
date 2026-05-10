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
export async function downloadFromYoutube(query, { signal, duration } = {}) {
  const r = await fetch(apiUrl('/api/download'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, duration: duration ?? null }),
    signal
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    throw new Error(err.error || 'download failed');
  }
  const filename = decodeURIComponent(r.headers.get('X-Filename') || 'track.mp3');
  const blob = await r.blob();
  return new File([blob], filename, { type: 'audio/mpeg' });
}
