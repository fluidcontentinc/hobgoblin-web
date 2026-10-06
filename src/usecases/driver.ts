import { Repos } from './repos';
import { StoreActions } from './store';
import { clearDeclinedOffers, isDriverOnboarded, setDriverOnboarded, clearDriverPortal } from '../../utils/portal';
import { clearAuth } from '../../utils/auth';

export const DriverActions = {
  async getState() {
    return await Repos.driver.getState();
  },

  async goOnline() {
    await Repos.driver.goOnline();
  },

  async goOffline() {
    await Repos.driver.goOffline();
  },

  async getOffers() {
    return await Repos.driver.getOffers();
  },

  async acceptOffer(id: number) {
    return await Repos.driver.acceptOffer(id);
  },

  async declineOffer(id: number) {
    await Repos.driver.declineOffer(id);
  },

  async getActiveDelivery() {
    return await Repos.driver.getActive();
  },

  async confirmPickup(id: number) {
    return await Repos.driver.confirmPickup(id);
  },

  async completeDelivery(id: number) {
    await Repos.driver.completeDelivery(id);
  },

  async releaseDelivery(id: number) {
    await Repos.driver.releaseDelivery(id);
  },

  async getEarnings() {
    return await Repos.driver.getEarnings();
  },

  async completeOnboarding({ email }: { email: string }) {
    await setDriverOnboarded(true);
    StoreActions.setCurrentUser({ email, role: 'driver' });
  },

  async signOut() {
    await clearAuth();
    await clearDriverPortal();
    StoreActions.setCurrentUser(null);
  },

  // Helpers
  async isOnboarded(): Promise<boolean> {
    return await isDriverOnboarded();
  },

  async clearDeclinedOffers() {
    await clearDeclinedOffers();
  },
};
