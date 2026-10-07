import type { Order } from '../../state';

export type OrderLine = { menu_item_id: number; quantity: number };

export interface OrdersRepository {
  list(): Promise<Order[]>;
  /**
   * `lines` are what the engine bills; `items` are display labels only.
   * Reuse the same `idempotencyKey` when retrying so a lost response can't place the order twice.
   */
  create(order: Omit<Order, 'id' | 'date'> & { lines: OrderLine[]; idempotencyKey?: string }): Promise<Order>;
  getById(id: number): Promise<Order | null>;
}
