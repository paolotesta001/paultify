import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { db, getSong } from '../db/database.js';

// Single source of truth for playback. Holds:
//   - the live HTMLAudioElement (in a ref so children can read currentTime
//     each rAF tick without triggering React re-renders)
//   - light reactive state (current track, isPlaying, duration, queue)
//   - imperative methods (play / toggle / seek / next / prev / setQueue)
//
// Why one audio element, kept across mounts? iOS Safari is strict: a fresh
// `new Audio()` outside a user gesture won't autoplay, and creating multiple
// elements fights for the single allowed playback slot.

const PlayerCtx = createContext(null);

export function PlayerProvider({ children }) {
  // Created once. Survives any component unmount.
  const audioRef = useRef(null);
  if (!audioRef.current) {
    const a = new Audio();
    a.preload = 'metadata';
    a.crossOrigin = 'anonymous';
    audioRef.current = a;
  }

  const [currentSong, setCurrentSong] = useState(null); // metadata, no Blob
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState([]); // array of song ids
  const objectUrlRef = useRef(null);

  // ─── helpers ───────────────────────────────────────────────────────────
  const revokeUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  // Load a song by id: pull Blob from Dexie, swap the audio source.
  // Also stamps lastPlayedAt so Home's "Recently played" rail surfaces it.
  const loadSong = useCallback(async (songId, { autoplay = true } = {}) => {
    const audio = audioRef.current;
    const row = await getSong(songId);
    if (!row || !row.blob) return;

    revokeUrl();
    const url = URL.createObjectURL(row.blob);
    objectUrlRef.current = url;
    audio.src = url;
    audio.load();

    const { blob, ...meta } = row;
    setCurrentSong(meta);
    setDuration(meta.duration || 0);

    // Fire-and-forget timestamp update — failure is harmless.
    db.songs.update(songId, { lastPlayedAt: Date.now() }).catch(() => {});

    if (autoplay) {
      try {
        await audio.play();
      } catch {
        // autoplay blocked — user must tap play
      }
    }
  }, []);

  // ─── public methods ────────────────────────────────────────────────────
  const playFromQueue = useCallback(async (songIds, startIndex = 0) => {
    setQueue(songIds);
    await loadSong(songIds[startIndex]);
  }, [loadSong]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio.src) return;
    if (audio.paused) {
      try { await audio.play(); } catch {}
    } else {
      audio.pause();
    }
  }, []);

  const seek = useCallback(t => {
    const audio = audioRef.current;
    if (!audio.src) return;
    audio.currentTime = Math.max(0, Math.min(t, audio.duration || t));
  }, []);

  // Stop everything and dismiss the mini-player. Distinct from pause: we
  // wipe the audio element's source, revoke the Blob URL, and clear the
  // Media Session entry so the lock-screen widget disappears too.
  const stop = useCallback(() => {
    const audio = audioRef.current;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    revokeUrl();
    setCurrentSong(null);
    setIsPlaying(false);
    setDuration(0);
    setQueue([]);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      try { navigator.mediaSession.playbackState = 'none'; } catch {}
    }
  }, []);

  const next = useCallback(() => {
    if (!queue.length || !currentSong) return;
    const i = queue.indexOf(currentSong.id);
    const nextId = queue[(i + 1) % queue.length];
    if (nextId) loadSong(nextId);
  }, [queue, currentSong, loadSong]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    // Spotify-style: if more than 3s into the song, restart instead of skipping.
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (!queue.length || !currentSong) return;
    const i = queue.indexOf(currentSong.id);
    const prevId = queue[(i - 1 + queue.length) % queue.length];
    if (prevId) loadSong(prevId);
  }, [queue, currentSong, loadSong]);

  // ─── audio element event wiring ────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => next();
    const onLoadedMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoadedMeta);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoadedMeta);
    };
  }, [next]);

  // ─── Media Session: lock screen + Control Center on iOS ────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;
    const ms = navigator.mediaSession;
    ms.metadata = new window.MediaMetadata({
      title: currentSong.title || 'Unknown',
      artist: currentSong.artist || 'Unknown Artist',
      album: currentSong.album || ''
      // artwork omitted for now — would require cover art extraction
    });
    const handlers = {
      play: () => audioRef.current.play().catch(() => {}),
      pause: () => audioRef.current.pause(),
      previoustrack: prev,
      nexttrack: next,
      seekto: e => {
        if (typeof e.seekTime === 'number') seek(e.seekTime);
      }
    };
    for (const [k, fn] of Object.entries(handlers)) {
      try { ms.setActionHandler(k, fn); } catch {}
    }
    return () => {
      for (const k of Object.keys(handlers)) {
        try { ms.setActionHandler(k, null); } catch {}
      }
    };
  }, [currentSong, next, prev, seek]);

  // Position state lets iOS show the scrubber. Update sparingly.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const audio = audioRef.current;
    let lastUpdate = 0;
    const tick = () => {
      const now = performance.now();
      if (now - lastUpdate > 1000 && Number.isFinite(audio.duration)) {
        lastUpdate = now;
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            position: audio.currentTime,
            playbackRate: audio.playbackRate
          });
        } catch {}
      }
    };
    audio.addEventListener('timeupdate', tick);
    return () => audio.removeEventListener('timeupdate', tick);
  }, [currentSong]);

  // Cleanup the last object URL on unmount.
  useEffect(() => () => revokeUrl(), []);

  const value = useMemo(() => ({
    audioRef,
    currentSong,
    isPlaying,
    duration,
    queue,
    loadSong,
    playFromQueue,
    togglePlay,
    seek,
    next,
    prev,
    stop
  }), [currentSong, isPlaying, duration, queue, loadSong, playFromQueue, togglePlay, seek, next, prev, stop]);

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerCtx);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}
