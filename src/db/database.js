import Dexie from 'dexie';

// One DB. Two tables.
//   songs:  the audio Blob + its metadata (title/artist/album/duration/mime)
//   lyrics: the LRC text + parsed timestamp lines, keyed by songId
//
// Why split? Lyrics are small and frequently re-read; songs hold large Blobs.
// Splitting keeps list queries fast (we never pull Blobs unless playing).
export const db = new Dexie('LyricPlayerDB');

db.version(1).stores({
  songs: 'id, title, artist, album, addedAt',
  lyrics: 'songId, source'
});

// v2: playlists. Existing songs/lyrics rows are preserved by Dexie's
// auto-migration; we only add the new table.
//   playlists.songIds is a plain array stored as-is (not indexed). Order is
//   meaningful — it's the play order. We never index by it; lookups happen
//   by playlist id, then we fan out song reads in PlaylistView.
db.version(2).stores({
  songs: 'id, title, artist, album, addedAt',
  lyrics: 'songId, source',
  playlists: 'id, name, createdAt'
});

// v3: track playback history. Indexed for the "Recently played" section on
// Home. We don't store full play counts — last-played timestamp is enough
// for the Spotify-style "recents" rail.
db.version(3).stores({
  songs: 'id, title, artist, album, addedAt, lastPlayedAt',
  lyrics: 'songId, source',
  playlists: 'id, name, createdAt'
});

// v4: persistent download queue. When the tab closes mid-batch, queue
// items survive so the worker can resume on next boot. lyrics rows gain
// an optional `offset` field (no schema change needed for that — Dexie
// stores arbitrary properties — but we keep the indexes the same).
db.version(4).stores({
  songs: 'id, title, artist, album, addedAt, lastPlayedAt',
  lyrics: 'songId, source',
  playlists: 'id, name, createdAt',
  queue: 'id, status, createdAt'
});

export async function addSong(record) {
  await db.songs.add(record);
}

export async function setLyrics(songId, payload) {
  await db.lyrics.put({ songId, ...payload });
}

export async function getLyrics(songId) {
  return db.lyrics.get(songId);
}

export async function getSong(id) {
  return db.songs.get(id);
}

export async function deleteSong(id) {
  await db.transaction('rw', db.songs, db.lyrics, async () => {
    await db.songs.delete(id);
    await db.lyrics.delete(id);
  });
}

// Lightweight projection used for the library list (no Blob).
export async function listSongs() {
  return db.songs.orderBy('addedAt').reverse().toArray()
    .then(rows => rows.map(({ blob, ...meta }) => meta));
}
