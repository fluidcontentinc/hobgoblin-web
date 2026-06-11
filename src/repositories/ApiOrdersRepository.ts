import type { OrdersRepository } from './OrdersRepository';
import type { Order } from '../../state';
import api from '../api/client';

/**
 * Marketplace-engine order shape:
 *   POST /api/orders body: { items: [{menu_item_id, quantity}, ...] }
 *   Engine auto-derives seller_id from restaurant.owner_id and stamps
 *   restaurant_id on the order. No need to send restaurant/buyer/driver.
 *
 * Response is the persisted Order with eager-loaded items.menuItem,
 * items.listing, restaurant, and parties. Prices come back in cents
 * (subtotal_cents, total_cents, fee_cents); we expose `total` in dollars
 * for the existing UI.
 */
export class ApiOrdersRepository implements OrdersRepository {
  async list(): Promise<Order[]> {
    try {
      const data = await api.get('/orders');
      // Engine returns a paginator: { data: [...], current_page, total, ... }
      // After envelope unwrap, that's the bare paginator object.
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      return rows.map((row: any) => this.transformOrder(row)).filter(Boolean) as Order[];
    } catch (error: any) {
      console.error('Error fetching orders:', error);
      throw error;
    }
  }

  async create(order: Omit<Order, 'id' | 'date'>): Promise<Order> {
    try {
      // Translate the legacy `items` (with id+name+price) into the
      // engine's required {menu_item_id, quantity} shape.
      const items = (order.items ?? []).map((it: any) => ({
        menu_item_id: it.menuItemId ?? it.menu_item_id ?? it.id,
        quantity:     it.quantity ?? 1,
      }));

      const payload = { items };
      const data = await api.post('/orders', payload);
      const transformed = this.transformOrder(data);
      if (!transformed) throw new Error('Empty response from order create');
      return transformed;
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  async getById(id: number): Promise<Order | null> {
    try {
      const data = await api.get(`/orders/${id}`);
      return this.transformOrder(data);
    } catch (error: any) {
      console.error(`Error fetching order ${id}:`, error);
      throw error;
    }
  }

  private transformOrder(data: any): Order | null {
    if (!data) return null;

    // Engine prices are cents — convert to dollars for UI.
    const totalCents = data.total_cents ?? 0;
    const total = typeof totalCents === 'number' ? totalCents / 100 : parseFloat(data.total) || 0;

    return {
      id: data.id,
      restaurantId:   data.restaurant_id ?? data.restaurantId,
      restaurantName: data.restaurant?.name ?? data.restaurant_name ?? data.restaurantName,
      items:          Array.isArray(data.items) ? data.items : [],
      total,
      date:           data.created_at ?? data.date ?? new Date().toISOString(),
      state:          data.state,
      status:         data.status,
      t_created:      data.created_at ?? data.t_created,
      type:           data.type,
      buyerEmail:     data.buyer?.email ?? data.buyer_email ?? data.buyerEmail,
      driverEmail:    data.driver?.email ?? data.driver_email ?? data.driverEmail,
    };
  }
}
