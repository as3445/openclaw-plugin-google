import { describe, expect, it } from "vitest";
import {
  extractBody,
  parseGmailMessage,
  normalizeGmailMessage,
  formatEmailSummary,
} from "./messages.js";
import type { RawGmailMessage, RawGmailMessagePart } from "./types.js";

/** Encode a string as base64url (Gmail API format). */
function base64url(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("extractBody", () => {
  it("extracts text/plain body", () => {
    const payload: RawGmailMessagePart = {
      mimeType: "text/plain",
      body: { data: base64url("Hello world") },
    };
    const { text, html } = extractBody(payload);
    expect(text).toBe("Hello world");
    expect(html).toBe("");
  });

  it("extracts both text and html from multipart", () => {
    const payload: RawGmailMessagePart = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: base64url("Plain text") } },
        { mimeType: "text/html", body: { data: base64url("<p>HTML</p>") } },
      ],
    };
    const { text, html } = extractBody(payload);
    expect(text).toBe("Plain text");
    expect(html).toBe("<p>HTML</p>");
  });

  it("handles missing body data", () => {
    const payload: RawGmailMessagePart = { mimeType: "text/plain" };
    const { text, html } = extractBody(payload);
    expect(text).toBe("");
    expect(html).toBe("");
  });
});

describe("parseGmailMessage", () => {
  it("extracts headers", () => {
    const raw: RawGmailMessage = {
      payload: {
        headers: [
          { name: "From", value: "alice@example.com" },
          { name: "To", value: "bob@example.com, carol@example.com" },
          { name: "Subject", value: "Test" },
          { name: "Date", value: "Mon, 1 Jan 2026 00:00:00 +0000" },
        ],
      },
    };
    const parsed = parseGmailMessage(raw);
    expect(parsed.from).toBe("alice@example.com");
    expect(parsed.to).toEqual(["bob@example.com", "carol@example.com"]);
    expect(parsed.subject).toBe("Test");
  });

  it("returns empty values for missing headers", () => {
    const raw: RawGmailMessage = {};
    const parsed = parseGmailMessage(raw);
    expect(parsed.from).toBe("");
    expect(parsed.to).toEqual([]);
    expect(parsed.subject).toBe("");
  });
});

describe("normalizeGmailMessage", () => {
  it("normalizes a raw message", () => {
    const raw: RawGmailMessage = {
      id: "msg-1",
      threadId: "thread-1",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "Hello...",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "alice@example.com" },
          { name: "Subject", value: "Hi" },
        ],
        body: { data: base64url("Hello") },
      },
    };
    const msg = normalizeGmailMessage(raw);
    expect(msg.id).toBe("msg-1");
    expect(msg.threadId).toBe("thread-1");
    expect(msg.from).toBe("alice@example.com");
    expect(msg.subject).toBe("Hi");
    expect(msg.body).toBe("Hello");
    expect(msg.isUnread).toBe(true);
    expect(msg.labels).toContain("INBOX");
  });
});

describe("formatEmailSummary", () => {
  it("formats a summary line", () => {
    const msg = normalizeGmailMessage({
      id: "msg-1",
      payload: {
        headers: [
          { name: "From", value: "alice@example.com" },
          { name: "Subject", value: "Meeting notes" },
          { name: "Date", value: "Mon, 1 Jan 2026" },
        ],
      },
    });
    const summary = formatEmailSummary(msg);
    expect(summary).toContain("alice@example.com");
    expect(summary).toContain("Meeting notes");
  });
});
