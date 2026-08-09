/**
 * Local "recently visited rooms" store (device-local).
 *
 * Complements the server-side "rooms you created" list with rooms you've
 * merely visited (e.g. shared links), so the home page can offer quick
 * resume. Not a source of truth — purely a UX nicety.
 */

export interface RecentRoom {
  slug: string;
  lastVisitedAt: number;
}

const STORAGE_KEY = "codraw:recent-rooms";
const MAX_RECENTS = 10;

function readAll(): RecentRoom[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RecentRoom =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as RecentRoom).slug === "string" &&
        typeof (r as RecentRoom).lastVisitedAt === "number",
    );
  } catch {
    return [];
  }
}

function writeAll(rooms: RecentRoom[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms.slice(0, MAX_RECENTS)));
  } catch {
    // Quota/private mode — recents are best-effort only.
  }
}

/** Mark a room as recently visited (dedupes, moves to front, caps at 10). */
export function recordRecentRoom(slug: string) {
  const rooms = readAll().filter((r) => r.slug !== slug);
  rooms.unshift({ slug, lastVisitedAt: Date.now() });
  writeAll(rooms);
}

/** Read recently visited rooms, newest first. */
export function getRecentRooms(): RecentRoom[] {
  return readAll();
}
