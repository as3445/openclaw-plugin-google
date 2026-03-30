import type { GmailMessage, RawGmailMessage, RawGmailMessagePart } from "./types.js";

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === lower)?.value ?? "";
}

/** Parse a comma-separated list of email addresses. */
function parseAddressList(raw: string): string[] {
  if (!raw.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((addr) => addr.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Body extraction
// ---------------------------------------------------------------------------

/** Decode base64url-encoded body data from the Gmail API. */
function decodeBodyData(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/** Maximum MIME tree depth to prevent stack overflow on maliciously nested messages. */
const MAX_MIME_DEPTH = 20;

/**
 * Recursively extract text/plain and text/html body parts from a MIME message.
 * Returns the first match of each type found via depth-first traversal.
 * Enforces a maximum recursion depth to guard against malformed/adversarial MIME.
 */
export function extractBody(payload: RawGmailMessagePart): { text: string; html: string } {
  let text = "";
  let html = "";

  function walk(part: RawGmailMessagePart, depth: number): void {
    if (depth > MAX_MIME_DEPTH) {
      return;
    }
    const mime = (part.mimeType ?? "").toLowerCase();

    if (mime === "text/plain" && !text && part.body?.data) {
      text = decodeBodyData(part.body.data);
    }
    if (mime === "text/html" && !html && part.body?.data) {
      html = decodeBodyData(part.body.data);
    }

    if (part.parts) {
      for (const child of part.parts) {
        walk(child, depth + 1);
      }
    }
  }

  walk(payload, 0);
  return { text, html };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Parse raw Gmail API headers into structured from/to/cc/subject/date fields. */
export function parseGmailMessage(raw: RawGmailMessage): {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  date: string;
} {
  const headers = raw.payload?.headers ?? [];
  return {
    from: getHeader(headers, "From"),
    to: parseAddressList(getHeader(headers, "To")),
    cc: parseAddressList(getHeader(headers, "Cc")),
    bcc: parseAddressList(getHeader(headers, "Bcc")),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
  };
}

/** Normalize a raw Gmail API message into our canonical GmailMessage shape. */
export function normalizeGmailMessage(raw: RawGmailMessage): GmailMessage {
  const parsed = parseGmailMessage(raw);
  const { text, html } = raw.payload ? extractBody(raw.payload) : { text: "", html: "" };
  const labelIds = raw.labelIds ?? [];

  const attachments = collectAttachmentMetadata(raw.payload);

  return {
    id: raw.id ?? "",
    threadId: raw.threadId ?? "",
    from: parsed.from,
    to: parsed.to,
    cc: parsed.cc,
    bcc: parsed.bcc,
    subject: parsed.subject,
    date: parsed.date,
    body: text,
    htmlBody: html,
    snippet: raw.snippet ?? "",
    labels: labelIds,
    attachments,
    isUnread: labelIds.includes("UNREAD"),
  };
}

/** Walk the MIME tree and collect attachment metadata (without downloading data). */
function collectAttachmentMetadata(
  payload: RawGmailMessagePart | undefined,
): GmailMessage["attachments"] {
  if (!payload) {
    return [];
  }
  const results: GmailMessage["attachments"] = [];

  function walk(part: RawGmailMessagePart, depth: number): void {
    if (depth > MAX_MIME_DEPTH) {
      return;
    }
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      // Sanitize filename to prevent path traversal (strip directory components)
      const safeName = part.filename.replace(/[/\\]/g, "_");
      results.push({
        id: part.body.attachmentId,
        name: safeName,
        contentType: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? 0,
      });
    }
    if (part.parts) {
      for (const child of part.parts) {
        walk(child, depth + 1);
      }
    }
  }

  walk(payload, 0);
  return results;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Build a human-readable single-line summary of an email. */
export function formatEmailSummary(msg: GmailMessage): string {
  const date = msg.date ? ` (${msg.date})` : "";
  const attachCount = msg.attachments.length;
  const attachSuffix =
    attachCount > 0 ? ` [${attachCount} attachment${attachCount > 1 ? "s" : ""}]` : "";
  return `From: ${msg.from} | Subject: ${msg.subject}${date}${attachSuffix}`;
}
