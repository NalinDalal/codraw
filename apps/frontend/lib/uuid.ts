/**
 * UUID generation with a fallback for non-secure contexts.
 *
 * `crypto.randomUUID` is only available in secure contexts (HTTPS or
 * localhost). When the app is served over plain HTTP on a LAN IP, it's
 * undefined — this falls back to a random hex string so the app still works.
 */

export function uuid(): string {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
