import { composeRfc2822Message } from "./actions.js";
import { getGmailAccessToken } from "./auth.js";
import type {
  GmailAttachmentResponse,
  GmailHistoryListResponse,
  GmailLabelsListResponse,
  GmailMessagesListResponse,
  GmailProfileResponse,
  GmailThreadResponse,
  GmailWatchResponse,
  GoogleMailAccountConfig,
  RawGmailMessage,
  SendEmailParams,
} from "./types.js";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Maximum pages to iterate through in a single paginated request. */
const MAX_PAGINATION_PAGES = 100;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Truncate and redact error response bodies to prevent token/URL leakage in logs. */
function sanitizeErrorBody(text: string, maxLen = 200): string {
  const redacted = text.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
  return redacted.length > maxLen ? `${redacted.slice(0, maxLen)}...` : redacted;
}

/**
 * Validate that a Gmail resource ID contains only safe characters.
 * Gmail IDs are alphanumeric with possible hyphens/underscores.
 * This prevents path traversal via crafted IDs like "../../admin".
 */
function assertSafeId(id: string, label: string): void {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid ${label}: must be alphanumeric (got "${id}")`);
  }
}

async function gmailFetch<T>(
  account: GoogleMailAccountConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getGmailAccessToken(account);
  const url = `${GMAIL_API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gmail API ${response.status}: ${sanitizeErrorBody(text || response.statusText)}`);
  }
  return (await response.json()) as T;
}

async function gmailFetchOk(
  account: GoogleMailAccountConfig,
  path: string,
  init?: RequestInit,
): Promise<void> {
  const token = await getGmailAccessToken(account);
  const url = `${GMAIL_API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gmail API ${response.status}: ${sanitizeErrorBody(text || response.statusText)}`);
  }
}

// ---------------------------------------------------------------------------
// Public API wrappers
// ---------------------------------------------------------------------------

/** List message stubs matching a Gmail query. */
export async function listMessages(
  account: GoogleMailAccountConfig,
  query: string,
  maxResults = 10,
): Promise<GmailMessagesListResponse> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  return await gmailFetch<GmailMessagesListResponse>(account, `/messages?${params.toString()}`);
}

/** Fetch a full message by ID. */
export async function getMessage(
  account: GoogleMailAccountConfig,
  messageId: string,
  format: "full" | "metadata" | "minimal" | "raw" = "full",
): Promise<RawGmailMessage> {
  assertSafeId(messageId, "messageId");
  const params = new URLSearchParams({ format });
  return await gmailFetch<RawGmailMessage>(account, `/messages/${messageId}?${params.toString()}`);
}

/**
 * Send a new email. Returns the sent message stub.
 * Encodes the message as RFC 2822 and base64url-encodes for the Gmail API.
 */
export async function sendMessage(
  account: GoogleMailAccountConfig,
  emailParams: SendEmailParams,
): Promise<RawGmailMessage> {
  const raw = composeRfc2822Message(emailParams, account.signature);
  const encoded = Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const body: Record<string, string> = { raw: encoded };
  if (emailParams.threadId) {
    body.threadId = emailParams.threadId;
  }
  return await gmailFetch<RawGmailMessage>(account, "/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Reply to an existing message within the same thread. */
export async function replyToMessage(
  account: GoogleMailAccountConfig,
  originalMessageId: string,
  replyBody: string,
  htmlBody?: string,
): Promise<RawGmailMessage> {
  const original = await getMessage(account, originalMessageId, "metadata");
  const headers = original.payload?.headers ?? [];
  const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
  const from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
  const messageIdHeader = headers.find((h) => h.name.toLowerCase() === "message-id")?.value ?? "";

  return await sendMessage(account, {
    to: [from],
    subject: subject.startsWith("Re: ") ? subject : `Re: ${subject}`,
    body: replyBody,
    htmlBody,
    replyToMessageId: messageIdHeader,
    threadId: original.threadId,
  });
}

/** Create a draft email. Returns the draft resource. */
export async function createDraft(
  account: GoogleMailAccountConfig,
  emailParams: SendEmailParams,
): Promise<{ id: string; message: RawGmailMessage }> {
  const raw = composeRfc2822Message(emailParams, account.signature);
  const encoded = Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const messageBody: Record<string, string> = { raw: encoded };
  if (emailParams.threadId) {
    messageBody.threadId = emailParams.threadId;
  }
  return await gmailFetch<{ id: string; message: RawGmailMessage }>(account, "/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: messageBody }),
  });
}

/** Get a full thread by thread ID. */
export async function getThread(
  account: GoogleMailAccountConfig,
  threadId: string,
): Promise<GmailThreadResponse> {
  assertSafeId(threadId, "threadId");
  return await gmailFetch<GmailThreadResponse>(account, `/threads/${threadId}?format=full`);
}

/** List all labels on the account. */
export async function getLabels(
  account: GoogleMailAccountConfig,
): Promise<GmailLabelsListResponse> {
  return await gmailFetch<GmailLabelsListResponse>(account, "/labels");
}

/** Add or remove labels from a message. */
export async function modifyLabels(
  account: GoogleMailAccountConfig,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<RawGmailMessage> {
  assertSafeId(messageId, "messageId");
  return await gmailFetch<RawGmailMessage>(account, `/messages/${messageId}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

/** Set up a Pub/Sub watch on the mailbox. */
export async function watchInbox(
  account: GoogleMailAccountConfig,
  topicName: string,
  labelIds: string[] = ["INBOX"],
): Promise<GmailWatchResponse> {
  return await gmailFetch<GmailWatchResponse>(account, "/watch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topicName, labelIds, labelFilterBehavior: "INCLUDE" }),
  });
}

/** Stop a previously registered Pub/Sub watch. */
export async function stopWatch(account: GoogleMailAccountConfig): Promise<void> {
  await gmailFetchOk(account, "/stop", { method: "POST" });
}

/**
 * Fetch incremental history records since startHistoryId.
 * Automatically paginates through all pages to collect complete results.
 */
export async function listHistory(
  account: GoogleMailAccountConfig,
  startHistoryId: string,
  historyTypes: string[] = ["messageAdded"],
): Promise<GmailHistoryListResponse> {
  const allHistory: GmailHistoryListResponse["history"] = [];
  let pageToken: string | undefined;
  let latestHistoryId: string | undefined;
  let pageCount = 0;

  do {
    if (++pageCount > MAX_PAGINATION_PAGES) {
      throw new Error(`listHistory exceeded ${MAX_PAGINATION_PAGES} pages -- possible infinite loop`);
    }
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: historyTypes.join(","),
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    const page = await gmailFetch<GmailHistoryListResponse>(account, `/history?${params.toString()}`);
    if (page.history) {
      allHistory.push(...page.history);
    }
    latestHistoryId = page.historyId ?? latestHistoryId;
    pageToken = page.nextPageToken;
  } while (pageToken);

  return { history: allHistory.length > 0 ? allHistory : undefined, historyId: latestHistoryId };
}

/** Get the authenticated user's profile (email and current historyId). */
export async function getProfile(account: GoogleMailAccountConfig): Promise<GmailProfileResponse> {
  return await gmailFetch<GmailProfileResponse>(account, "/profile");
}

/** Download a single attachment by message ID and attachment ID. */
export async function getAttachment(
  account: GoogleMailAccountConfig,
  messageId: string,
  attachmentId: string,
): Promise<GmailAttachmentResponse> {
  assertSafeId(messageId, "messageId");
  assertSafeId(attachmentId, "attachmentId");
  return await gmailFetch<GmailAttachmentResponse>(
    account,
    `/messages/${messageId}/attachments/${attachmentId}`,
  );
}

/** Probe the Gmail API with a lightweight profile request to verify credentials. */
export async function probeGmail(
  account: GoogleMailAccountConfig,
): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const profile = await getProfile(account);
    return { ok: true, email: profile.emailAddress };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
