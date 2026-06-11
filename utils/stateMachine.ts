import { OrderEvents, OrderStates, orderTransitions } from './orderStates';
import type { Order } from '../state';

function nowISO() {
  return new Date().toISOString();
}

export function getOrderState(order: Order): string {
  return (order.state || order.status || '').toLowerCase();
}

export function applyOrderEvent(order: Order, event: string, extra: Partial<Order> = {}): Order {
  const current = getOrderState(order);
  const key = `${current}:${event}`;
  const nextState = orderTransitions[key];
  if (!nextState) {
    throw new Error(`Invalid transition: ${current} + ${event}`);
  }

  const updated: Order = {
    ...order,
    ...extra,
    state: nextState,
  };

  if (nextState === OrderStates.PREPARING && !order.t_created) {
    updated.t_created = nowISO();
  }

  return updated;
}

export { OrderStates, OrderEvents };


