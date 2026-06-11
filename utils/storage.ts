import AsyncStorage from '@react-native-async-storage/async-storage';

export async function safeGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function safeSet(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export async function safeRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function safeGetJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await safeGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function safeSetJson(key: string, value: unknown): Promise<void> {
  await safeSet(key, JSON.stringify(value));
}


