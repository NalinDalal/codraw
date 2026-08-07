/**
 * LRU (Least Recently Used) cache for loaded image elements.
 *
 * Prevents repeated decoding of the same base64 data URLs and caps
 * memory usage by evicting the oldest entries when the cache is full.
 *
 * @module imageCache
 */

/** Default maximum number of images to keep in the cache */
const DEFAULT_MAX = 50;

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
 * An LRU cache that stores `HTMLImageElement` instances keyed by
 * their base64 content (prefix stripped).
 *
 * On eviction, the image's `src` is cleared to release the decoded
 * pixel data back to the browser.
 */
export class ImageCache {
    private cache = new Map<string, HTMLImageElement>();
    private maxSize: number;

    /**
     * @param maxSize - Maximum number of images to cache (default 50)
     */
    constructor(maxSize: number = DEFAULT_MAX) {
        this.maxSize = maxSize;
    }

    /**
     * Retrieve a cached image by its data URL key.
     *
     * Moves the entry to the most-recently-used position on access.
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
     * Store an image in the cache.
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
    }

    /**
     * Check whether an image is currently cached.
     *
     * @param key - The image's data URL
     * @returns `true` if the image is in the cache
     */
    has(dataUrl: string): boolean {
        return this.cache.has(cacheKey(dataUrl));
    }

    /** Current number of cached images */
    get size() {
        return this.cache.size;
    }
}
