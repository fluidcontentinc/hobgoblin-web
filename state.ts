import { useSyncExternalStore } from 'react';
import type { Adventure, AdventureMapNode } from './src/repositories/AdventureRepository';

export interface MissionStep {
  id: number;
  sequence: number;
  type: 'restaurant' | 'landmark' | 'clue';
  title: string;
  description?: string | null;
  requirement_type: 'photo' | 'qr' | 'gps' | 'codeword';
  points: number;
}

/**
 * The kid's own relationship to a mission (Adventure). Drives the badge and
 * the primary CTA. Distinct from the admin lifecycle `status`, which is never
 * shown on the kid side.
 */
export type KidStatus = 'not_started' | 'active' | 'paused' | 'completed';

/**
 * The kid's enrollment record for a mission. Null when kidStatus is
 * 'not_started'. Mirrors the backend `enrollment` object.
 */
export interface MissionEnrollment {
  id: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  startedAt?: string | null;
  pausedAt?: string | null;
  completedAt?: string | null;
}

export interface Mission {
  id: number;
  title: string;
  location: string;
  /** Admin lifecycle status — NEVER render this on the kid side. */
  status: string;
  /** Kid's own status — use this for the badge and CTA. */
  kidStatus: KidStatus;
  /** Total points across all steps (the old "70 points"). Alias of pointsTotal. */
  points: number;
  pointsTotal: number;
  /** Points the kid has earned so far (accrues as steps are approved). */
  pointsEarned: number;
  stepsTotal: number;
  stepsCompleted: number;
  /** 0–100 completion percentage. */
  progressPct: number;
  /** Hex colour for this mission's step nodes on the Path of Power map. */
  color?: string | null;
  /** Kid's enrollment record, null when not started. */
  enrollment?: MissionEnrollment | null;
  restaurantId?: number; // Optional: links mission to a restaurant (for main missions)
  description?: string;
  steps?: MissionStep[];
}

/**
 * StepCompletion represents a proof submission that's pending parent approval
 */
export interface StepCompletion {
  id: number;
  stepId: number;
  adventureId: number;
  kidId: number;
  kidEmail: string;
  kidName?: string;
  assetId: number;
  assetUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string | null;
}

/**
 * Transmission represents a communication or broadcast from the server
 * Used for real-time updates, notifications, or state synchronization
 */
export interface Transmission {
  id: string;
  type: string;
  title?: string;
  payload: Record<string, any>;
  timestamp: string;
  acknowledged?: boolean;
}

export interface MenuItem {
  id: number;
  name: string;
  price: number;
  image: string;
  description?: string;
  ingredients?: string[];
}

export interface Restaurant {
  id: number;
  ownerEmail?: string;
  name: string;
  cuisine: string;
  featured?: boolean;
  menu: MenuItem[];
  notificationEmail?: string;
  notificationPhone?: string;
  pathStop?: number | null;   // position on the Path of Power (1–12)
  description?: string | null;
  logo?: string | null;
  status?: string;
}

export interface CartItem extends MenuItem {
  restaurant: string;
  restaurantId: number;
  quantity: number;
}

export interface Order {
  id: number;
  restaurantId: number;
  restaurantName: string;
  items: string[];
  total: number;
  date: string;
  state?: string;
  status?: string;
  t_created?: string;
  type?: string;
  buyerEmail?: string | null;
  driverEmail?: string;
}

export interface Event {
  id: number;
  type: string;
  roles: string[];
  message: string;
  linkedId?: number | null;
  createdAt: string;
  restaurantId?: number;
  driverEmail?: string;
}

export interface User {
  email: string;
  role: 'parent' | 'restaurant' | 'kid' | 'driver' | 'admin';
  restaurantId?: number;
}

export interface AppState {
  currentUser: User | null;
  selectedRole: 'parent' | 'restaurant' | 'kid' | 'driver' | 'admin' | null;
  nextRestaurantId: number;
  missions: Mission[];
  restaurants: Restaurant[];
  cart: CartItem[];
  orders: Order[];
  events: Event[];
  nextEventId: number;
  stats: {
    kids: Record<string, number>;
    drivers: Record<string, number>;
    restaurants: Record<number, number>;
  };
  // Adventure state - all data comes from server, no unlock logic stored client-side
  activeAdventure: Adventure | null;
  mapNodes: AdventureMapNode[];
  pendingCompletions: StepCompletion[];
  transmission: Transmission | null;
}

