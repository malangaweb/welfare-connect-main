/**
 * Persistent cache layer — backed by localStorage.
 *
 * Purpose: When a user opens the app or refreshes the page, data that was
 * previously fetched is shown immediately from this cache while a fresh
 * network request runs in the background. This eliminates the "loading
 * skeleton on every refresh" problem and makes the UI feel instant.
 *
 * Usage:
 *   persistentCache.set('members-list', data, 10 * 60 * 1000);  // 10 min TTL
 *   const cached = persistentCache.get<Member[]>('members-list');
 *   persistentCache.invalidate('members-list');
 *   persistentCache.invalidateByPrefix('members');
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number; // epoch ms
  version: number;   // bump to force-invalidate old schema entries
}

const CACHE_VERSION = 1;
const CACHE_PREFIX = 'mwg_cache_';

export const persistentCache = {
  /**
   * Store a value. TTL defaults to 10 minutes.
   */
  set<T>(key: string, data: T, ttlMs = 10 * 60 * 1000): void {
    try {
      const entry: CacheEntry<T> = {
        data,
        expiresAt: Date.now() + ttlMs,
        version: CACHE_VERSION,
      };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
      // localStorage can be full or unavailable — fail silently
    }
  },

  /**
   * Retrieve a value. Returns null if expired, missing, or wrong version.
   */
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;

      const entry: CacheEntry<T> = JSON.parse(raw);

      if (entry.version !== CACHE_VERSION) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }

      if (Date.now() > entry.expiresAt) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  },

  /**
   * Remove a specific cache entry.
   */
  invalidate(key: string): void {
    localStorage.removeItem(CACHE_PREFIX + key);
  },

  /**
   * Remove all entries whose key starts with the given prefix.
   * e.g. invalidateByPrefix('member') clears 'member-list', 'member-details-*', etc.
   */
  invalidateByPrefix(prefix: string): void {
    const fullPrefix = CACHE_PREFIX + prefix;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(fullPrefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  },

  /**
   * Wipe all app cache entries (logout / hard refresh).
   */
  clear(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  },

  /**
   * Returns true if a valid (non-expired) entry exists.
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  },
};
