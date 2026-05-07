import { apiUrl } from './config.js';

// Deezer's public catalog API, accessed via the helper's /api/deezer/* proxy.

async function deezer(path) {
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
