import type { MerchantHoursDto, MerchantOrderDto, MenuItemDto, StoreDto } from '../contracts/dto';
import type { MerchantOrdersTab, MerchantOrderStatus } from '../contracts/status';

export interface MerchantRepository {
  getStore(): Promise<StoreDto>;
  createStore(input: { name: string; cuisine?: string }): Promise<StoreDto>;
  patchStore(input: Partial<Pick<StoreDto, 'status' | 'name' | 'cuisine' | 'description' | 'notification_email' | 'notification_phone'>>): Promise<StoreDto>;
  uploadLogo(file: File | Blob | { uri: string; name: string; type: string }): Promise<{ logo_url: string }>;

  getHours(): Promise<MerchantHoursDto>;
  patchHours(hours: MerchantHoursDto): Promise<MerchantHoursDto>;

  getOrders(input: { tab: MerchantOrdersTab }): Promise<MerchantOrderDto[]>;
  getOrder(id: number): Promise<MerchantOrderDto | null>;
  patchOrder(id: number, input: { status?: MerchantOrderStatus; prepTimeMinutes?: number; reject?: boolean }): Promise<MerchantOrderDto>;

  getMenu(): Promise<MenuItemDto[]>;
  /** Optionally pass `image` as a File/Blob; the repo will switch to multipart. */
  postMenuItem(input: Omit<MenuItemDto, 'id'> & { image?: File | Blob | null }): Promise<MenuItemDto>;
  patchMenuItem(id: number, input: Partial<Omit<MenuItemDto, 'id'>> & { image?: File | Blob | null }): Promise<MenuItemDto>;
  patchMenuItemAvailability(id: number, input: { available: boolean }): Promise<MenuItemDto>;
  deleteMenuItem(id: number): Promise<void>;
}


