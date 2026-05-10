import { apiUrl } from './config.js';

// Deezer's public catalog API, accessed via the helper's /api/deezer/* proxy.

export async function deezer(path) {
  const r = await fetch(apiUrl(`/api/deezer/${path}`));
  if (!r.ok) throw new Error(`Deezer HTTP ${r.status}`);
  const data = await r.json();
  if (data?.error) throw new Error(data.error.message || 'Deezer error');
  return data;
}

export async function searchOverview(query) {
  const q = encodeURIComponent(query);
  const [tracks, artists, albums] = await Promise.all([
    deezer(`search/track?q=${q}&limit=8`).then(r => r.data || []),
    deezer(`search/artist?q=${q}&limit=4`).then(r => r.data || []),
    deezer(`search/album?q=${q}&limit=6`).then(r => r.data || [])
  ]);
  return { tracks, artists, albums };
}

export async function getArtistTopTracks(artistId, limit = 20) {
  const r = await deezer(`artist/${artistId}/top?limit=${limit}`);
  return r.data || [];
}

export async function getArtistAlbums(artistId, limit = 30) {
  const r = await deezer(`artist/${artistId}/albums?limit=${limit}`);
  return r.data || [];
}

export async function getAlbum(albumId) {
  const album = await deezer(`album/${albumId}`);
  return {
    ...album,
    tracks: album.tracks?.data || []
  };
}

// Best-effort track lookup. Used by the queue worker to fetch the official
// duration + cover for a free-text Quick Add query. Returns null if no
// result so the caller can gracefully fall back.
export async function findTrack(artist, title) {
  const q = encodeURIComponent(`${artist || ''} ${title || ''}`.trim());
  if (!q) return null;
  try {
    const r = await deezer(`search/track?q=${q}&limit=1`);
    return r.data?.[0] || null;
  } catch {
    return null;
  }
}

// Fetch a Deezer cover image as a Blob via the helper proxy (direct fetch
// would hit CORS). Returns null on any failure.
export async function fetchCoverBlob(url) {
  if (!url) return null;
  try {
    const r = await fetch(apiUrl(`/api/cover?url=${encodeURIComponent(url)}`));
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
}
