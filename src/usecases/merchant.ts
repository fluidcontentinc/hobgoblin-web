import { Repos } from './repos';
import { StoreActions, allocateNextRestaurantId } from './store';
import { getMerchantRestaurantId, setMerchantRestaurantId, isMerchantOnboarded, setMerchantOnboarded, clearMerchantPortal } from '../../utils/portal';
import { clearAuth } from '../../utils/auth';
import type { MerchantOrdersTab, MerchantOrderStatus } from '../contracts/status';
import type { MenuItemDto, MerchantHoursDto } from '../contracts/dto';

export const MerchantActions = {
  async getStore() {
    return await Repos.merchant.getStore();
  },

  async createStore(input: { name: string; cuisine?: string }) {
    return await Repos.merchant.createStore(input);
  },

  async setStoreStatus(status: 'open' | 'paused') {
    return await Repos.merchant.patchStore({ status });
  },

  async getHours(): Promise<MerchantHoursDto> {
    return await Repos.merchant.getHours();
  },

  async setHours(hours: MerchantHoursDto): Promise<MerchantHoursDto> {
    return await Repos.merchant.patchHours(hours);
  },

  async setStoreProfile(input: { name?: string; cuisine?: string | null; description?: string | null; notification_email?: string | null; notification_phone?: string | null }) {
    return await Repos.merchant.patchStore(input);
  },

  async uploadStoreLogo(file: any) {
    return await Repos.merchant.uploadLogo(file);
  },

  async getOrders(tab: MerchantOrdersTab) {
    return await Repos.merchant.getOrders({ tab });
  },

  async getOrder(id: number) {
    return await Repos.merchant.getOrder(id);
  },

  async acceptOrder(id: number, prepTimeMinutes: number) {
    return await Repos.merchant.patchOrder(id, { status: 'preparing', prepTimeMinutes });
  },

  async rejectOrder(id: number) {
    return await Repos.merchant.patchOrder(id, { reject: true });
  },

  async markOrderReady(id: number) {
    return await Repos.merchant.patchOrder(id, { status: 'ready' });
  },

  async confirmPickup(id: number) {
    return await Repos.merchant.patchOrder(id, { status: 'picked_up' });
  },

  async getMenu(): Promise<MenuItemDto[]> {
    return await Repos.merchant.getMenu();
  },

  /** Photo → vision endpoint → candidate rows for the import review screen. */
  async importMenuPhoto(file: any) {
    return await Repos.merchant.importMenuPhoto(file);
  },

  async addMenuItem(input: Omit<MenuItemDto, 'id'> & { image?: File | Blob | null }): Promise<MenuItemDto> {
    return await Repos.merchant.postMenuItem(input);
  },

  async updateMenuItem(
    id: number,
    input: Partial<Omit<MenuItemDto, 'id'>> & { image?: File | Blob | null },
  ): Promise<MenuItemDto> {
    return await Repos.merchant.patchMenuItem(id, input);
  },

  async setMenuItemAvailability(id: number, available: boolean): Promise<MenuItemDto> {
    return await Repos.merchant.patchMenuItemAvailability(id, { available });
  },

  async deleteMenuItem(id: number): Promise<void> {
    return await Repos.merchant.deleteMenuItem(id);
  },

  async completeOnboarding({ restaurantId, email }: { restaurantId: number; email: string }) {
    await setMerchantRestaurantId(restaurantId);
    await setMerchantOnboarded(true);
    StoreActions.setCurrentUser({ email, role: 'restaurant', restaurantId });
  },

  async signOut() {
    await clearAuth();
    await clearMerchantPortal();
    StoreActions.setCurrentUser(null);
  },

  // Helpers for onboarding
  //
  // Both of these are now derived from the engine — if /merchant/store
  // returns a real restaurant row, the user is "onboarded" by definition
  // (the engine created their Restaurant atomically at registration). This
  // means a fresh restaurant signup lands directly on the orders dashboard
  // and skips the redundant local onboarding screen.
  async getRestaurantId(): Promise<number | null> {
    try {
      const store = await Repos.merchant.getStore();
      if (store?.id) {
        await setMerchantRestaurantId(store.id);
        return store.id;
      }
      await setMerchantRestaurantId(null as any);
      return null;
    } catch (e: any) {
      // 404 = no restaurant on this server — clear stale local cache
      if (e?.statusCode === 404 || e?.status === 404) {
        await setMerchantRestaurantId(null as any);
        await setMerchantOnboarded(false);
        return null;
      }
      // Network error only — fall back to local cache
      return await getMerchantRestaurantId();
    }
  },

  async isOnboarded(): Promise<boolean> {
    try {
      const store = await Repos.merchant.getStore();
      if (store?.id && store?.name) {
        await setMerchantRestaurantId(store.id);
        await setMerchantOnboarded(true);
        return true;
      }
      await setMerchantOnboarded(false);
      return false;
    } catch (e: any) {
      // 404 = no restaurant on this server — clear stale local cache, show onboarding
      if (e?.statusCode === 404 || e?.status === 404) {
        await setMerchantRestaurantId(null as any);
        await setMerchantOnboarded(false);
        return false;
      }
      // Network error only — trust local cache
      return await isMerchantOnboarded();
    }
  },

  allocateNextRestaurantId,
};


