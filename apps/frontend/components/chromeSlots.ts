/**
 * Named layout slots for floating chrome components.
 *
 * Use these instead of hardcoded `fixed top-X/bottom-X` positions
 * so all chrome stays coordinated and overlap-free.
 *
 * Adjust the values here to reposition all related components at once.
 */

/** Standard offset from the viewport edge in pixels. */
export const CHROME_OFFSET = 12;

/** Approximate height of the top bar cluster, used to dock panels below it. */
export const TOP_BAR_HEIGHT = 40;

export const ChromeSlots = {
    topLeft: "fixed top-3 left-3",
    topCenter: "fixed top-14 left-1/2 -translate-x-1/2",
    topRight: "fixed top-3 right-3",
    leftDock: "fixed top-24 left-3",
    bottomLeft: "fixed bottom-5 left-3",
    bottomCenter: "fixed bottom-5 left-1/2 -translate-x-1/2",
    bottomRight: "fixed bottom-5 right-3",
} as const;

export type ChromeSlot = keyof typeof ChromeSlots;
