import crypto from "node:crypto";
import { watchCalendar, stopWatch } from "./api.js";
import type { GoogleCalendarAccountConfig, WatchChannel } from "./types.js";

/**
 * Create a new push notification watch channel for a calendar.
 * Returns a `WatchChannel` that should be persisted for later renewal/stop.
 */
export async function createWatchChannel(
  account: GoogleCalendarAccountConfig,
  calendarId: string,
  webhookUrl: string,
): Promise<WatchChannel> {
  const channelToken = crypto.randomUUID();
  const response = await watchCalendar(account, calendarId, webhookUrl, channelToken);

  if (!response.id || !response.resourceId) {
    throw new Error("Google Calendar watch response missing channel or resource ID");
  }

  const expiration = response.expiration
    ? Number(response.expiration)
    : Date.now() + 7 * 24 * 60 * 60 * 1000;

  return {
    id: response.id,
    resourceId: response.resourceId,
    token: response.token ?? channelToken,
    expiration,
    calendarId,
  };
}

/**
 * Renew an existing watch channel by stopping the old one and creating a new one.
 * Returns the newly created `WatchChannel`.
 */
export async function renewWatchChannel(
  account: GoogleCalendarAccountConfig,
  channel: WatchChannel,
  webhookUrl: string,
): Promise<WatchChannel> {
  await stopWatchChannel(account, channel).catch(() => {
    // Silently ignore errors from stopping an already-expired channel
  });
  return createWatchChannel(account, channel.calendarId, webhookUrl);
}

/**
 * Stop an active watch channel.
 */
export async function stopWatchChannel(
  account: GoogleCalendarAccountConfig,
  channel: WatchChannel,
): Promise<void> {
  await stopWatch(account, channel.id, channel.resourceId);
}

/**
 * Schedule a watch channel renewal at 80% of its TTL.
 *
 * @param channel - The current watch channel.
 * @param renewFn - Callback invoked when renewal is due.
 * @returns A cleanup function that cancels the scheduled renewal.
 */
export function scheduleWatchRenewal(
  channel: WatchChannel,
  renewFn: () => Promise<void>,
): () => void {
  const ttlMs = channel.expiration - Date.now();
  if (ttlMs <= 0) {
    // Already expired -- renew immediately.
    // Wrap in try/catch to handle both sync throws and async rejections.
    try {
      renewFn().catch((err) => {
        console.error("[google-calendar] immediate watch renewal failed:", err);
      });
    } catch (err) {
      console.error("[google-calendar] immediate watch renewal threw synchronously:", err);
    }
    return () => {};
  }

  const renewAtMs = Math.floor(ttlMs * 0.8);
  const timer = setTimeout(() => {
    // Wrap in try/catch to handle both sync throws and async rejections.
    try {
      renewFn().catch((err) => {
        console.error("[google-calendar] scheduled watch renewal failed:", err);
      });
    } catch (err) {
      console.error("[google-calendar] scheduled watch renewal threw synchronously:", err);
    }
  }, renewAtMs);

  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }

  return () => clearTimeout(timer);
}
