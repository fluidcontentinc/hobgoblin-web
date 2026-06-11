// UI-facing store hooks/actions.
// Screens should import from here instead of reading/mutating appState directly.

import { appState, notifyAppState, setCurrentUser, setRestaurants, setOrders, updateOrder, useAppStateVersion } from '../../state';
import type { User, Restaurant, Order, Mission, CartItem, Event, AppState } from '../../state';

export function useCurrentUser(): User | null {
  useAppStateVersion();
  return appState.currentUser;
}

export function useRestaurants(): Restaurant[] {
  useAppStateVersion();
  return appState.restaurants;
}

export function useOrders(): Order[] {
  useAppStateVersion();
  return appState.orders;
}

export function useCart(): CartItem[] {
  useAppStateVersion();
  return appState.cart;
}

export function useMissions(): Mission[] {
  useAppStateVersion();
  return appState.missions;
}

export function useEvents(): Event[] {
  useAppStateVersion();
  return appState.events;
}

export function useStats(): AppState['stats'] {
  useAppStateVersion();
  return appState.stats;
}

export function getCurrentUserEmailFallback(fallbackEmail: string): string {
  return appState.currentUser?.email ?? fallbackEmail;
}

export function allocateNextRestaurantId(): number {
  const id = appState.nextRestaurantId;
  appState.nextRestaurantId += 1;
  return id;
}

export function withAppStateSnapshot<T>(selector: (s: AppState) => T): T {
  // Read-only escape hatch for non-screen modules; screens should prefer the hooks above.
  return selector(appState);
}

export const StoreActions = {
  notifyAppState,
  setCurrentUser,
  setRestaurants,
  setOrders,
  updateOrder,
  setCart(next: CartItem[]) {
    appState.cart = next;
    notifyAppState();
  },
  mutateCart(updater: (prev: CartItem[]) => CartItem[]) {
    appState.cart = updater(appState.cart);
    notifyAppState();
  },
  appendOrders(newOrders: Order[]) {
    appState.orders = [...appState.orders, ...newOrders];
    notifyAppState();
  },
  clearCart() {
    appState.cart = [];
    notifyAppState();
  },
  mutateStats(updater: (prev: AppState['stats']) => AppState['stats']) {
    appState.stats = updater(appState.stats);
    notifyAppState();
  },
};


