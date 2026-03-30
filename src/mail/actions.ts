import type { SendEmailParams } from "./types.js";

// ---------------------------------------------------------------------------
// RFC 2822 message composition
// ---------------------------------------------------------------------------

/** Escape a header value to prevent header injection. */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

/** Format an address list for a header field. */
function formatAddressList(addresses: string[]): string {
  return addresses.map((addr) => sanitizeHeaderValue(addr)).join(", ");
}

/**
 * Compose a valid RFC 2822 email message string.
 *
 * If `htmlBody` is provided, a multipart/alternative message is created
 * with both text/plain and text/html parts. Otherwise a plain text message.
 */
export function composeRfc2822Message(params: SendEmailParams, signature?: string): string {
  const lines: string[] = [];
  const boundary = `boundary-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // Headers
  lines.push(`To: ${formatAddressList(params.to)}`);
  if (params.cc && params.cc.length > 0) {
    lines.push(`Cc: ${formatAddressList(params.cc)}`);
  }
  if (params.bcc && params.bcc.length > 0) {
    lines.push(`Bcc: ${formatAddressList(params.bcc)}`);
  }
  lines.push(`Subject: ${sanitizeHeaderValue(params.subject)}`);

  if (params.replyToMessageId) {
    lines.push(`In-Reply-To: ${sanitizeHeaderValue(params.replyToMessageId)}`);
    lines.push(`References: ${sanitizeHeaderValue(params.replyToMessageId)}`);
  }

  const bodyText = signature ? `${params.body}\n\n--\n${signature}` : params.body;
  const bodyHtml = params.htmlBody
    ? signature
      ? `${params.htmlBody}<br><br>--<br>${signature}`
      : params.htmlBody
    : undefined;

  if (bodyHtml) {
    lines.push("MIME-Version: 1.0");
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: 7bit");
    lines.push("");
    lines.push(bodyText);
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/html; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: 7bit");
    lines.push("");
    lines.push(bodyHtml);
    lines.push(`--${boundary}--`);
  } else {
    lines.push("MIME-Version: 1.0");
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: 7bit");
    lines.push("");
    lines.push(bodyText);
  }

  return lines.join("\r\n");
}

// ---------------------------------------------------------------------------
// Tool descriptors for agent actions
// ---------------------------------------------------------------------------

/** Describes the gmail_send tool for the agent. */
export const GMAIL_SEND_TOOL = {
  name: "gmail_send",
  description: "Compose and send a new email via Gmail. Provide recipients, subject, and body.",
  parameters: {
    to: { type: "string", description: "Comma-separated recipient email addresses" },
    cc: { type: "string", description: "Comma-separated CC addresses (optional)" },
    bcc: { type: "string", description: "Comma-separated BCC addresses (optional)" },
    subject: { type: "string", description: "Email subject line" },
    body: { type: "string", description: "Plain text email body" },
    htmlBody: { type: "string", description: "HTML email body (optional)" },
  },
} as const;

/** Describes the gmail_reply tool for the agent. */
export const GMAIL_REPLY_TOOL = {
  name: "gmail_reply",
  description: "Reply to an existing email thread. Provide the original message ID and reply body.",
  parameters: {
    originalMessageId: { type: "string", description: "Gmail message ID to reply to" },
    body: { type: "string", description: "Plain text reply body" },
    htmlBody: { type: "string", description: "HTML reply body (optional)" },
  },
} as const;

/** Describes the gmail_draft tool for the agent. */
export const GMAIL_DRAFT_TOOL = {
  name: "gmail_draft",
  description: "Create a draft email without sending it.",
  parameters: {
    to: { type: "string", description: "Comma-separated recipient email addresses" },
    subject: { type: "string", description: "Email subject line" },
    body: { type: "string", description: "Plain text email body" },
  },
} as const;

/** Describes the gmail_search tool for the agent. */
export const GMAIL_SEARCH_TOOL = {
  name: "gmail_search",
  description:
    "Search Gmail using the standard Gmail query syntax (e.g., 'from:alice@example.com subject:meeting').",
  parameters: {
    query: { type: "string", description: "Gmail search query" },
    maxResults: { type: "number", description: "Maximum number of results (default 10)" },
  },
} as const;

/** Describes the gmail_archive tool for the agent. */
export const GMAIL_ARCHIVE_TOOL = {
  name: "gmail_archive",
  description: "Archive a message by removing the INBOX label.",
  parameters: {
    messageId: { type: "string", description: "Gmail message ID to archive" },
  },
} as const;

/** Describes the gmail_mark_read tool for the agent. */
export const GMAIL_MARK_READ_TOOL = {
  name: "gmail_mark_read",
  description: "Mark a message as read by removing the UNREAD label.",
  parameters: {
    messageId: { type: "string", description: "Gmail message ID to mark as read" },
  },
} as const;

/** Describes the gmail_label tool for the agent. */
export const GMAIL_LABEL_TOOL = {
  name: "gmail_label",
  description: "Add or remove labels from a Gmail message.",
  parameters: {
    messageId: { type: "string", description: "Gmail message ID" },
    addLabels: {
      type: "string",
      description: "Comma-separated label IDs to add (optional)",
    },
    removeLabels: {
      type: "string",
      description: "Comma-separated label IDs to remove (optional)",
    },
  },
} as const;

/** All available Gmail tool descriptors. */
export const GMAIL_TOOLS = [
  GMAIL_SEND_TOOL,
  GMAIL_REPLY_TOOL,
  GMAIL_DRAFT_TOOL,
  GMAIL_SEARCH_TOOL,
  GMAIL_ARCHIVE_TOOL,
  GMAIL_MARK_READ_TOOL,
  GMAIL_LABEL_TOOL,
] as const;
