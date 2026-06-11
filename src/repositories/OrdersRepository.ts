import type { Order } from '../../state';

export interface OrdersRepository {
  list(): Promise<Order[]>;
  create(order: Omit<Order, 'id' | 'date'>): Promise<Order>;
  getById(id: number): Promise<Order | null>;
}

