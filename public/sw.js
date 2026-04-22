/* OCO PWA service worker — v1 (Phase 1).
 *
 * Deliberately minimal. Browsers require a registered SW with `install`,
 * `activate`, and `fetch` listeners to consider a site "installable" — that
 * is the entire purpose of this file in v1.
 *
 * Phase 4 will introduce caching strategies (stale-while-revalidate for the
 * shell, network-only for /api). Do NOT add caching here without revisiting
 * the auth flow — a stale cache that returns yesterday's HTML can pin a
 * user to revoked code paths.
 */
const SW_VERSION = 'oco-pwa-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // No-op. Network handles every request in v1; SW exists only so install
  // criteria are met. The empty handler is intentional — omitting `fetch`
  // entirely makes some browsers downgrade installability.
});
