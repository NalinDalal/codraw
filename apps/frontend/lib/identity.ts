/**
 * Stable client identity helpers for collaboration.
 *
 * Guests get a browser-persisted id so their cursor color and presence
 * survive reconnects, and a persisted display name shown to peers.
 */

const GUEST_ID_KEY = "codraw:guestId";
const DISPLAY_NAME_KEY = "codraw:displayName";

/** Get (or lazily create) the stable guest id for this browser. */
export function getOrCreateGuestId(): string {
    if (typeof localStorage === "undefined") {
        return `guest-${crypto.randomUUID()}`;
    }
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
        id = `guest-${crypto.randomUUID()}`;
        localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
}

/** Get the persisted display name (empty string when unset). */
export function getDisplayName(): string {
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(DISPLAY_NAME_KEY) ?? "";
}

/** Persist the display name (plain text, trimmed, capped at 32 chars). */
export function setDisplayName(name: string): string {
    const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32);
    if (typeof localStorage !== "undefined") {
        localStorage.setItem(DISPLAY_NAME_KEY, cleaned);
    }
    return cleaned;
}