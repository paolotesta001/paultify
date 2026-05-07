// Single source of truth for the helper's base URL.
//
//   ''                         → same origin (default). Works in dev because
//                                Vite has the helper plugin mounted, so
//                                /api/* lands on the same port.
//   'https://laptop.tail…'     → cross-origin. Set this when the deployed
//                                bundle (GitHub Pages, etc.) needs to reach
//                                a helper on a different host.
//
// Set via `VITE_HELPER_BASE` at build time. Dev defaults to same-origin.
export const HELPER_BASE = (import.meta.env.VITE_HELPER_BASE || '').replace(/\/$/, '');

export const apiUrl = path => `${HELPER_BASE}${path}`;
