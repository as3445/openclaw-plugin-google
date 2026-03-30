import { syncEvents } from "./api.js";
import type { GoogleCalendarAccountConfig, RawCalendarEvent, SyncState } from "./types.js";

/**
 * Perform a full initial sync. Returns all future events and a SyncState
 * that can be used for subsequent incremental syncs.
 *
 * @param account - Authenticated account config.
 * @param calendarId - Target calendar (typically "primary").
 * @param _lookaheadDays - Reserved for future use (sync API handles scoping).
 */
export async function performInitialSync(
  account: GoogleCalendarAccountConfig,
  calendarId: string,
  _lookaheadDays: number,
): Promise<{ events: RawCalendarEvent[]; syncState: SyncState }> {
  const { events, nextSyncToken } = await syncEvents(account, calendarId);
  const syncState: SyncState = {
    syncToken: nextSyncToken,
    calendarId,
    lastSyncAt: new Date().toISOString(),
  };
  return { events, syncState };
}

/**
 * Perform an incremental sync using a previously obtained sync token.
 *
 * If the token has expired (HTTP 410 Gone), this falls back to a full
 * re-sync transparently so callers always receive a valid result.
 */
export async function performIncrementalSync(
  account: GoogleCalendarAccountConfig,
  calendarId: string,
  syncToken: string,
): Promise<{ events: RawCalendarEvent[]; syncState: SyncState }> {
  try {
    const { events, nextSyncToken } = await syncEvents(account, calendarId, syncToken);
    const syncState: SyncState = {
      syncToken: nextSyncToken,
      calendarId,
      lastSyncAt: new Date().toISOString(),
    };
    return { events, syncState };
  } catch (err) {
    const isGone =
      err instanceof Error && (err.message.includes("410") || err.message.includes("Gone"));
    if (isGone) {
      return performInitialSync(account, calendarId, 30);
    }
    throw err;
  }
}
