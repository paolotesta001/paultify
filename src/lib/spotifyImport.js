import { apiUrl } from './config.js';

// Calls the helper's /api/spotify, which scrapes Spotify's public embed
// page (no API auth required) and returns a normalized payload:
//   { type: 'playlist'|'album'|'track'|..., name, artist, tracks: [{ title, artist, duration }] }

export async function fetchSpotifyDetails(url) {
  const r = await fetch(apiUrl('/api/spotify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    throw new Error(err.error || 'Spotify fetch failed');
  }
  return r.json();
}
