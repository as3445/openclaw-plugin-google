import { getAttachment } from "./api.js";
import type { GmailAttachment, GmailMessage, GoogleMailAccountConfig } from "./types.js";

/**
 * Download a single attachment by message and attachment ID.
 * Returns the base64url-encoded data from the Gmail API.
 */
export async function fetchAttachment(
  account: GoogleMailAccountConfig,
  messageId: string,
  attachmentId: string,
): Promise<string> {
  const result = await getAttachment(account, messageId, attachmentId);
  return result.data ?? "";
}

/**
 * Process all attachments on a message.
 *
 * Inline attachments under `maxBytes` as base64 data.
 * Skip larger attachments with a human-readable reason.
 */
export async function processAttachments(
  account: GoogleMailAccountConfig,
  message: GmailMessage,
  maxBytes: number,
): Promise<GmailAttachment[]> {
  const results: GmailAttachment[] = [];

  for (const att of message.attachments) {
    if (att.size > maxBytes) {
      const sizeMb = Math.round(att.size / 1024 / 1024);
      results.push({
        ...att,
        skipped: true,
        skipReason: `too large (>${sizeMb}MB)`,
      });
      continue;
    }

    try {
      const data = await fetchAttachment(account, message.id, att.id);
      results.push({ ...att, data });
    } catch (err) {
      results.push({
        ...att,
        skipped: true,
        skipReason: err instanceof Error ? err.message : "download failed",
      });
    }
  }

  return results;
}
