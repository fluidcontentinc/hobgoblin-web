/**
 * Path to Power map — admin-controlled snack placements shown on the kid map.
 *
 * Positions are stored as normalized coordinates (0..1) relative to the
 * artboard so a placement made in the admin editor renders at the same spot
 * on the kid map regardless of viewport size.
 *
 * This is the data contract the backend should match later (see the backend
 * spec). For now it is backed by LocalPathMapRepository (AsyncStorage).
 */

export type PathSnackSource = 'upload' | 'menu';

export interface PathSnack {
  /** Stable client id (uuid-ish). Backend may return numeric ids as strings. */
  id: string;
  label?: string;
  /** Data URL (uploaded) or a remote menu item image URL. */
  image: string;
  source: PathSnackSource;
  /** Set when source === 'menu' so the kid map can deep-link to the restaurant. */
  restaurantId?: number;
  menuItemId?: number;
  /**
   * Adventure this snack starts. All snacks stay visible to every kid, but
   * snacks matching the kid's active adventure are highlighted.
   */
  adventureId?: number | null;
  /**
   * Snapshot of the linked adventure title. Stored on the snack because the
   * kid API has no get-adventure-by-id endpoint, so the start popup reads this.
   */
  adventureTitle?: string;
  /** "What you'd get out of it" blurb shown in the kid start popup. */
  reward?: string;
  /** Normalized position, 0..1 of artboard width/height. */
  xPct: number;
  yPct: number;
}

/**
 * An always-on restaurant POI: a permanent fixture on the map (shown unless the
 * restaurant is paused/closed), independent of any mission. Tapping it opens
 * the restaurant's spooky close-up scene (`sceneUrl`).
 */
export interface PathRestaurant {
  id: number;
  name: string;
  xPct: number;
  yPct: number;
  /** Close-up scene image, or null if the admin hasn't uploaded one yet. */
  sceneUrl: string | null;
  logoUrl: string | null;
}

export interface PathMap {
  snacks: PathSnack[];
  /** Permanent restaurant POIs (open + placed). */
  restaurants: PathRestaurant[];
  updatedAt: string;
}

export interface PathMapRepository {
  get(): Promise<PathMap>;
  save(map: PathMap): Promise<PathMap>;
}

export const EMPTY_PATH_MAP: PathMap = { snacks: [], restaurants: [], updatedAt: '' };