export const appState: AppState = {
  currentUser: null,
  selectedRole: null,
  nextRestaurantId: 16,
  
  missions: [], // Missions come from backend API only - no hardcoded data
  
  // Adventure state - initialized as empty/null, populated from server
  activeAdventure: null,
  mapNodes: [],
  pendingCompletions: [],
  transmission: null,
  
  restaurants: [
    { 
      id: 1,
      ownerEmail: 'oak@test.com',
      name: "Oak Park Cafe", 
      cuisine: "Seasonal American",
      featured: true,
      menu: [
        { id: 101, name: "Autumn Harvest Bowl", price: 16.50, image: "autumn-harvest-bowl", description: "Seasonal vegetables with roasted turkey", ingredients: ["turkey", "squash", "kale", "cranberries"] },
        { id: 102, name: "Seasonal Berry Tart", price: 9.50, image: "seasonal-berry-tart", description: "Fresh berries in a buttery crust", ingredients: ["berries", "pastry", "cream"] }
      ]
    },
    { 
      id: 2,
      ownerEmail: 'gobbler@test.com',
      name: "Gobbler's Feast", 
      cuisine: "Traditional",
      menu: [
        { id: 201, name: "Gobbler Burger", price: 14.00, image: "gobbler-burger", description: "Classic turkey burger with all the fixings", ingredients: ["turkey", "bun", "lettuce", "tomato", "mayo"] },
        { id: 202, name: "Strawberry Salad", price: 12.50, image: "strawberry-salad", description: "Fresh greens with seasonal strawberries", ingredients: ["lettuce", "strawberries", "nuts", "dressing"] }
      ]
    },
    { 
      id: 3,
      ownerEmail: 'moonlight@test.com',
      name: "Moonlight Cafe", 
      cuisine: "Contemporary",
      featured: true,
      menu: [
        { id: 301, name: "Artisan Toast", price: 11.00, image: "artisan-toast", description: "House-made bread with seasonal toppings", ingredients: ["bread", "butter", "honey", "herbs"] }
      ]
    },
    { 
      id: 4,
      ownerEmail: 'marshmallow@test.com',
      name: "Marshmallow Haven", 
      cuisine: "Desserts",
      menu: [
        { id: 401, name: "S'more Melted Marshmallow", price: 8.50, image: "smore_melted_marshmallow", description: "Toasted marshmallow perfection", ingredients: ["marshmallow", "chocolate", "graham"] },
        { id: 402, name: "Decadent S'more", price: 10.00, image: "decadent_Smore", description: "Premium s'more with artisanal chocolate", ingredients: ["marshmallow", "dark chocolate", "graham"] },
        { id: 403, name: "S'mores Homemade Cookies", price: 7.50, image: "smores_homemade_cookies_", description: "Cookie version of the classic s'more", ingredients: ["cookie", "marshmallow", "chocolate"] }
      ]
    },
    { 
      id: 5,
      ownerEmail: 'peanut@test.com',
      name: "Peanut Butter Paradise", 
      cuisine: "Comfort Food",
      menu: [
        { id: 501, name: "Peanut Butter Marshmallow Bars", price: 9.00, image: "Peanut_Butter_Marshmallow_Bars_", description: "Creamy peanut butter with fluffy marshmallow", ingredients: ["peanut butter", "marshmallow", "graham"] }
      ]
    },
    { 
      id: 6,
      ownerEmail: 'goulash@test.com',
      name: "Goulash & Oreos", 
      cuisine: "Fusion",
      menu: [
        { id: 601, name: "Goulash Oreos", price: 12.00, image: "Goulash_Oreos", description: "Unique fusion of savory and sweet", ingredients: ["goulash", "oreos", "cream"] }
      ]
    },
    { 
      id: 7,
      ownerEmail: 'strawberry@test.com',
      name: "Strawberry Shortcake Co.", 
      cuisine: "Desserts",
      menu: [
        { id: 701, name: "Cake Jar Layers - Strawberry Shortcake", price: 11.50, image: "cake_jar_layers_detailed_strawberry_shortcake", description: "Layered strawberry shortcake in a jar", ingredients: ["strawberries", "cake", "cream", "sugar"] }
      ]
    },
    { 
      id: 8,
      ownerEmail: 'icebox@test.com',
      name: "Icebox Bakery", 
      cuisine: "Bakery",
      menu: [
        { id: 801, name: "Chocolate Wafer Icebox Cake", price: 10.50, image: "Chocolate_Wafer_Icebox_Cake_Homemade", description: "Classic no-bake icebox cake", ingredients: ["chocolate", "wafers", "cream"] }
      ]
    },
    { 
      id: 9,
      ownerEmail: 'french@test.com',
      name: "French Toast House", 
      cuisine: "Breakfast",
      menu: [
        { id: 901, name: "Nutella Stuffed French Toast Sticks", price: 13.00, image: "Nutella_Stuffed_French_Toast_Sticks", description: "French toast stuffed with Nutella", ingredients: ["bread", "nutella", "eggs", "butter"] }
      ]
    },
    { 
      id: 10,
      ownerEmail: 'thai@test.com',
      name: "Thai Roti Delight", 
      cuisine: "Thai",
      menu: [
        { id: 1001, name: "Crispy Thai Banana Roti with Oreos", price: 9.50, image: "crispy_Thai_banana_roti_topped_with_crushed_Oreos", description: "Thai roti with banana and crushed Oreos", ingredients: ["roti", "banana", "oreos", "condensed milk"] }
      ]
    },
    { 
      id: 11,
      ownerEmail: 'bonbon@test.com',
      name: "Bon Bon Boutique", 
      cuisine: "Confectionery",
      menu: [
        { id: 1101, name: "Chocolate Bon Bons", price: 8.00, image: "chocolate_bon_bons", description: "Handcrafted chocolate bon bons", ingredients: ["chocolate", "cream", "vanilla"] },
        { id: 1102, name: "Chocolate Bonbon", price: 7.50, image: "chocolate_bonbon_", description: "Classic chocolate bonbon", ingredients: ["chocolate", "filling"] }
      ]
    },
    { 
      id: 12,
      ownerEmail: 'sour@test.com',
      name: "Sour Path Snacks", 
      cuisine: "Snacks",
      menu: [
        { id: 1201, name: "A Bowl of Sour Path Kids", price: 6.50, image: "a_bowl_of_sour_path_kids", description: "Assorted sour candies", ingredients: ["sour candy", "sugar", "citric acid"] }
      ]
    },
    { 
      id: 13,
      ownerEmail: 'chocolate@test.com',
      name: "Chocolate Bon Bon", 
      cuisine: "Desserts",
      menu: [
        { id: 1301, name: "Premium Chocolate Bonbons", price: 12.00, image: "chocolate_bon_bons", description: "Artisanal chocolate bonbons", ingredients: ["dark chocolate", "filling", "cocoa"] }
      ]
    },
    { 
      id: 14,
      ownerEmail: 'cookie@test.com',
      name: "Cookie Camp", 
      cuisine: "Bakery",
      menu: [
        { id: 1401, name: "S'mores Cookies", price: 8.00, image: "smores_homemade_cookies_", description: "Homemade s'mores cookies", ingredients: ["cookie", "marshmallow", "chocolate chips"] }
      ]
    },
    { 
      id: 15,
      ownerEmail: 'decadent@test.com',
      name: "Decadent S'mores", 
      cuisine: "Desserts",
      menu: [
        { id: 1501, name: "Ultimate S'more", price: 11.50, image: "decadent_Smore", description: "The most decadent s'more experience", ingredients: ["marshmallow", "premium chocolate", "artisan graham"] }
      ]
    },
  ],
  
  cart: [],
  
  orders: [
    {
      id: 101,
      restaurantId: 1,
      restaurantName: "Oak Park Cafe",
      items: ["Autumn Harvest Bowl", "Seasonal Berry Tart"],
      total: 26.00,
      date: "Dec 15, 2024",
      state: "delivered",
      status: "delivered",
      buyerEmail: "parent@test.com"
    },
    {
      id: 102,
      restaurantId: 2,
      restaurantName: "Gobbler's Feast",
      items: ["Gobbler Burger", "Strawberry Salad"],
      total: 26.50,
      date: "Dec 16, 2024",
      state: "delivered",
      status: "delivered",
      buyerEmail: "parent@test.com"
    },
    {
      id: 103,
      restaurantId: 4,
      restaurantName: "Marshmallow Haven",
      items: ["S'more Melted Marshmallow", "Decadent S'more"],
      total: 18.50,
      date: "Dec 17, 2024",
      state: "created",
      status: "created",
      buyerEmail: "parent@test.com"
    },
    {
      id: 104,
      restaurantId: 5,
      restaurantName: "Peanut Butter Paradise",
      items: ["Peanut Butter Marshmallow Bars"],
      total: 9.00,
      date: "Dec 17, 2024",
      state: "preparing",
      status: "preparing",
      buyerEmail: "parent@test.com"
    },
    {
      id: 105,
      restaurantId: 6,
      restaurantName: "Goulash & Oreos",
      items: ["Goulash Oreos"],
      total: 12.00,
      date: "Dec 17, 2024",
      state: "ready",
      status: "ready",
      buyerEmail: "parent@test.com"
    },
    {
      id: 106,
      restaurantId: 7,
      restaurantName: "Strawberry Shortcake Co.",
      items: ["Cake Jar Layers - Strawberry Shortcake"],
      total: 11.50,
      date: "Dec 18, 2024",
      state: "picked_up",
      status: "picked_up",
      buyerEmail: "parent@test.com",
      driverEmail: "driver@test.com"
    },
    {
      id: 107,
      restaurantId: 8,
      restaurantName: "Icebox Bakery",
      items: ["Chocolate Wafer Icebox Cake"],
      total: 10.50,
      date: "Dec 18, 2024",
      state: "en_route",
      status: "en_route",
      buyerEmail: "parent@test.com",
      driverEmail: "driver@test.com"
    },
    {
      id: 108,
      restaurantId: 9,
      restaurantName: "French Toast House",
      items: ["Nutella Stuffed French Toast Sticks"],
      total: 13.00,
      date: "Dec 19, 2024",
      state: "delivered",
      status: "delivered",
      buyerEmail: "parent@test.com",
      driverEmail: "driver@test.com"
    },
    {
      id: 109,
      restaurantId: 10,
      restaurantName: "Thai Roti Delight",
      items: ["Crispy Thai Banana Roti with Oreos"],
      total: 9.50,
      date: "Dec 19, 2024",
      state: "created",
      status: "created",
      buyerEmail: "parent@test.com"
    },
    {
      id: 110,
      restaurantId: 11,
      restaurantName: "Bon Bon Boutique",
      items: ["Chocolate Bon Bons", "Chocolate Bonbon"],
      total: 15.50,
      date: "Dec 20, 2024",
      state: "preparing",
      status: "preparing",
      buyerEmail: "parent@test.com"
    }
  ],
  
  events: [],
  nextEventId: 1,
  
  stats: {
    kids: {
      'kid@test.com': 450
    },
    drivers: {
      'driver@test.com': 125.50
    },
    restaurants: {
      1: 156.00,
      2: 89.50,
      4: 45.00
    },
  },
};

