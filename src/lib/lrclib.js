// LRCLIB is a free, no-auth lyrics database. We hit /api/get with the best
// metadata we have; if that 404s we fall back to /api/search (looser match).

const BASE = 'https://lrclib.net/api';

export async function fetchLyricsFromLrclib({ artist, title, album, duration }) {
  if (!artist || !title) return null;
  // Exact endpoint first — fastest, returns synced lyrics if available.
  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title
    });
    if (album) params.set('album_name', album);
    if (duration && Number.isFinite(duration)) {
      params.set('duration', Math.round(duration).toString());
    }
    const r = await fetch(`${BASE}/get?${params.toString()}`, {
      headers: { 'User-Agent': 'LyricPlayerPWA/0.1' }
    });
    if (r.ok) {
      const data = await r.json();
      if (data.syncedLyrics || data.plainLyrics) {
        return {
          syncedLyrics: data.syncedLyrics || null,
          plainLyrics: data.plainLyrics || null,
          source: 'lrclib'
        };
      }
    }
  } catch {
    // fall through to search
  }

  // Fallback 1: /api/search with track + artist (looser than /get).
  const fromArtistTitle = await searchLrclib({ track_name: title, artist_name: artist });
  if (fromArtistTitle) return fromArtistTitle;

  // Fallback 2: /api/search with just the title — covers the case where the
  // artist field is wrong (e.g. yt-dlp pulled a lyric-channel uploader name).
  // We still bias toward results matching the duration we have if any.
  const fromTitleOnly = await searchLrclib({ track_name: title }, { duration });
  return fromTitleOnly;
}

async function searchLrclib(params, { duration } = {}) {
  try {
    const qs = new URLSearchParams(params);
    const r = await fetch(`${BASE}/search?${qs.toString()}`);
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;

    // Score: synced > plain, then closer duration > farther.
    const scored = arr.map(x => {
      let s = 0;
      if (x.syncedLyrics) s += 100;
      else if (x.plainLyrics) s += 10;
      if (duration && Number.isFinite(x.duration)) {
        s -= Math.min(20, Math.abs(x.duration - duration));
      }
      return { x, s };
    }).sort((a, b) => b.s - a.s);

    const best = scored[0]?.x;
    if (!best || (!best.syncedLyrics && !best.plainLyrics)) return null;
    return {
      syncedLyrics: best.syncedLyrics || null,
      plainLyrics: best.plainLyrics || null,
      source: 'lrclib'
    };
  } catch {
    return null;
  }
}
