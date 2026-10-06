import type { MerchantOrderStatus, DriverDeliveryStatus } from './status';
import type { Role } from './roles';

export type IsoDateTime = string;

export interface AuthMeDto {
  role: Role;
  email: string;
}

export interface MenuItemDto {
  id: number;
  name: string;
  price: number;
  image?: string | null;
  description?: string | null;
  ingredients?: string[] | null;
  available?: boolean | null;
}

export interface MerchantOrderDto {
  id: number;
  status: MerchantOrderStatus;
  restaurantId: number;
  restaurantName: string;
  items: Array<{ name: string; quantity?: number }>;
  total: number;
  createdAt: IsoDateTime;
  buyerEmail?: string | null;
  driverEmail?: string | null;
  driverName?: string | null;
}

export interface DriverPlaceDto {
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** An open delivery job. The customer's address is not shown until the driver accepts. */
export interface DriverOfferDto {
  id: number;
  status: DriverDeliveryStatus;
  orderId: number | null;
  restaurantName: string;
  pickup: DriverPlaceDto;
  payout: number;
  itemCount: number;
  createdAt: IsoDateTime;
}

export interface DriverActiveDeliveryDto {
  id: number;
  status: DriverDeliveryStatus;
  orderId: number | null;
  /** Engine order state: confirmed | preparing | ready | picked_up | delivered | cancelled */
  orderState: string;
  restaurantName: string;
  restaurantPhone: string | null;
  pickup: DriverPlaceDto;
  dropoff: DriverPlaceDto & { notes: string | null; customerName: string | null };
  items: Array<{ name: string; quantity: number }>;
  payout: number;
  total: number;
  createdAt: IsoDateTime;
}

export interface DriverEarningsDto {
  approved: boolean;
  todayTotal: number;
  weekTotal: number;
  deliveries: Array<{ id: number; orderId: number; payout: number; deliveredAt: IsoDateTime; restaurantName: string }>;
}

export interface StoreDto {
  id?: number;
  status: 'open' | 'paused' | 'closed';
  name: string;
  cuisine?: string | null;
  description?: string | null;
  /** Pickup address shown to delivery drivers. */
  address?: string | null;
  logo_url?: string | null;
  notification_email?: string | null;
  notification_phone?: string | null;
}

/**
 * The day-of-week key used by the engine's merchant_hours endpoints.
 * Matches MerchantHours::DAYS on the backend.
 */
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DayHoursDto {
  day: DayOfWeek;
  open_time: string | null;   // 'HH:MM' format
  close_time: string | null;  // 'HH:MM' format
  is_closed: boolean;
}

/**
 * Engine returns hours as an array of 7 DayHoursDto (one per day mon→sun).
 * Component state and API patches use the same shape — keeps mapping simple.
 */
export type MerchantHoursDto = DayHoursDto[];


