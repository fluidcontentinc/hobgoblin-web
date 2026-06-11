export const OrderStates = {
  CREATED: 'created',
  PREPARING: 'preparing',
  READY: 'ready',
  PICKED_UP: 'picked_up',
  EN_ROUTE: 'en_route',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

export type OrderState = (typeof OrderStates)[keyof typeof OrderStates];

export const OrderEvents = {
  START_PREPARING: 'start_preparing',
  MARK_READY: 'mark_ready',
  PICKUP: 'pickup',
  START_ROUTE: 'start_route',
  COMPLETE_DELIVERY: 'complete_delivery',
  CANCEL: 'cancel',
} as const;

export type OrderEvent = (typeof OrderEvents)[keyof typeof OrderEvents];

export const orderTransitions: Record<string, OrderState> = {
  [`${OrderStates.CREATED}:${OrderEvents.START_PREPARING}`]: OrderStates.PREPARING,
  [`${OrderStates.PREPARING}:${OrderEvents.MARK_READY}`]: OrderStates.READY,
  [`${OrderStates.READY}:${OrderEvents.PICKUP}`]: OrderStates.PICKED_UP,
  [`${OrderStates.PICKED_UP}:${OrderEvents.START_ROUTE}`]: OrderStates.EN_ROUTE,
  [`${OrderStates.EN_ROUTE}:${OrderEvents.COMPLETE_DELIVERY}`]: OrderStates.DELIVERED,

  [`${OrderStates.CREATED}:${OrderEvents.CANCEL}`]: OrderStates.CANCELLED,
  [`${OrderStates.PREPARING}:${OrderEvents.CANCEL}`]: OrderStates.CANCELLED,
  [`${OrderStates.READY}:${OrderEvents.CANCEL}`]: OrderStates.CANCELLED,
} as const;


