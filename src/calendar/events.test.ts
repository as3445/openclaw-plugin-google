import { describe, expect, it } from "vitest";
import {
  normalizeCalendarEvent,
  formatEventSummary,
  calendarEventToMessage,
} from "./events.js";
import type { RawCalendarEvent } from "./types.js";

describe("normalizeCalendarEvent", () => {
  it("fills missing fields with defaults", () => {
    const raw: RawCalendarEvent = { id: "evt-1" };
    const event = normalizeCalendarEvent(raw);

    expect(event.id).toBe("evt-1");
    expect(event.summary).toBe("(No title)");
    expect(event.description).toBe("");
    expect(event.location).toBe("");
    expect(event.attendees).toEqual([]);
    expect(event.status).toBe("confirmed");
    expect(event.creator).toEqual({ email: "" });
  });

  it("preserves provided fields", () => {
    const raw: RawCalendarEvent = {
      id: "evt-2",
      summary: "Standup",
      status: "tentative",
      location: "Room A",
    };
    const event = normalizeCalendarEvent(raw);

    expect(event.summary).toBe("Standup");
    expect(event.status).toBe("tentative");
    expect(event.location).toBe("Room A");
  });

  it("normalizes unknown status to confirmed", () => {
    const raw: RawCalendarEvent = { id: "evt-3", status: "unknown" };
    const event = normalizeCalendarEvent(raw);
    expect(event.status).toBe("confirmed");
  });
});

describe("formatEventSummary", () => {
  it("formats a basic event", () => {
    const event = normalizeCalendarEvent({
      id: "e1",
      summary: "Lunch",
      location: "Cafe",
    });
    const summary = formatEventSummary(event);
    expect(summary).toContain("Lunch");
    expect(summary).toContain("at Cafe");
  });

  it("includes cancelled marker", () => {
    const event = normalizeCalendarEvent({
      id: "e2",
      summary: "Meeting",
      status: "cancelled",
    });
    const summary = formatEventSummary(event);
    expect(summary).toContain("(cancelled)");
  });
});

describe("calendarEventToMessage", () => {
  it("produces a session ID and text", () => {
    const event = normalizeCalendarEvent({
      id: "e1",
      summary: "Sprint Review",
    });
    const msg = calendarEventToMessage(event, { agentId: "agent-1" });

    expect(msg.sessionId).toBe("agent:agent-1:google-calendar:updated:e1");
    expect(msg.text).toContain("Sprint Review");
    expect(msg.metadata.eventId).toBe("e1");
    expect(msg.metadata.calendarChannel).toBe("google-calendar");
  });

  it("uses cancelled type for cancelled events", () => {
    const event = normalizeCalendarEvent({
      id: "e2",
      summary: "Cancelled",
      status: "cancelled",
    });
    const msg = calendarEventToMessage(event, { agentId: "agent-1" });
    expect(msg.sessionId).toContain(":cancelled:");
  });
});
