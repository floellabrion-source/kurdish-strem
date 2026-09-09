/**
 * High-Performance Client-Side Dual-Layer Word Cache (In-Memory RAM + LocalStorage)
 * Stores AI translations locally to eliminate repeat API latency and credit usage.
 */

const CACHE_KEY_PREFIX = 'ks_word_cache_v1_';
const MAX_MEM_CACHE_SIZE = 500;

export interface CachedWord {
    word: string;
    translation: string;
    timestamp: number;
}

// In-Memory RAM Map for sub-millisecond instant access
const memCache = new Map<string, string>();

function cleanKey(word: string): string {
    if (!word) return '';
    return word.toLowerCase().trim().replace(/[^a-z0-9'\-]/g, '');
}

export const wordCache = {
    get(word: string): string | null {
        const clean = cleanKey(word);
        if (!clean) return null;

        // 1. Check ultra-fast In-Memory RAM Cache first (0ms)
        if (memCache.has(clean)) {
            return memCache.get(clean) || null;
        }

        // 2. Check LocalStorage fallback
        try {
            const item = localStorage.getItem(CACHE_KEY_PREFIX + clean);
            if (item) {
                const parsed: CachedWord = JSON.parse(item);
                if (parsed && parsed.translation) {
                    // Populate memory cache for future lookups
                    if (memCache.size >= MAX_MEM_CACHE_SIZE) {
                        const firstKey = memCache.keys().next().value;
                        if (firstKey) memCache.delete(firstKey);
                    }
                    memCache.set(clean, parsed.translation);
                    return parsed.translation;
                }
            }
        } catch (e) {
            // Ignore storage read errors
        }
        return null;
    },

    set(word: string, translation: string): void {
        const clean = cleanKey(word);
        if (!clean || !translation) return;

        const trimmedTranslation = translation.trim();
        if (!trimmedTranslation) return;

        // 1. Update In-Memory RAM Map
        if (memCache.size >= MAX_MEM_CACHE_SIZE) {
            const firstKey = memCache.keys().next().value;
            if (firstKey) memCache.delete(firstKey);
        }
        memCache.set(clean, trimmedTranslation);

        // 2. Persist to LocalStorage
        try {
            const record: CachedWord = {
                word: clean,
                translation: trimmedTranslation,
                timestamp: Date.now()
            };
            localStorage.setItem(CACHE_KEY_PREFIX + clean, JSON.stringify(record));
        } catch (e) {
            // If LocalStorage quota is full, purge oldest items
            this.clearOldest();
        }
    },

    clearOldest(): void {
        try {
            const keys: { key: string; time: number }[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(CACHE_KEY_PREFIX)) {
                    try {
                        const val = JSON.parse(localStorage.getItem(k) || '{}');
                        keys.push({ key: k, time: val.timestamp || 0 });
                    } catch {
                        keys.push({ key: k, time: 0 });
                    }
                }
            }
            // Sort by timestamp ascending (oldest first) and delete first 30
            keys.sort((a, b) => a.time - b.time);
            keys.slice(0, 30).forEach(item => localStorage.removeItem(item.key));
        } catch (e) {
            // Ignore
        }
    }
};
