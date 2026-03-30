import { describe, expect, it } from "vitest";
import { composeRfc2822Message, GMAIL_TOOLS } from "./actions.js";

describe("composeRfc2822Message", () => {
  it("composes a plain text message", () => {
    const raw = composeRfc2822Message({
      to: ["bob@example.com"],
      subject: "Hello",
      body: "Hi Bob",
    });
    expect(raw).toContain("To: bob@example.com");
    expect(raw).toContain("Subject: Hello");
    expect(raw).toContain("Hi Bob");
    expect(raw).toContain("Content-Type: text/plain");
  });

  it("composes a multipart message with HTML", () => {
    const raw = composeRfc2822Message({
      to: ["bob@example.com"],
      subject: "HTML Test",
      body: "Plain",
      htmlBody: "<p>HTML</p>",
    });
    expect(raw).toContain("multipart/alternative");
    expect(raw).toContain("Plain");
    expect(raw).toContain("<p>HTML</p>");
  });

  it("appends signature when provided", () => {
    const raw = composeRfc2822Message(
      {
        to: ["bob@example.com"],
        subject: "Sig",
        body: "Body",
      },
      "-- Sent from OpenClaw",
    );
    expect(raw).toContain("-- Sent from OpenClaw");
  });

  it("includes In-Reply-To and References for replies", () => {
    const raw = composeRfc2822Message({
      to: ["bob@example.com"],
      subject: "Re: Hello",
      body: "Reply",
      replyToMessageId: "<abc@example.com>",
    });
    expect(raw).toContain("In-Reply-To: <abc@example.com>");
    expect(raw).toContain("References: <abc@example.com>");
  });

  it("sanitizes header injection in subject", () => {
    const raw = composeRfc2822Message({
      to: ["bob@example.com"],
      subject: "Hello\r\nBcc: evil@example.com",
      body: "Body",
    });
    expect(raw).not.toContain("\r\nBcc: evil@example.com");
  });
});

describe("GMAIL_TOOLS", () => {
  it("exports the expected tool count", () => {
    expect(GMAIL_TOOLS.length).toBe(7);
  });

  it("each tool has name and description", () => {
    for (const tool of GMAIL_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
    }
  });
});
