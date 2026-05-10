import { apiUrl } from './config.js';

// URL the audio element points at when the user wants to stream a track
// without downloading first. Helper pipes yt-dlp's m4a output directly to
// the response.
export function streamUrl(query, duration) {
  const params = new URLSearchParams({ q: query });
  if (Number.isFinite(duration)) params.set('d', String(duration));
  return apiUrl(`/api/stream?${params.toString()}`);
}
