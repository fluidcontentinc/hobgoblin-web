import { Repos } from './repos';
import { StoreActions } from './store';
import { getDriverOnline, setDriverOnline, getDeclinedOffers, addDeclinedOffer, clearDeclinedOffers, isDriverOnboarded, setDriverOnboarded, clearDriverPortal } from '../../utils/portal';
import { clearAuth } from '../../utils/auth';
import type { DriverDeliveryStatus } from '../contracts/status';

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

  async advanceDelivery(id: number, status: DriverDeliveryStatus) {
    await Repos.driver.advanceDelivery(id, { status });
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


