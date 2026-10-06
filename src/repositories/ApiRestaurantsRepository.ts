import type { RestaurantsRepository } from './RestaurantsRepository';
import type { Restaurant, MenuItem } from '../../state';
import api from '../api/client';
import { resolveAssetUrl } from '../api/config';

/**
 * Marketplace-engine restaurant endpoints (public):
 *   GET /api/restaurants           — open restaurants for this app
 *   GET /api/restaurants/{id}      — single + full menu inline
 *
 * The engine doesn't expose a separate /restaurants/{id}/menu endpoint —
 * menu items come back inside the restaurant detail. We pull from there.
 *
 * The engine surfaces `logo_url`, `image_url`, and `price` (dollars) +
 * `price_cents` (auth) on the JSON, so we use logo_url / image_url and
 * stop trying to build URLs from `data.logo`.
 */
export class ApiRestaurantsRepository implements RestaurantsRepository {
  async list(): Promise<Restaurant[]> {
    try {
      const data = await api.get('/restaurants');
      return this.transformRestaurants(data);
    } catch (error: any) {
      console.error('Error fetching restaurants:', error);
      throw error;
    }
  }

  async getById(id: number): Promise<Restaurant | null> {
    try {
      const data = await api.get(`/restaurants/${id}`);
      return this.transformRestaurant(data);
    } catch (error: any) {
      console.error(`Error fetching restaurant ${id}:`, error);
      throw error;
    }
  }

  /** Menu is inline on the restaurant payload — we fetch the restaurant and unwrap. */
  async getMenu(restaurantId: number): Promise<MenuItem[]> {
    try {
      const data = await api.get(`/restaurants/${restaurantId}`);
      return Array.isArray(data?.menu) ? this.transformMenuItems(data.menu) : [];
    } catch (error: any) {
      console.error(`Error fetching menu for restaurant ${restaurantId}:`, error);
      throw error;
    }
  }

  private transformRestaurants(data: any): Restaurant[] {
    if (!Array.isArray(data)) return [];
    return data.map(item => this.transformRestaurant(item)).filter(Boolean) as Restaurant[];
  }

  private transformRestaurant(data: any): Restaurant | null {
    if (!data) return null;

    return {
      id:                data.id,
      ownerEmail:        data.owner_email ?? data.ownerEmail,
      name:              data.name,
      cuisine:           data.cuisine || 'American',
      featured:          data.featured || false,
      menu:              data.menu ? this.transformMenuItems(data.menu) : [],
      notificationEmail: data.notification_email ?? data.notificationEmail,
      notificationPhone: data.notification_phone ?? data.notificationPhone,
      pathStop:          data.path_stop ?? null,
      description:       data.description ?? null,
      // Engine: `logo_url` accessor; legacy fallback to `logo`. Rebase onto a
      // reachable origin so it loads on device/phone, not just the dev browser.
      logo:              resolveAssetUrl(data.logo_url ?? data.logo) || null,
      status:            data.status ?? 'open',
    };
  }

  private transformMenuItems(data: any): MenuItem[] {
    if (!Array.isArray(data)) return [];
    return data.map(item => ({
      id:           item.id,
      name:         item.name,
      // Engine sends both `price` (dollars) and `price_cents`. Prefer dollars.
      price:        typeof item.price === 'number'
                      ? item.price
                      : (typeof item.price_cents === 'number' ? item.price_cents / 100 : 0),
      // Engine: `image_url` accessor; legacy fallback. Rebase onto a reachable
      // origin so uploaded photos load on device, not just the dev browser.
      image:        resolveAssetUrl(item.image_url ?? item.image) || '',
      description:  item.description || undefined,
      ingredients:  item.ingredients || undefined,
    }));
  }
}