// --- Reactive helpers (small store) ---
// Existing components can keep mutating `appState` directly, but new Merchant/Driver
// portals use these helpers so UI updates reliably.

let _version = 0;
const _listeners = new Set<() => void>();

export function subscribeAppState(listener: () => void) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function notifyAppState() {
  _version += 1;
  _listeners.forEach((l) => l());
}

export function useAppStateVersion() {
  // We subscribe to a version counter; callers read the current `appState` directly.
  useSyncExternalStore(subscribeAppState, () => _version, () => _version);
  return _version;
}

export function setCurrentUser(user: User | null) {
  appState.currentUser = user;
  notifyAppState();
}

export function setSelectedRole(role: AppState['selectedRole']) {
  appState.selectedRole = role;
  notifyAppState();
}

export function setRestaurants(restaurants: Restaurant[]) {
  appState.restaurants = restaurants;
  notifyAppState();
}

export function setOrders(orders: Order[]) {
  appState.orders = orders;
  notifyAppState();
}

export function updateOrder(orderId: number, updater: (o: Order) => Order) {
  const idx = appState.orders.findIndex((o) => o.id === orderId);
  if (idx === -1) return;
  const next = updater(appState.orders[idx]);
  appState.orders = [...appState.orders.slice(0, idx), next, ...appState.orders.slice(idx + 1)];
  notifyAppState();
}

