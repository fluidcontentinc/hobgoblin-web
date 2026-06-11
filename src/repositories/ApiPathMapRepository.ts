import api from '../api/client';
import type { PathMap, PathMapRepository, PathSnack, PathSnackSource } from './PathMapRepository';
import { EMPTY_PATH_MAP } from './PathMapRepository';

/**
 * Backend-backed Path to Power map repository.
 *
 * The engine stores snack positions as `x_pct` / `y_pct` (matching the rest
 * of the Laravel snake_case convention); the frontend's PathSnack uses
 * camelCase (`xPct` / `yPct`). Transform helpers below keep that boundary
 * in one place so the rest of the app stays oblivious.
 *
 * Snack images are remote URLs by the time they hit save() — admins upload
 * binaries via api.uploadPathMapImage() first (see PathMapTab.addUploadSnack)
 * and put the returned URL on the snack. The backend rejects raw data URLs.
 */
export class ApiPathMapRepository implements PathMapRepository {
  async get(): Promise<PathMap> {
    try {
      const data = await api.getPathMap();
      const rawSnacks: any[] = Array.isArray(data?.snacks) ? data.snacks : [];
      return {
        snacks: rawSnacks.map(fromApi).filter((s): s is PathSnack => s !== null),
        updatedAt: data?.updated_at ?? '',
      };
    } catch (error: any) {
      // 404 or missing → treat as empty map so the UI can still render.
      if (error?.type === 'NOT_FOUND' || error?.status === 404) {
        return EMPTY_PATH_MAP;
      }
      throw error;
    }
  }

  async save(map: PathMap): Promise<PathMap> {
    const payload = map.snacks.map(toApi);
    const data = await api.savePathMap(payload);
    const rawSnacks: any[] = Array.isArray(data?.snacks) ? data.snacks : [];
    return {
      snacks: rawSnacks.map(fromApi).filter((s): s is PathSnack => s !== null),
      updatedAt: data?.updated_at ?? new Date().toISOString(),
    };
  }
}

/** Backend snake_case → frontend camelCase. Returns null for malformed rows. */
function fromApi(raw: any): PathSnack | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id != null ? String(raw.id) : null;
  const image = typeof raw.image === 'string' ? raw.image : null;
  const source: PathSnackSource = raw.source === 'menu' ? 'menu' : 'upload';
  const xPct = clamp01(Number(raw.x_pct ?? raw.xPct ?? 0));
  const yPct = clamp01(Number(raw.y_pct ?? raw.yPct ?? 0));
  if (!id || !image) return null;

  return {
    id,
    label: raw.label ?? undefined,
    image,
    source,
    restaurantId: numOrUndef(raw.restaurant_id ?? raw.restaurantId),
    menuItemId:   numOrUndef(raw.menu_item_id ?? raw.menuItemId),
    adventureId:  raw.adventure_id ?? raw.adventureId ?? null,
    adventureTitle: raw.adventure_title ?? raw.adventureTitle ?? undefined,
    reward: raw.reward ?? undefined,
    xPct,
    yPct,
  };
}

/** Frontend camelCase → backend snake_case. */
function toApi(snack: PathSnack): Record<string, any> {
  return {
    id: snack.id,
    label: snack.label ?? null,
    image: snack.image,
    source: snack.source,
    restaurant_id: snack.restaurantId ?? null,
    menu_item_id: snack.menuItemId ?? null,
    adventure_id: snack.adventureId ?? null,
    adventure_title: snack.adventureTitle ?? null,
    reward: snack.reward ?? null,
    x_pct: clamp01(snack.xPct),
    y_pct: clamp01(snack.yPct),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function numOrUndef(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && v != null ? n : undefined;
}
