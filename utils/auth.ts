import { safeGet, safeRemove, safeSet } from './storage';

export type AuthRole = 'parent' | 'restaurant' | 'driver' | 'kid' | 'admin';

const KEY_ROLE = 'role';
const KEY_EMAIL = 'auth.email';

export async function getAuthRole(): Promise<AuthRole | null> {
  const raw = (await safeGet(KEY_ROLE))?.toLowerCase() ?? '';
  if (raw === 'parent' || raw === 'restaurant' || raw === 'driver' || raw === 'kid' || raw === 'admin') return raw;
  return null;
}

export async function setAuthRole(role: AuthRole): Promise<void> {
  await safeSet(KEY_ROLE, role);
}

export async function getAuthEmail(): Promise<string | null> {
  const raw = (await safeGet(KEY_EMAIL)) ?? '';
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export async function setAuthEmail(email: string | null): Promise<void> {
  await safeSet(KEY_EMAIL, (email ?? '').trim());
}

export async function clearAuth(): Promise<void> {
  await safeRemove(KEY_ROLE);
  await safeRemove(KEY_EMAIL);
}


