// Contract-first status enums, aligned to docs/PORTALS_SPEC.md

export const MerchantOrderStatuses = [
  'created',
  'accepted',
  'preparing',
  'ready',
  'picked_up',
  'completed',
  'cancelled',
] as const;
export type MerchantOrderStatus = (typeof MerchantOrderStatuses)[number];

export const DriverDeliveryStatuses = [
  'offer_sent',
  'accepted',
  'arrived_pickup',
  'picked_up',
  'arrived_dropoff',
  'delivered',
  'cancelled',
] as const;
export type DriverDeliveryStatus = (typeof DriverDeliveryStatuses)[number];

export const MerchantOrdersTabs = ['new', 'preparing', 'ready', 'history'] as const;
export type MerchantOrdersTab = (typeof MerchantOrdersTabs)[number];


