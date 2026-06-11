import { safeGetJson, safeSetJson } from '../../utils/storage';
import type { PathMap, PathMapRepository } from './PathMapRepository';
import { EMPTY_PATH_MAP } from './PathMapRepository';

const STORAGE_KEY = 'hh.pathMap.v1';

/**
 * Local stand-in for a future shared backend endpoint
 * (GET /api/path-map, PUT /api/admin/path-map). Persists the whole map to
 * AsyncStorage so the admin editor and the kid map read the same data on the
 * same device. Swap this for an ApiPathMapRepository once the backend exists.
 */
export class LocalPathMapRepository implements PathMapRepository {
  async get(): Promise<PathMap> {
    return await safeGetJson<PathMap>(STORAGE_KEY, EMPTY_PATH_MAP);
  }

  async save(map: PathMap): Promise<PathMap> {
    const next: PathMap = { ...map, updatedAt: new Date().toISOString() };
    await safeSetJson(STORAGE_KEY, next);
    return next;
  }
}
