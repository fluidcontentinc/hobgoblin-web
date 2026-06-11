import type { Restaurant, MenuItem } from '../../state';

export interface RestaurantsRepository {
  list(): Promise<Restaurant[]>;
  getById(id: number): Promise<Restaurant | null>;
  getMenu(restaurantId: number): Promise<MenuItem[]>;
}

