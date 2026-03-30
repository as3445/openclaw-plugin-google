import { getMessage, getProfile, listHistory } from "./api.js";
import type { GmailHistoryState, GoogleMailAccountConfig, RawGmailMessage } from "./types.js";

/**
 * Perform an initial sync by fetching the current profile historyId.
 * No messages are fetched -- this establishes the baseline for future incremental syncs.
 */
export async function performInitialSync(
  account: GoogleMailAccountConfig,
): Promise<GmailHistoryState> {
  const profile = await getProfile(account);
  return {
    historyId: profile.historyId ?? "0",
    email: profile.emailAddress ?? "",
    lastSyncAt: new Date().toISOString(),
  };
}

/**
 * Perform an incremental sync from the given startHistoryId.
 *
 * Returns newly added messages and the updated historyId.
 * If the historyId is too old (404), falls back to re-establishing
 * the baseline from the current profile.
 */
export async function performIncrementalSync(
  account: GoogleMailAccountConfig,
  startHistoryId: string,
): Promise<{ messages: RawGmailMessage[]; state: GmailHistoryState }> {
  let historyResponse;
  try {
    historyResponse = await listHistory(account, startHistoryId, ["messageAdded"]);
  } catch (err) {
    const isHistoryNotFound =
      err instanceof Error && (err.message.includes("404") || err.message.includes("notFound"));
    if (isHistoryNotFound) {
      const freshState = await performInitialSync(account);
      return { messages: [], state: freshState };
    }
    throw err;
  }

  const seenIds = new Set<string>();
  const messageIds: string[] = [];
  for (const record of historyResponse.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      const msgId = added.message.id;
      if (!seenIds.has(msgId)) {
        seenIds.add(msgId);
        messageIds.push(msgId);
      }
    }
  }

  const messages: RawGmailMessage[] = [];
  for (const msgId of messageIds) {
    try {
      const full = await getMessage(account, msgId, "full");
      messages.push(full);
    } catch {
      // Message may have been deleted between history and fetch -- skip
    }
  }

  const newHistoryId = historyResponse.historyId ?? startHistoryId;
  return {
    messages,
    state: {
      historyId: newHistoryId,
      email: "",
      lastSyncAt: new Date().toISOString(),
    },
  };
}
