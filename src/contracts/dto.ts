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
}

export interface DriverOfferDto {
  id: number;
  status: DriverDeliveryStatus; // offer_sent/accepted/etc.
  restaurantName: string;
  payout: number;
  etaMinutes: number;
  dropoffDistanceMiles: number;
}

export interface DriverActiveDeliveryDto {
  id: number;
  status: DriverDeliveryStatus;
  restaurantId: number;
  restaurantName: string;
  items: Array<{ name: string; quantity?: number }>;
  total: number;
  createdAt: IsoDateTime;
  buyerEmail?: string | null;
  driverEmail?: string | null;
}

export interface StoreDto {
  id?: number;
  status: 'open' | 'paused' | 'closed';
  name: string;
  cuisine?: string | null;
  description?: string | null;
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


