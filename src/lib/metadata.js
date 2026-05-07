// Extract artist/title/album/duration from an MP3 Blob using ID3 tags.
// We import music-metadata lazily so the initial bundle stays tiny.
//
// Falls back to filename heuristics: "Artist - Title.mp3" → split on " - ".

// Decorations that lyric-reupload channels glue onto YouTube titles.
// "(Lyrics)", "(Official Video)", "[Audio]", "(HD Remastered)" etc.
//
// We deliberately don't use \b around the keywords: "lyrics" / "lyric video"
// vary in plurality and word boundary placement, and the surrounding parens
// already give us a clean delimiter. Substring match within (...) is good
// enough and avoids the \blyric\b miss on "(Lyrics)".
const YT_NOISE = /\s*[\(\[][^()\[\]]*(?:official|lyric|audio|video|visualiz|hd|hq|4k|remaster|m\/v|mv)[^()\[\]]*[\)\]]\s*/gi;

// Heuristic cleanup for YouTube-sourced metadata. Two failure modes we fix:
//   1. Re-upload channels: artist is "7clouds" / "<artist>VEVO" / etc., real
//      artist hides inside the title as "Ed Sheeran - Perfect (Lyrics)".
//   2. Decorations like "(Lyrics)" leak into the title and break LRCLIB's
//      exact-match endpoint.
//
// Exported separately so it can be re-applied to existing library entries
// when the user taps "Refetch synced lyrics".
export function cleanupYouTubeMetadata({ artist, title }) {
  let a = (artist || '').trim();
  let t = (title || '').trim();

  // Pattern "Artist - Song (anything)" inside the title field.
  const split = t.match(/^\s*(.+?)\s+-\s+(.+?)\s*$/);
  if (split) {
    a = split[1].trim();
    t = split[2].trim();
  }

  // Strip trailing decoration parentheticals/brackets, possibly several.
  let prev;
  do {
    prev = t;
    t = t.replace(YT_NOISE, '').trim();
  } while (t !== prev);

  return { artist: a || artist, title: t || title };
}

export async function extractMetadata(file) {
  const filename = file.name.replace(/\.[^.]+$/, '');
  let artist = null;
  let title = null;
  let album = null;
  let duration = null;

  try {
    const { parseBlob } = await import('music-metadata');
    const meta = await parseBlob(file, { duration: true });
    artist = meta.common.artist || (meta.common.artists?.[0] ?? null);
    title = meta.common.title || null;
    album = meta.common.album || null;
    duration = meta.format.duration || null;
  } catch {
    // music-metadata can fail on malformed tags — fall through to filename.
  }

  if (!title || !artist) {
    const m = filename.match(/^\s*(.+?)\s+-\s+(.+?)\s*$/);
    if (m) {
      artist = artist || m[1];
      title = title || m[2];
    } else {
      title = title || filename;
    }
  }

  if (!duration) {
    duration = await getAudioDuration(file).catch(() => null);
  }

  // Apply YouTube-shape cleanup unconditionally — it's a no-op on cleanly
  // tagged files (no " - " in the title) and rescues the messy ones.
  const cleaned = cleanupYouTubeMetadata({
    artist: artist || 'Unknown Artist',
    title: title || filename
  });

  return {
    artist: cleaned.artist,
    title: cleaned.title,
    album: album?.trim() || null,
    duration: duration ? Number(duration.toFixed(3)) : null
  };
}

// Last-resort duration probe via a hidden <audio> element.
function getAudioDuration(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';
    const cleanup = () => URL.revokeObjectURL(url);
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      cleanup();
      resolve(Number.isFinite(d) ? d : null);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('audio load failed'));
    };
    audio.src = url;
  });
}
