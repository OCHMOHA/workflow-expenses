type CacheEntry<T> = {
  ts: number;
  value: T;
};

const PREFIX = 'asa_cache_v1:';

const safeGetStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

export const cacheGet = <T>(key: string, maxAgeMs: number): T | null => {
  const storage = safeGetStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > maxAgeMs) return null;
    return parsed.value as T;
  } catch {
    return null;
  }
};

export const cacheSet = <T>(key: string, value: T): void => {
  const storage = safeGetStorage();
  if (!storage) return;

  try {
    const entry: CacheEntry<T> = { ts: Date.now(), value };
    storage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // ignore (quota / serialization)
  }
};

export const cacheRemove = (key: string): void => {
  const storage = safeGetStorage();
  if (!storage) return;
  try {
    storage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
};
