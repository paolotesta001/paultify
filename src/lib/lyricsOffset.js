import { db } from '../db/database.js';

// Per-song lyrics offset (in seconds). Positive = lyrics shift later
// (delay), negative = lyrics shift earlier. Persisted on the lyrics row so
// it survives across re-imports.
export async function setLyricsOffset(songId, offset) {
  const row = await db.lyrics.get(songId);
  if (row) {
    await db.lyrics.update(songId, { offset });
  } else {
    await db.lyrics.put({ songId, offset, source: 'manual' });
  }
}
