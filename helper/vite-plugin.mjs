import { dispatch } from './handlers.mjs';

// Vite plugin that mounts the helper handlers as middleware on the same
// dev-server port as the frontend. With this in place, `npm run dev` is the
// only command needed for local work — no second terminal, no CORS, no
// helper bookkeeping.
//
// In production builds (`npm run build`) the plugin contributes nothing; the
// helper has to live somewhere else (your laptop, a VPS) reachable via the
// VITE_HELPER_BASE URL the deployed bundle was built with.
export function helperPlugin() {
  return {
    name: 'lyric-helper',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const handled = await dispatch(req, res);
          if (!handled) next();
        } catch (err) {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'helper crashed' }));
          }
        }
      });
    }
  };
}
