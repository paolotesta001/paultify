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

export async function handleDownload(req, res) {
  let query;
  try {
    const body = await readBody(req);
    query = JSON.parse(body).query;
  } catch {
    sendJson(res, 400, { error: 'invalid body' });
    return;
  }
  if (typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY) {
    sendJson(res, 400, { error: 'invalid query' });
    return;
  }
  const trimmed = query.trim();
  const target = /^https?:\/\//i.test(trimmed) ? trimmed : `ytsearch1:${trimmed}`;

  const dir = await mkdtemp(join(tmpdir(), 'lyric-dl-'));
  try {
    const args = [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--embed-metadata',
      '--no-playlist',
      '--no-warnings',
      '--quiet',
      '-o', join(dir, '%(title).150B.%(ext)s'),
      '--', target
    ];

    let proc;
    try {
      proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      sendJson(res, 500, { error: 'yt-dlp not found on PATH. Run: winget install yt-dlp' });
      return;
    }

    let stderr = '';
    proc.stderr.on('data', c => { stderr += c.toString(); });

    let spawnError = null;
    proc.on('error', err => { spawnError = err; });

    const code = await new Promise(resolve => proc.on('close', resolve));

    if (spawnError) {
      const msg = spawnError.code === 'ENOENT'
        ? 'yt-dlp not found on PATH. Run: winget install yt-dlp'
        : spawnError.message;
      sendJson(res, 500, { error: msg });
      return;
    }
    if (code !== 0) {
      sendJson(res, 500, { error: (stderr.trim().split('\n').pop() || 'download failed').slice(0, 500) });
      return;
    }

    const files = (await readdir(dir)).filter(f => f.toLowerCase().endsWith('.mp3'));
    if (!files.length) {
      sendJson(res, 404, { error: 'no audio extracted (ffmpeg installed?)' });
      return;
    }

    const mp3Path = join(dir, files[0]);
    const buf = await readFile(mp3Path);

    res.writeHead(200, {
      ...corsHeaders(),
      'Content-Type': 'audio/mpeg',
      'Content-Length': buf.length,
      'X-Filename': encodeURIComponent(files[0])
    });
    res.end(buf);
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'unknown error' });
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
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
  return false;
}
