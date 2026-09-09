/**
 * Enterprise In-Memory LRU Cache with Automatic Garbage Collection
 */

class MemoryCache {
    constructor(ttlMs = 300000, maxCapacity = 1000) {
        this.cache = new Map();
        this.ttlMs = ttlMs;
        this.maxCapacity = maxCapacity;

        // Periodic cleanup every 2 minutes to prevent expired RAM leaks
        this.cleanupInterval = setInterval(() => this.purgeExpired(), 2 * 60 * 1000);
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref(); // Don't block node process exit
        }
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        // Move key to back for true LRU (recently accessed)
        this.cache.delete(key);
        this.cache.set(key, item);

        return item.value;
    }

    set(key, value, customTtlMs = null) {
        // Enforce max capacity (Evict oldest item if capacity reached)
        if (this.cache.size >= this.maxCapacity) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) this.cache.delete(oldestKey);
        }

        const expiresAt = Date.now() + (customTtlMs || this.ttlMs);
        this.cache.set(key, { value, expiresAt });
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    purgeExpired() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiresAt) {
                this.cache.delete(key);
            }
        }
    }
}

// Singleton instances for different data types
const moviesCache = new MemoryCache(5 * 60 * 1000, 500); // 5 minutes TTL, max 500 items
const wordCache = new MemoryCache(60 * 60 * 1000, 2000);  // 1 hour TTL, max 2000 items

module.exports = {
    moviesCache,
    wordCache,
    MemoryCache
};
