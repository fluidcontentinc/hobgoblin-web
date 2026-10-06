// Contract-first status enums, aligned to docs/PORTALS_SPEC.md

// Mirrors marketplace-engine config('marketplace.order_states').
export const MerchantOrderStatuses = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
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


