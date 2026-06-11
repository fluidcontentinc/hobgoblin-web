import { safeGet, safeSet, safeRemove } from './storage';

const TOKEN_KEY = 'auth_token';

/**
 * Get the stored authentication token
 * Works on iOS, Android, and Web (AsyncStorage falls back to localStorage on web)
 */
export async function getToken(): Promise<string | null> {
  return await safeGet(TOKEN_KEY);
}

/**
 * Set the authentication token
 * Works on iOS, Android, and Web (AsyncStorage falls back to localStorage on web)
 */
export async function setToken(token: string | null): Promise<void> {
  if (token) {
    await safeSet(TOKEN_KEY, token);
  } else {
    await clearToken();
  }
}

/**
 * Clear/remove the authentication token
 * Works on iOS, Android, and Web (AsyncStorage falls back to localStorage on web)
 */
export async function clearToken(): Promise<void> {
  await safeRemove(TOKEN_KEY);
}

