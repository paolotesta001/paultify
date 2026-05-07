import { db, setLyrics } from '../db/database.js';
import { fetchLyricsFromLrclib } from './lrclib.js';
import { cleanupYouTubeMetadata } from './metadata.js';

// Re-runs LRCLIB for an existing song, applying the same cleanup we now do
// at upload time. Also writes the cleaned artist/title back to the song row
// so the library/player UI starts showing the correct names.
//
// Returns: 'synced' | 'plain' | 'none'
export async function refetchLyricsForSong(songId) {
  const song = await db.songs.get(songId);
  if (!song) return 'none';

  const cleaned = cleanupYouTubeMetadata({
    artist: song.artist,
    title: song.title
  });

  // Persist cleaned metadata only when something actually changed.
  if (cleaned.artist !== song.artist || cleaned.title !== song.title) {
    await db.songs.update(songId, {
      artist: cleaned.artist,
      title: cleaned.title
    });
  }

  const fetched = await fetchLyricsFromLrclib({
    artist: cleaned.artist,
    title: cleaned.title,
    album: song.album,
    duration: song.duration
  }).catch(() => null);

  await setLyrics(songId, {
    lrcText: fetched?.syncedLyrics || null,
    plainText: fetched?.plainLyrics || null,
    source: fetched ? 'lrclib' : 'none'
  });

  if (fetched?.syncedLyrics) return 'synced';
  if (fetched?.plainLyrics) return 'plain';
  return 'none';
}
