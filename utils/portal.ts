import { safeGet, safeGetJson, safeRemove, safeSet, safeSetJson } from './storage';

// Merchant
const KEY_MERCHANT_ONBOARDED = 'merchant.onboarded';
const KEY_MERCHANT_RESTAURANT_ID = 'merchant.restaurantId';

export async function isMerchantOnboarded(): Promise<boolean> {
  return ((await safeGet(KEY_MERCHANT_ONBOARDED)) || '').toLowerCase() === 'true';
}

export async function setMerchantOnboarded(v: boolean): Promise<void> {
  await safeSet(KEY_MERCHANT_ONBOARDED, v ? 'true' : 'false');
}

export async function getMerchantRestaurantId(): Promise<number | null> {
  const n = Number(await safeGet(KEY_MERCHANT_RESTAURANT_ID));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setMerchantRestaurantId(id: number): Promise<void> {
  await safeSet(KEY_MERCHANT_RESTAURANT_ID, String(id));
}

export async function clearMerchantPortal(): Promise<void> {
  await safeRemove(KEY_MERCHANT_ONBOARDED);
  await safeRemove(KEY_MERCHANT_RESTAURANT_ID);
}

// Driver
const KEY_DRIVER_ONBOARDED = 'driver.onboarded';
const KEY_DRIVER_ONLINE = 'driver.online';
const KEY_DRIVER_DECLINED = 'driver.declinedOffers';

export async function isDriverOnboarded(): Promise<boolean> {
  return ((await safeGet(KEY_DRIVER_ONBOARDED)) || '').toLowerCase() === 'true';
}

export async function setDriverOnboarded(v: boolean): Promise<void> {
  await safeSet(KEY_DRIVER_ONBOARDED, v ? 'true' : 'false');
}

export async function getDriverOnline(): Promise<boolean> {
  return ((await safeGet(KEY_DRIVER_ONLINE)) || '').toLowerCase() === 'true';
}

export async function setDriverOnline(v: boolean): Promise<void> {
  await safeSet(KEY_DRIVER_ONLINE, v ? 'true' : 'false');
}

export async function getDeclinedOffers(): Promise<number[]> {
  return await safeGetJson<number[]>(KEY_DRIVER_DECLINED, []);
}

export async function addDeclinedOffer(orderId: number): Promise<void> {
  const list = await getDeclinedOffers();
  const next = Array.from(new Set([...(Array.isArray(list) ? list : []), orderId]));
  await safeSetJson(KEY_DRIVER_DECLINED, next);
}

export async function clearDeclinedOffers(): Promise<void> {
  await safeSetJson(KEY_DRIVER_DECLINED, []);
}

export async function clearDriverPortal(): Promise<void> {
  await safeRemove(KEY_DRIVER_ONBOARDED);
  await safeRemove(KEY_DRIVER_ONLINE);
  await safeRemove(KEY_DRIVER_DECLINED);
}


