// Standalone helper server. Use this when you want the helper running on a
// different port/host than the frontend — e.g. when the frontend is deployed
// to GitHub Pages and the helper sits on your laptop reachable via Tailscale.
//
// For day-to-day local development you don't need to start this — `npm run
// dev` mounts the same handlers as Vite middleware.

import http from 'node:http';
import { dispatch, sendJson } from './handlers.mjs';

const PORT = parseInt(process.env.HELPER_PORT, 10) || 5174;
const HOST = process.env.HELPER_HOST || '127.0.0.1';

const server = http.createServer(async (req, res) => {
  const handled = await dispatch(req, res);
  if (!handled) sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`yt-dlp helper listening on http://${HOST}:${PORT}`);
  console.log(`Tip: only needed when running the helper separately from Vite.`);
});