export function createEvent(
  type: string,
  roles: string[],
  message: string,
  linkedId: number | null = null,
  metadata: Record<string, any> = {}
): Event {
  const event: Event = {
    id: appState.nextEventId++,
    type,
    roles: Array.isArray(roles) ? roles : [roles],
    message,
    linkedId,
    createdAt: new Date().toISOString(),
    ...metadata
  };
  
  appState.events.push(event);
  notifyAppState();
  return event;
}

export function getEventsForUser(limit: number = 10): Event[] {
  if (!appState.currentUser) return [];
  
  const role = appState.currentUser.role;
  const restaurantId = appState.currentUser.restaurantId;
  
  let filtered = appState.events.filter(event => event.roles.includes(role));
  
  if (role === 'restaurant' && restaurantId) {
    filtered = filtered.filter(event => 
      !event.restaurantId || event.restaurantId === restaurantId
    );
  }
  
  return filtered
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

// Demo events for showcase
createEvent('order', ['parent', 'restaurant'], 'Order #101 has been delivered', 101, { restaurantId: 1 });
createEvent('order', ['parent', 'restaurant'], 'Order #102 has been delivered', 102, { restaurantId: 2 });
createEvent('order', ['parent', 'restaurant'], 'Order #108 has been delivered', 108, { restaurantId: 9 });
createEvent('mission', ['parent'], 'Mission "Find the Hidden Gobbler" completed! +100 points', 1);
createEvent('mission', ['parent'], 'Mission "The Haunted Kitchen" completed! +200 points', 3);
createEvent('order', ['parent', 'restaurant'], 'New order #103 received from Marshmallow Haven', 103, { restaurantId: 4 });
createEvent('order', ['parent', 'restaurant'], 'Order #104 is being prepared', 104, { restaurantId: 5 });
createEvent('order', ['driver'], 'New delivery offer: Order #105 from Goulash & Oreos - $8.20 payout', 105, { restaurantId: 6 });
createEvent('order', ['driver'], 'Delivery completed: Order #106 - $7.15 earned', 106, { restaurantId: 7 });

