import type { MerchantOrdersTab } from './status';

export type MerchantRoute =
  | '/merchant/orders'
  | `/merchant/orders/${number}`
  | '/merchant/menu'
  | '/merchant/hours'
  | '/merchant/settings';

export type DriverRoute =
  | '/driver/home'
  | '/driver/earnings'
  | '/driver/settings';

export function merchantOrdersUrl(tab: MerchantOrdersTab): string {
  return `/merchant/orders?tab=${encodeURIComponent(tab)}`;
}


