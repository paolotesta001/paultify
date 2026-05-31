// Helper request handlers, decoupled from any specific transport. Used by:
//   - helper/server.mjs       → standalone Node http server (production)
//   - helper/vite-plugin.mjs  → Vite dev-server middleware (single-process dev)
//
// Each handler reads from a Node IncomingMessage and writes to a
// ServerResponse — both raw http and Vite's Connect middleware expose those.

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import spotifyUrlInfo from 'spotify-url-info';

// spotify-url-info wraps Spotify's public embed endpoint to extract playlist
// / album / track metadata without API auth. Bound to Node's global fetch.
const { getDetails: spotifyGetDetails } = spotifyUrlInfo(fetch);

// '*' is fine here: no credentials are sent, and in dev the request is
// same-origin anyway. In standalone production (separate helper host), this
// can be tightened by setting HELPER_ORIGIN at startup.
const ALLOWED_ORIGIN = process.env.HELPER_ORIGIN || '*';
const MAX_QUERY = 300;
const MAX_BODY = 64 * 1024;
const DEEZER_BASE = 'https://api.deezer.com';

export const corsHeaders = () => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'X-Filename'
});

export function sendJson(res, status, obj) {
  res.writeHead(status, { ...corsHeaders(), 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Title-keyword blocklist applied at every tier. Even at tier 3 (no
// duration filter) we never want to silently grab an 8D / nightcore /
// slowed-reverb edit when the user asked for the studio cut. Without this,
// "Smooth Criminal" returned an 8D-audio version with channels jumping
// between headphones.
//
// We deliberately drop `live` and `remix` from this list because they're
// legitimate user requests sometimes — those exclusions live in the search
// query (where they can be conditionally skipped when the user typed those
// words themselves).
const TITLE_BLOCK = '(?i)(\\b8d\\b|\\b8 ?d audio\\b|nightcore|slowed|reverb|sped ?up|earrape|reaction|tutorial|how to play|guitar lesson|piano lesson|karaoke|instrumental|mashup)';

// Run yt-dlp once in `dir`. Returns { ok: true, file } on success, or
// { ok: false, error } if yt-dlp errored or produced no mp3. We pull this
// out of handleDownload so the caller can sequence multiple attempts with
// progressively looser filters.
async function runOneDownload(dir, target, filter) {
  // The title block is ANDed onto every tier, including the "no filter"
  // last-resort tier. yt-dlp's match-filter language uses `&` for AND and
  // !~= for "does not match regex".
  const fullFilter = filter
    ? `(${filter}) & title!~='${TITLE_BLOCK}'`
    : `title!~='${TITLE_BLOCK}'`;

  const args = [
    '-f', 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--embed-metadata',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    '--extractor-args', 'youtube:player_client=android,ios,tv_embedded,web',
    '--match-filter', fullFilter,
    '-o', join(dir, '%(title).150B.%(ext)s'),
    '--', target
  ];

  let proc;
  try {
    proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return { ok: false, error: err.code === 'ENOENT' ? 'yt-dlp not on PATH' : err.message, fatal: true };
  }

  let stderr = '';
  proc.stderr.on('data', c => { stderr += c.toString(); });
  let spawnError = null;
  proc.on('error', err => { spawnError = err; });

  const code = await new Promise(resolve => proc.on('close', resolve));
  if (spawnError) {
    const msg = spawnError.code === 'ENOENT'
      ? 'yt-dlp not on PATH'
      : spawnError.message;
    return { ok: false, error: msg, fatal: true };
  }
  if (code !== 0) {
    return { ok: false, error: stderr.trim().split('\n').pop()?.slice(0, 300) || 'download failed' };
  }

  const files = (await readdir(dir)).filter(f => f.toLowerCase().endsWith('.mp3'));
  if (!files.length) {
    // Most common cause: every candidate got rejected by --match-filter.
    // yt-dlp exits 0 in that case, so the caller can usefully retry with
    // a looser filter (or none).
    return { ok: false, error: 'no candidate matched filter' };
  }
  return { ok: true, file: files[0] };
}

export async function handleDownload(req, res) {
  let query, expectedDuration;
  try {
    const body = await readBody(req);
    const parsed = JSON.parse(body);
    query = parsed.query;
    expectedDuration = Number.isFinite(parsed.duration) ? parsed.duration : null;
  } catch {
    sendJson(res, 400, { error: 'invalid body' });
    return;
  }
  if (typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY) {
    sendJson(res, 400, { error: 'invalid query' });
    return;
  }
  const trimmed = query.trim();
  const isUrl = /^https?:\/\//i.test(trimmed);
  // Broader search (20 results vs 10) gives the title-block + duration
  // filters more candidates to pick from before we declare failure. Without
  // this, songs that *exist* on YouTube were failing because the top 10
  // search hits were all music videos / 8D edits / covers and got rejected.
  const target = isUrl ? trimmed : `ytsearch20:${trimmed}`;

  // Progressively wider filters. Skipping straight to "no filter" was
  // letting music videos / live cuts through too often; this ladder tries
  // the right cut first, opens up if YouTube's top 20 just don't fit.
  //   tier 0 — ±15s of the studio duration (rejects most music videos)
  //   tier 1 — ±45s (lets some long intros through)
  //   tier 2 — sane 60s–12min window
  //   tier 3 — no filter at all (last resort — but TITLE_BLOCK still
  //            applies, so we won't grab an 8D / nightcore edit silently)
  const tiers = [];
  if (expectedDuration && !isUrl) {
    tiers.push(`duration > ${Math.max(30, Math.round(expectedDuration - 15))} & duration < ${Math.round(expectedDuration + 15)}`);
    tiers.push(`duration > ${Math.max(30, Math.round(expectedDuration - 45))} & duration < ${Math.round(expectedDuration + 45)}`);
  }
  tiers.push('duration > 60 & duration < 720');
  tiers.push(null);

  let lastError = 'download failed';
  for (const filter of tiers) {
    const dir = await mkdtemp(join(tmpdir(), 'lyric-dl-'));
    try {
      const result = await runOneDownload(dir, target, filter);
      if (result.ok) {
        const buf = await readFile(join(dir, result.file));
        res.writeHead(200, {
          ...corsHeaders(),
          'Content-Type': 'audio/mpeg',
          'Content-Length': buf.length,
          'X-Filename': encodeURIComponent(result.file)
        });
        res.end(buf);
        return;
      }
      if (result.fatal) {
        sendJson(res, 500, { error: result.error });
        return;
      }
      lastError = result.error;
    } catch (err) {
      lastError = err.message || lastError;
    } finally {
      rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  if (!res.headersSent) {
    sendJson(res, 502, { error: lastError });
  }
}

export async function handleSpotify(req, res) {
  let url;
  try {
    const body = await readBody(req);
    url = JSON.parse(body).url;
  } catch {
    sendJson(res, 400, { error: 'invalid body' });
    return;
  }
  if (typeof url !== 'string' ||
      !/^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|album|track|artist)\/[a-zA-Z0-9]+/.test(url)) {
    sendJson(res, 400, { error: 'expected an open.spotify.com URL' });
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const details = await spotifyGetDetails(url, { signal: ctrl.signal });
    clearTimeout(t);

    const tracks = (details.tracks || []).map(tr => ({
      title: tr.name || '',
      artist: tr.artist || '',
      duration: tr.duration ? Math.round(tr.duration / 1000) : null
    })).filter(t => t.title && t.artist);

    sendJson(res, 200, {
      type: details.preview?.type || 'unknown',
      name: details.preview?.title || details.preview?.track || 'Spotify import',
      artist: details.preview?.artist || null,
      tracks
    });
  } catch (err) {
    sendJson(res, 502, { error: err.message?.slice(0, 300) || 'spotify fetch failed' });
  }
}

// Streams audio directly from yt-dlp's stdout into the HTTP response — no
// disk file, no full download wait. Browsers play it as it arrives.
//
// We deliberately request bestaudio (m4a / opus) WITHOUT mp3 transcoding so
// playback can start in ~1-2s instead of waiting for ffmpeg to fill an mp3
// buffer. iOS Safari and every modern desktop browser handle m4a (AAC).
export async function handleStream(req, res) {
  const u = new URL(req.url, 'http://x');
  const query = u.searchParams.get('q');
  if (!query || query.length > MAX_QUERY) {
    sendJson(res, 400, { error: 'invalid query' });
    return;
  }
  const trimmed = query.trim();
  const isUrl = /^https?:\/\//i.test(trimmed);
  const target = isUrl ? trimmed : `ytsearch1:${trimmed}`;

  // mp3 instead of m4a. YouTube's m4a is mostly NOT faststart (moov atom
  // at the end of the file), so browsers can't start decoding until the
  // whole file arrives — playback never began. mp3 has no header to wait
  // for; the browser plays each frame as it arrives.
  //
  // android + ios + tv_embedded routes around YouTube's bot checks and
  // age gates. Broader format fallback so we don't fail on uploads that
  // only offer opus.
  const args = [
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '5',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    '--extractor-args', 'youtube:player_client=android,ios,tv_embedded,web',
    '-o', '-',
    '--', target
  ];

  let proc;
  try {
    proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    sendJson(res, 500, { error: err.code === 'ENOENT' ? 'yt-dlp not on PATH' : err.message });
    return;
  }

  let headersSent = false;
  let stderr = '';
  proc.stderr.on('data', c => { stderr += c.toString(); });

  proc.stdout.once('data', () => {
    headersSent = true;
    res.writeHead(200, {
      ...corsHeaders(),
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache',
      'X-Stream': '1'
    });
  });
  proc.stdout.pipe(res);

  proc.on('close', code => {
    if (code !== 0 && !headersSent) {
      sendJson(res, 502, {
        error: stderr.trim().split('\n').pop()?.slice(0, 300) || 'stream failed'
      });
    }
  });
  proc.on('error', err => {
    if (!headersSent) sendJson(res, 500, { error: err.message });
  });

  res.on('close', () => {
    if (!proc.killed) proc.kill('SIGKILL');
  });
}

// Proxies Deezer's image CDN so the client can store cover art as a Blob
// in IndexedDB. Direct fetch from the browser would be blocked by CORS.
// Locked to Deezer's hostnames so this can't be abused as a generic web
// proxy.
export async function handleCover(req, res) {
  const url = new URL(req.url, 'http://x').searchParams.get('url');
  if (!url || !/^https:\/\/(?:e-)?cdns?-images\.dzcdn\.net\//.test(url)) {
    sendJson(res, 400, { error: 'expected a Deezer cdn URL' });
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) {
      sendJson(res, r.status, { error: `cover fetch ${r.status}` });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(200, {
      ...corsHeaders(),
      'Content-Type': r.headers.get('content-type') || 'image/jpeg',
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(buf);
  } catch (err) {
    sendJson(res, 502, { error: err.message || 'cover fetch failed' });
  }
}

export async function handleDeezer(req, res) {
  // Subpath is whatever follows '/api/deezer/' (with query string).
  const subpath = req.url.slice(req.url.indexOf('/api/deezer/') + '/api/deezer/'.length);
  if (!subpath || subpath.length > 500) {
    sendJson(res, 400, { error: 'invalid path' });
    return;
  }
  if (!/^[a-zA-Z0-9\/?&=+\-_.%,:]+$/.test(subpath)) {
    sendJson(res, 400, { error: 'invalid characters in path' });
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`${DEEZER_BASE}/${subpath}`, { signal: ctrl.signal });
    clearTimeout(t);
    const text = await r.text();
    res.writeHead(r.status, {
      ...corsHeaders(),
      'Content-Type': r.headers.get('content-type') || 'application/json'
    });
    res.end(text);
  } catch (err) {
    sendJson(res, 502, { error: err.message || 'upstream failed' });
  }
}

// Single dispatcher used by both the standalone server and the Vite plugin.
// Returns true if the request was handled, false to fall through.
export async function dispatch(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return true;
  }
  // Trim query string before route matching.
  const path = (req.url || '').split('?')[0];
  if (req.method === 'GET' && path === '/api/health') {
    sendJson(res, 200, { ok: true, version: 2 });
    return true;
  }
  if (req.method === 'POST' && path === '/api/download') {
    await handleDownload(req, res);
    return true;
  }
  if (req.method === 'POST' && path === '/api/spotify') {
    await handleSpotify(req, res);
    return true;
  }
  if (req.method === 'GET' && path.startsWith('/api/deezer/')) {
    await handleDeezer(req, res);
    return true;
  }
  if (req.method === 'GET' && path === '/api/cover') {
    await handleCover(req, res);
    return true;
  }
  if (req.method === 'GET' && path === '/api/stream') {
    await handleStream(req, res);
    return true;
  }
  return false;
}
