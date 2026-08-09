/**
 * LRU (Least Recently Used) cache for loaded image elements with IndexedDB persistence.
 *
 * Prevents repeated decoding of the same base64 data URLs and caps
 * memory usage by evicting the oldest entries when the cache is full.
 * Images are also persisted to IndexedDB so they survive page refreshes.
 *
 * @module imageCache
 */

/** Default maximum number of images to keep in the cache */
const DEFAULT_MAX = 50;

/** IndexedDB database name */
const DB_NAME = "codraw-image-cache";
/** IndexedDB store name */
const STORE_NAME = "images";
/** IndexedDB version */
const DB_VERSION = 1;

/**
 * Extract a stable cache key from a data URL.
 *
 * Strips the `data:...;base64,` prefix so that identical image content
 * with different data URL headers (e.g. `image/png` vs `image/jpeg`)
 * still hits the same cache entry.
 *
 * @param dataUrl - The full data URL string
 * @returns The base64 content portion as the cache key
 */
function cacheKey(dataUrl: string): string {
    const idx = dataUrl.indexOf(",");
    return idx !== -1 ? dataUrl.slice(idx + 1) : dataUrl;
}

/**
 * Open the IndexedDB database for image caching.
 *
 * @returns A promise that resolves to the database instance
 */
function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

/**
 * An LRU cache that stores `HTMLImageElement` instances keyed by
 * their base64 content (prefix stripped).
 *
 * Images are persisted to IndexedDB so they survive page refreshes.
 * On eviction from memory, the image's `src` is cleared to release
 * the decoded pixel data back to the browser.
 */
export class ImageCache {
    private cache = new Map<string, HTMLImageElement>();
    private maxSize: number;
    private db: IDBDatabase | null = null;
    private dbReady: Promise<void> | null = null;

    /**
     * @param maxSize - Maximum number of images to cache (default 50)
     */
    constructor(maxSize: number = DEFAULT_MAX) {
        this.maxSize = maxSize;
        this.dbReady = this.initDB();
    }

    /**
     * Initialize the IndexedDB database.
     *
     * @private
     */
    private async initDB(): Promise<void> {
        try {
            this.db = await openDatabase();
        } catch {
            // IndexedDB not available; image persistence is disabled
        }
    }

    /**
     * Ensure the database is ready before performing operations.
     *
     * @private
     */
    private async ensureReady(): Promise<void> {
        if (this.dbReady) await this.dbReady;
    }

    /**
     * Retrieve a cached image by its data URL key.
     *
     * Checks the in-memory cache first. If not found, returns `undefined`.
     * Use {@link getAsync} to also check IndexedDB.
     *
     * @param key - The image's data URL
     * @returns The cached `HTMLImageElement`, or `undefined` if not cached
     */
    get(dataUrl: string): HTMLImageElement | undefined {
        const key = cacheKey(dataUrl);
        const img = this.cache.get(key);
        if (img) {
            this.cache.delete(key);
            this.cache.set(key, img);
        }
        return img;
    }

    /**
     * Retrieve a cached image by its data URL key, falling back to IndexedDB.
     *
     * Checks the in-memory cache first. If not found, loads from IndexedDB
     * and caches it in memory for subsequent accesses.
     *
     * @param key - The image's data URL
     * @returns The cached `HTMLImageElement`, or `undefined` if not available
     */
    async getAsync(dataUrl: string): Promise<HTMLImageElement | undefined> {
        const cached = this.get(dataUrl);
        if (cached) return cached;

        await this.ensureReady();
        const key = cacheKey(dataUrl);
        if (!this.db) return undefined;

        try {
            const data = await this.getFromDB(key);
            if (data) {
                const img = new Image();
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = () => reject(new Error("Failed to load image from IndexedDB"));
                    img.src = data;
                });
                this.set(dataUrl, img);
                return img;
            }
        } catch {
            // Failed to load from IndexedDB
        }
        return undefined;
    }

    /**
     * Store an image in the cache and persist to IndexedDB.
     *
     * If the cache is full, the least recently used entry is evicted.
     * If the key already exists, the old entry is replaced.
     *
     * @param key - The image's data URL (used as cache key)
     * @param img - The loaded `HTMLImageElement` to cache
     */
    set(dataUrl: string, img: HTMLImageElement) {
        const key = cacheKey(dataUrl);
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) {
                const evicted = this.cache.get(oldest);
                if (evicted) evicted.src = "";
                this.cache.delete(oldest);
            }
        }
        this.cache.set(key, img);

        // Persist to IndexedDB asynchronously
        this.saveToDB(key, dataUrl);
    }

    /**
     * Check whether an image is currently cached in memory.
     *
     * @param key - The image's data URL
     * @returns `true` if the image is in the cache
     */
    has(dataUrl: string): boolean {
        return this.cache.has(cacheKey(dataUrl));
    }

    /** Current number of cached images in memory */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Save an image to IndexedDB.
     *
     * @private
     * @param key - The cache key (base64 content)
     * @param dataUrl - The full data URL
     */
    private async saveToDB(key: string, dataUrl: string): Promise<void> {
        await this.ensureReady();
        if (!this.db) return;
        try {
            const tx = this.db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            await new Promise<void>((resolve, reject) => {
                const request = store.put(dataUrl, key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch {
            // Silently fail; in-memory cache is still available
        }
    }

    /**
     * Get an image from IndexedDB.
     *
     * @private
     * @param key - The cache key (base64 content)
     * @returns The data URL, or `undefined` if not found
     */
    private async getFromDB(key: string): Promise<string | undefined> {
        if (!this.db) return undefined;
        try {
            const tx = this.db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            return await new Promise<string | undefined>((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch {
            return undefined;
        }
    }
}
