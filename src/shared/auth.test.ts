import { describe, expect, it } from "vitest";
import { CALENDAR_SCOPES, GMAIL_SCOPES } from "./auth.js";

describe("scope constants", () => {
  it("exports calendar scopes", () => {
    expect(CALENDAR_SCOPES).toHaveLength(1);
    expect(CALENDAR_SCOPES[0]).toContain("calendar");
  });

  it("exports gmail scopes", () => {
    expect(GMAIL_SCOPES).toHaveLength(3);
    expect(GMAIL_SCOPES.some((s) => s.includes("gmail.readonly"))).toBe(true);
    expect(GMAIL_SCOPES.some((s) => s.includes("gmail.send"))).toBe(true);
    expect(GMAIL_SCOPES.some((s) => s.includes("gmail.modify"))).toBe(true);
  });
});
