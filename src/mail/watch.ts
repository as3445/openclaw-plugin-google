import { watchInbox, stopWatch } from "./api.js";
import type { GmailWatchState, GoogleMailAccountConfig } from "./types.js";

/** Seven-day watch TTL from Gmail API (in milliseconds). */
const WATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Renew at 80% of the 7-day window to avoid expiry gaps. */
const RENEWAL_FACTOR = 0.8;

/**
 * Register a Pub/Sub watch on the user's mailbox.
 * Returns the watch state including historyId and expiration timestamp.
 */
export async function createGmailWatch(
  account: GoogleMailAccountConfig,
  topicName: string,
  labelIds: string[] = ["INBOX"],
): Promise<GmailWatchState> {
  const response = await watchInbox(account, topicName, labelIds);
  const expiration = response.expiration ? Number(response.expiration) : Date.now() + WATCH_TTL_MS;
  return {
    historyId: response.historyId ?? "0",
    expiration,
    topicName,
  };
}

/**
 * Renew an existing watch. Gmail watch registration is idempotent so
 * calling users.watch() again simply extends the subscription.
 */
export async function renewGmailWatch(
  account: GoogleMailAccountConfig,
  topicName: string,
  labelIds: string[] = ["INBOX"],
): Promise<GmailWatchState> {
  return await createGmailWatch(account, topicName, labelIds);
}

/** Stop a previously registered Pub/Sub watch for an account. */
export async function stopGmailWatch(account: GoogleMailAccountConfig): Promise<void> {
  await stopWatch(account);
}

/**
 * Compute the delay (in ms) until the next watch renewal.
 * Schedules renewal at 80% of the 7-day TTL to provide a safety margin.
 */
export function computeWatchRenewalDelay(state: GmailWatchState): number {
  const now = Date.now();
  const fullTtl = state.expiration - now;
  if (fullTtl <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor(fullTtl * RENEWAL_FACTOR));
}

/**
 * Schedule a watch renewal using the provided callback.
 * Returns an object with a `clear()` method to cancel the renewal chain.
 */
export function scheduleWatchRenewal(
  state: GmailWatchState,
  renewFn: () => Promise<GmailWatchState>,
): { clear: () => void } {
  let currentTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  function schedule(watchState: GmailWatchState): void {
    if (cancelled) return;
    const delay = computeWatchRenewalDelay(watchState);
    currentTimer = setTimeout(() => {
      if (cancelled) return;
      // Avoid async callback in setTimeout — use .then/.catch to prevent
      // unhandled promise rejections that crash the Node process.
      renewFn().then(
        (newState) => {
          if (!cancelled) schedule(newState);
        },
        () => {
          // On failure, retry after 5 minutes
          if (!cancelled) {
            currentTimer = setTimeout(() => schedule(watchState), 5 * 60 * 1000);
          }
        },
      );
    }, delay);
  }

  schedule(state);

  return {
    clear() {
      cancelled = true;
      if (currentTimer !== undefined) {
        clearTimeout(currentTimer);
      }
    },
  };
}
