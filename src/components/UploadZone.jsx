import { useCallback, useRef, useState } from 'react';
import { addSong, setLyrics } from '../db/database.js';
import { extractMetadata } from '../lib/metadata.js';
import { fetchLyricsFromLrclib } from '../lib/lrclib.js';
import { Upload } from './Icons.jsx';

// Accepts MP3s and optional LRCs in one drop. LRCs are matched to MP3s by
// basename (song.mp3 ↔ song.lrc). When no LRC is supplied for a track, we
// hit LRCLIB using the parsed ID3 metadata.
//
// Files are processed one at a time. With multi-MB MP3s, parallel parsing
// would spike memory and make iOS Safari janky on save.
export default function UploadZone() {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState([]); // [{ name, status, error? }]

  const handleFiles = useCallback(async fileList => {
    const files = Array.from(fileList);
    if (!files.length) return;

    // Group by basename so a dropped pair (song.mp3 + song.lrc) is matched.
    const byBase = new Map();
    for (const f of files) {
      const base = f.name.replace(/\.[^.]+$/, '').toLowerCase();
      if (!byBase.has(base)) byBase.set(base, {});
      const slot = byBase.get(base);
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'lrc' || ext === 'txt') slot.lrc = f;
      else if (ext === 'mp3' || f.type.startsWith('audio/')) slot.audio = f;
    }

    const audioGroups = [...byBase.values()].filter(g => g.audio);
    setProgress(audioGroups.map(g => ({ name: g.audio.name, status: 'queued' })));

    for (let i = 0; i < audioGroups.length; i++) {
      const { audio, lrc } = audioGroups[i];
      updateProgress(i, { status: 'parsing' });
      try {
        const meta = await extractMetadata(audio);
        const id = crypto.randomUUID();

        // Persist the audio Blob first so the song shows in the library
        // even if the lyrics step fails.
        await addSong({
          id,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          duration: meta.duration,
          mimeType: audio.type || 'audio/mpeg',
          blob: audio,
          coverBlob: meta.coverBlob,
          addedAt: Date.now()
        });

        updateProgress(i, { status: 'lyrics' });

        let lrcText = null;
        let plainText = null;
        let source = 'none';
        if (lrc) {
          lrcText = await lrc.text();
          source = 'uploaded';
        } else {
          const fetched = await fetchLyricsFromLrclib({
            artist: meta.artist,
            title: meta.title,
            album: meta.album,
            duration: meta.duration
          });
          if (fetched) {
            lrcText = fetched.syncedLyrics;
            plainText = fetched.plainLyrics;
            source = fetched.source;
          }
        }

        await setLyrics(id, { lrcText, plainText, source });
        updateProgress(i, { status: 'done' });
      } catch (err) {
        console.error(err);
        updateProgress(i, { status: 'error', error: err.message });
      }

      // Yield to the event loop between files so input/scroll stay snappy.
      await new Promise(r => setTimeout(r, 0));
    }

    // Auto-clear the progress strip after a short pause.
    setTimeout(() => setProgress([]), 2500);
  }, []);

  const updateProgress = (i, patch) => {
    setProgress(p => p.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };

  const onDrop = e => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={
        'rounded-xl border-2 border-dashed p-6 text-center transition-colors ' +
        (dragOver ? 'border-accent bg-accent/10' : 'border-ink-600 bg-ink-800/40')
      }
    >
      <div className="flex flex-col items-center gap-3 text-ink-300">
        <Upload size={32} />
        <p className="text-sm">
          Drag MP3 files here<br />
          <span className="text-ink-400">…or pair them with matching <code>.lrc</code> files</span>
        </p>
        <button
          onClick={() => inputRef.current?.click()}
          className="mt-1 px-4 py-2 rounded-full bg-accent text-ink-900 text-sm font-semibold active:scale-95 transition-transform"
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.lrc,audio/*"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {progress.length > 0 && (
        <ul className="mt-5 text-left space-y-1.5">
          {progress.map((row, i) => (
            <li key={i} className="flex justify-between text-xs">
              <span className="truncate mr-2 text-ink-300">{row.name}</span>
              <span className={
                row.status === 'done' ? 'text-accent' :
                row.status === 'error' ? 'text-red-400' :
                'text-ink-400'
              }>
                {row.status === 'done' ? 'saved' : row.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
