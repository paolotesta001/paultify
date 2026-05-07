// Parses LRC format. Returns an array of { time, text }, sorted by time.
//
// Supports:
//   [mm:ss.xx] text          — standard timestamp
//   [mm:ss.xxx] text         — millisecond precision
//   [mm:ss] text             — coarse timestamp
//   [00:01.00][00:30.00]chorus  — multiple timestamps on one line
//   [ti:..] [ar:..] [al:..]  — ID tags (extracted into `meta`)
//
// Lines with no timestamp are dropped (not karaoke-syncable).

const TIME_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_RE = /^\[(ti|ar|al|length|by|offset):(.*)\]$/i;

export function parseLRC(text) {
  if (!text || typeof text !== 'string') {
    return { lines: [], meta: {} };
  }
  const lines = [];
  const meta = {};
  let offsetMs = 0;

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const metaMatch = trimmed.match(META_RE);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      const val = metaMatch[2].trim();
      if (key === 'offset') offsetMs = parseInt(val, 10) || 0;
      else meta[key] = val;
      continue;
    }

    // collect every [mm:ss.xx] prefix on this line
    const stamps = [];
    let lastIdx = 0;
    TIME_RE.lastIndex = 0;
    let match;
    while ((match = TIME_RE.exec(trimmed)) !== null) {
      // bail out if the match is no longer a leading prefix —
      // we only treat timestamps that come before any text as sync points.
      if (match.index !== lastIdx) break;
      stamps.push(match);
      lastIdx = TIME_RE.lastIndex;
    }
    if (!stamps.length) continue;

    const lyricText = trimmed.slice(lastIdx).trim();
    for (const m of stamps) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracStr = m[3] || '0';
      // normalize 2-digit centiseconds and 3-digit milliseconds
      const frac = parseInt(fracStr, 10) / 10 ** fracStr.length;
      const time = min * 60 + sec + frac - offsetMs / 1000;
      lines.push({ time: Math.max(0, time), text: lyricText });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return { lines, meta };
}

// Binary search: index of the last line whose time <= t. Returns -1 if t is
// before the first line. O(log n), cheap to call inside rAF.
export function findActiveIndex(lines, t) {
  if (!lines.length || t < lines[0].time) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lines[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
