import { db } from '../db/database.js';

// All playlist mutations go through this module so the data shape stays
// consistent (songIds always an array, name always trimmed, etc.).

export async function createPlaylist(name) {
  const id = crypto.randomUUID();
  await db.playlists.add({
    id,
    name: (name || '').trim() || 'New playlist',
    songIds: [],
    createdAt: Date.now()
  });
  return id;
}

export async function renamePlaylist(id, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  await db.playlists.update(id, { name: trimmed });
}

export async function deletePlaylist(id) {
  await db.playlists.delete(id);
}

// Atomic add-if-missing. Wrapping in a transaction prevents a race where two
// rapid clicks both read an old songIds and write back a duplicate.
export async function addSongToPlaylist(playlistId, songId) {
  await db.transaction('rw', db.playlists, async () => {
    const p = await db.playlists.get(playlistId);
    if (!p) return;
    if (p.songIds.includes(songId)) return;
    await db.playlists.update(playlistId, {
      songIds: [...p.songIds, songId]
    });
  });
}

export async function removeSongFromPlaylist(playlistId, songId) {
  await db.transaction('rw', db.playlists, async () => {
    const p = await db.playlists.get(playlistId);
    if (!p) return;
    await db.playlists.update(playlistId, {
      songIds: p.songIds.filter(id => id !== songId)
    });
  });
}

// Bulk add/remove — used by the multi-select picker.
export async function setPlaylistSongs(playlistId, songIds) {
  await db.playlists.update(playlistId, { songIds });
}

// Look up playlist + hydrated song metadata (no Blobs), preserving order.
// If the playlist references a song id that no longer exists (user deleted
// it), we silently drop it from the returned list.
export async function getPlaylistWithSongs(playlistId) {
  const playlist = await db.playlists.get(playlistId);
  if (!playlist) return null;
  const songRows = await db.songs.bulkGet(playlist.songIds);
  const songs = songRows
    .filter(Boolean)
    .map(({ blob, ...meta }) => meta);
  return { ...playlist, songs };
}
