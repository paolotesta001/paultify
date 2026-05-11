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

  const [currentSong, setCurrentSong] = useState(null); // metadata + coverUrl, no Blob
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState([]); // array of song ids
  const [shuffle, setShuffle] = useState(false);
  // True while a stream is buffering (between issuing audio.src and the
  // first 'playing' event). Drives the "Buffering…" indicator in Player.
  const [streamLoading, setStreamLoading] = useState(false);
  // Surfaces the last audio error (e.g. helper offline mid-stream, codec
  // unsupported) so the UI can tell the user something instead of just
  // sitting there silently.
  const [audioError, setAudioError] = useState(null);
  const objectUrlRef = useRef(null);
  const coverUrlRef = useRef(null);
  // Tracks whether the user *wants* music playing. Set when they tap play
  // or load a song; cleared when they tap pause / stop. Drives the auto-
  // resume after iOS interrupts us for a notification or focus change.
  const wasPlayingRef = useRef(false);
  // Distinguishes "user tapped pause" from "system paused us". Cleared on
  // every play event so a subsequent system pause won't be mistaken for a
  // user pause.
  const userPauseRef = useRef(false);
  // Set during loadSong's src swap so the pause event fired by the audio
  // element's source replacement doesn't trigger an erroneous auto-resume.
  const transitioningRef = useRef(false);
  // Bounds the auto-resume retry burst when iOS keeps yanking the audio.
  const resumeAttemptsRef = useRef(0);

  // ─── helpers ───────────────────────────────────────────────────────────
  const revokeUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };
  const revokeCover = () => {
    if (coverUrlRef.current) {
      URL.revokeObjectURL(coverUrlRef.current);
      coverUrlRef.current = null;
    }
  };

  // Load a song by id: pull Blob from Dexie, swap the audio source.
  // Also stamps lastPlayedAt so Home's "Recently played" rail surfaces it.
  const loadSong = useCallback(async (songId, { autoplay = true } = {}) => {
    const audio = audioRef.current;
    const row = await getSong(songId);
    if (!row || !row.blob) return;

    transitioningRef.current = true;
    setStreamLoading(false);
    setAudioError(null);
    revokeUrl();
    revokeCover();
    const url = URL.createObjectURL(row.blob);
    objectUrlRef.current = url;
    // Blob URL is in-memory — 'metadata' preload is plenty and avoids
    // wasted decode work for songs we may not play in full.
    audio.preload = 'metadata';
    audio.src = url;
    audio.load();

    const { blob, coverBlob, ...meta } = row;
    let coverUrl = null;
    if (coverBlob) {
      coverUrl = URL.createObjectURL(coverBlob);
      coverUrlRef.current = coverUrl;
    }
    setCurrentSong({ ...meta, coverUrl });
    setDuration(meta.duration || 0);

    // Fire-and-forget timestamp update — failure is harmless.
    db.songs.update(songId, { lastPlayedAt: Date.now() }).catch(() => {});

    if (autoplay) {
      try {
        await audio.play();
        wasPlayingRef.current = true;
      } catch {
        // autoplay blocked — user must tap play
      }
    }
    transitioningRef.current = false;
  }, []);

  // ─── public methods ────────────────────────────────────────────────────
  const playFromQueue = useCallback(async (songIds, startIndex = 0) => {
    setQueue(songIds);
    await loadSong(songIds[startIndex]);
  }, [loadSong]);

  // Update only the metadata on the currently-streaming track WITHOUT
  // touching the audio element. Used to attach lyrics after they finish
  // fetching, without restarting playback.
  const updateStreamMeta = useCallback((patch) => {
    setCurrentSong(s => (s && s.isStream) ? { ...s, ...patch } : s);
  }, []);

  // Stream a song from a URL without persisting to IndexedDB. The caller
  // provides a metadata bag (title/artist/coverUrl/duration) and optional
  // pre-fetched LRC lyrics in `streamLyrics`. The track has no DB id.
  const loadStream = useCallback(async (url, meta = {}, { autoplay = true } = {}) => {
    const audio = audioRef.current;
    transitioningRef.current = true;
    setAudioError(null);
    setStreamLoading(autoplay);
    revokeUrl();
    revokeCover();
    objectUrlRef.current = null;
    // 'auto' tells the browser to keep buffering aggressively, which is
    // what we want for a chunked HTTP stream from the helper. With
    // 'metadata' (the default for our Blob-backed loadSong), Safari stops
    // pulling after the first response chunk and playback never starts.
    audio.preload = 'auto';
    audio.src = url;
    audio.load();
    setCurrentSong({
      id: null,
      isStream: true,
      streamQuery: meta.streamQuery || null,
      title: meta.title || 'Streaming',
      artist: meta.artist || '',
      album: meta.album || null,
      duration: meta.duration || 0,
      coverUrl: meta.coverUrl || null,
      streamLyrics: meta.streamLyrics || null
    });
    setDuration(meta.duration || 0);
    setQueue([]);
    if (autoplay) {
      try {
        await audio.play();
        wasPlayingRef.current = true;
      } catch (err) {
        setAudioError(err?.message || 'play blocked');
      }
    }
    transitioningRef.current = false;
  }, []);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio.src) return;
    if (audio.paused) {
      try {
        await audio.play();
        wasPlayingRef.current = true;
      } catch {}
    } else {
      // Mark this as user-intent BEFORE pausing so the pause-event handler
      // doesn't try to auto-resume us a second later.
      userPauseRef.current = true;
      wasPlayingRef.current = false;
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
    userPauseRef.current = true;
    wasPlayingRef.current = false;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    revokeUrl();
    revokeCover();
    setCurrentSong(null);
    setIsPlaying(false);
    setDuration(0);
    setQueue([]);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      try { navigator.mediaSession.playbackState = 'none'; } catch {}
    }
  }, []);

  const toggleShuffle = useCallback(() => setShuffle(s => !s), []);

  // When shuffle is on, next() picks any other queue item at random; prev()
  // also goes random so cycling backwards is meaningful. With shuffle off
  // the queue plays in its original order.
  const next = useCallback(() => {
    if (!queue.length || !currentSong) return;
    if (shuffle && queue.length > 1) {
      const others = queue.filter(id => id !== currentSong.id);
      const nextId = others[Math.floor(Math.random() * others.length)];
      if (nextId) loadSong(nextId);
      return;
    }
    const i = queue.indexOf(currentSong.id);
    const nextId = queue[(i + 1) % queue.length];
    if (nextId) loadSong(nextId);
  }, [queue, currentSong, loadSong, shuffle]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    // Spotify-style: if more than 3s into the song, restart instead of skipping.
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (!queue.length || !currentSong) return;
    if (shuffle && queue.length > 1) {
      const others = queue.filter(id => id !== currentSong.id);
      const prevId = others[Math.floor(Math.random() * others.length)];
      if (prevId) loadSong(prevId);
      return;
    }
    const i = queue.indexOf(currentSong.id);
    const prevId = queue[(i - 1 + queue.length) % queue.length];
    if (prevId) loadSong(prevId);
  }, [queue, currentSong, loadSong, shuffle]);

  // ─── audio element event wiring ────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    const onPlay = () => {
      setIsPlaying(true);
      // Cleared so the next "system pause" can still trigger auto-resume
      // even if the previous pause was user-initiated.
      userPauseRef.current = false;
      resumeAttemptsRef.current = 0;
      setStreamLoading(false);
      setAudioError(null);
    };
    const onPlaying = () => {
      // Fired when playback actually starts producing sound — best signal
      // that buffering is done. Distinct from onPlay (which can fire while
      // audio is still pulling its first bytes).
      setStreamLoading(false);
    };
    const onWaiting = () => {
      // Stalled mid-stream; the player UI shows a spinner.
      setStreamLoading(true);
    };
    const onAudioError = () => {
      const err = audio.error;
      setStreamLoading(false);
      if (err) setAudioError(`audio error (${err.code})`);
    };
    const onPause = () => {
      setIsPlaying(false);
      // User explicitly paused — leave them alone.
      if (userPauseRef.current) return;
      // We're loading a new song; the pause is just the src swap.
      if (transitioningRef.current) return;
      // System paused us (notification, focus loss, briefly off-route).
      // Schedule a resume if we expected to be playing. Cap retries so
      // we don't loop forever if iOS really wants us off.
      if (wasPlayingRef.current && resumeAttemptsRef.current < 3) {
        resumeAttemptsRef.current++;
        const delay = 400 * resumeAttemptsRef.current;
        setTimeout(() => {
          if (wasPlayingRef.current && audio.paused) {
            audio.play().catch(() => {});
          }
        }, delay);
      }
    };
    const onEnded = () => next();
    const onLoadedMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoadedMeta);
    audio.addEventListener('error', onAudioError);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoadedMeta);
      audio.removeEventListener('error', onAudioError);
    };
  }, [next]);

  // Visibility recovery: when the user returns to the app and audio is
  // paused but they expected music, kick playback back on. Covers cases
  // where iOS suspended audio while we were backgrounded for a notification
  // or quick app-switch.
  useEffect(() => {
    const handler = () => {
      const audio = audioRef.current;
      if (document.hidden) return;
      if (wasPlayingRef.current && audio.src && audio.paused) {
        audio.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, []);

  // ─── Media Session: lock screen + Control Center on iOS ────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;
    const ms = navigator.mediaSession;
    ms.metadata = new window.MediaMetadata({
      title: currentSong.title || 'Unknown',
      artist: currentSong.artist || 'Unknown Artist',
      album: currentSong.album || '',
      // The same Blob URL the in-app player uses; iOS picks it up for the
      // lock-screen / Control Center widget.
      artwork: currentSong.coverUrl
        ? [{ src: currentSong.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
        : []
    });
    const handlers = {
      play: () => {
        audioRef.current.play().then(() => {
          wasPlayingRef.current = true;
        }).catch(() => {});
      },
      pause: () => {
        // Lock-screen / Bluetooth pause counts as user intent — flag it so
        // the audio's pause event doesn't trigger an auto-resume.
        userPauseRef.current = true;
        wasPlayingRef.current = false;
        audioRef.current.pause();
      },
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

  // Cleanup the last object URLs on unmount.
  useEffect(() => () => { revokeUrl(); revokeCover(); }, []);

  const value = useMemo(() => ({
    audioRef,
    currentSong,
    isPlaying,
    duration,
    queue,
    shuffle,
    streamLoading,
    audioError,
    loadSong,
    loadStream,
    updateStreamMeta,
    playFromQueue,
    togglePlay,
    seek,
    next,
    prev,
    stop,
    toggleShuffle
  }), [currentSong, isPlaying, duration, queue, shuffle, streamLoading, audioError, loadSong, loadStream, updateStreamMeta, playFromQueue, togglePlay, seek, next, prev, stop, toggleShuffle]);

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerCtx);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}
