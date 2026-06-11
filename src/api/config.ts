import { Platform } from 'react-native';

/**
 * Marketplace-engine connection config.
 *
 * The frontend talks to the marketplace-engine API. Local dev runs under
 * Herd at http://marketplace-engine.test/api. Production is wired through
 * EXPO_PUBLIC_API_URL (see app.json / EAS env).
 *
 * Every request also sends X-App-Key — a per-app token the engine uses to
 * resolve which marketplace app the request belongs to. For local dev,
 * sync the value with marketplace-engine/.env's HOBGOBLIN_APP_KEY.
 */

export const API_BASE_URL: string = (() => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Local-dev defaults — point at Herd's marketplace-engine site.
  if (Platform.OS === 'web') {
    return 'http://marketplace-engine.test/api';
  } else if (Platform.OS === 'android') {
    // Android emulator can't reach .test names — use the host machine's IP.
    // 10.0.2.2 maps to the host loopback inside the emulator.
    return 'http://10.0.2.2/api';
  } else if (Platform.OS === 'ios') {
    return 'http://marketplace-engine.test/api';
  }

  return 'http://marketplace-engine.test/api';
})();

/**
 * X-App-Key value — identifies which marketplace app this client belongs to.
 * Set via EXPO_PUBLIC_APP_KEY env var; defaults to the local dev seed value.
 */
export const APP_KEY: string =
  process.env.EXPO_PUBLIC_APP_KEY || 'hobgoblin-local-dev-key';

/**
 * Backend origin without the `/api` suffix.
 *
 * Used by {@link resolveAssetUrl} to rebase relative asset paths the
 * backend may return (e.g. `/storage/narrative-assets/foo.mp4`) onto the
 * correct backend host — the frontend dev server can't serve them.
 */
export const BACKEND_ORIGIN: string = API_BASE_URL.replace(/\/api\/?$/, '');

/**
 * Resolve an asset URL into an absolute URL the browser can fetch.
 *
 * The backend may hand back asset URLs in either of two forms:
 *
 *   1. **Absolute** — e.g. `http://marketplace-engine.test/storage/foo.mp4`.
 *      Pass through unchanged.
 *
 *   2. **Relative** — e.g. `/storage/narrative-assets/foo.mp4` or
 *      `/assets/transmissions/welcome.mp4` (the format used by the
 *      NarrativeAssetSeeder). When the frontend sets such a path as
 *      `<img src>`, the browser resolves it against the frontend's own
 *      origin (the Expo dev server) — not the backend — and 404s.
 *
 * This helper normalises both into absolute URLs anchored at the backend
 * origin so the same code path works regardless of how the API serialises
 * the asset.
 *
 * Other URL schemes (data:, blob:, file:) are returned unchanged — only
 * bare relative paths are rebased.
 */
export function resolveAssetUrl(url: string | null | undefined): string {
  if (!url) return '';
  // Has a scheme (http://, https://, data:, blob:, etc.)? Pass through.
  if (/^[a-z][a-z\d+\-.]*:/i.test(url)) return url;
  // Otherwise treat as a backend-relative path.
  return `${BACKEND_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}
