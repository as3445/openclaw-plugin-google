import type { CalendarEvent, RawCalendarEvent } from "./types.js";

/**
 * Normalize a raw Google Calendar API event into a well-typed `CalendarEvent`.
 * Missing fields receive sensible defaults so downstream code can rely on
 * the shape without null checks.
 */
export function normalizeCalendarEvent(raw: RawCalendarEvent): CalendarEvent {
  return {
    id: raw.id ?? "",
    summary: raw.summary ?? "(No title)",
    description: raw.description ?? "",
    start: raw.start ?? {},
    end: raw.end ?? {},
    location: raw.location ?? "",
    attendees: raw.attendees ?? [],
    status: normalizeStatus(raw.status),
    htmlLink: raw.htmlLink ?? "",
    creator: raw.creator ?? { email: "" },
    organizer: raw.organizer ?? { email: "" },
    updated: raw.updated ?? "",
    recurringEventId: raw.recurringEventId,
  };
}

function normalizeStatus(status: string | undefined): CalendarEvent["status"] {
  switch (status) {
    case "confirmed":
    case "tentative":
    case "cancelled":
      return status;
    default:
      return "confirmed";
  }
}

/**
 * Format a calendar event into a concise, human-readable summary string.
 */
export function formatEventSummary(event: CalendarEvent): string {
  const parts: string[] = [];

  parts.push(event.summary);

  const when = formatWhen(event);
  if (when) parts.push(when);

  if (event.location) {
    parts.push(`at ${event.location}`);
  }

  if (event.status === "cancelled") {
    parts.push("(cancelled)");
  }

  return parts.join(" -- ");
}

function formatWhen(event: CalendarEvent): string {
  const start = event.start.dateTime ?? event.start.date;
  const end = event.end.dateTime ?? event.end.date;

  if (!start) return "";

  const startDate = new Date(start);
  const options: Intl.DateTimeFormatOptions = event.start.dateTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" };

  let when = startDate.toLocaleString("en-US", options);

  if (end) {
    const endDate = new Date(end);
    const endOptions: Intl.DateTimeFormatOptions = event.end.dateTime
      ? { timeStyle: "short" }
      : { dateStyle: "medium" };
    when += ` to ${endDate.toLocaleString("en-US", endOptions)}`;
  }

  return when;
}

/**
 * Map a normalized CalendarEvent to an inbound message payload.
 *
 * Session ID format: `agent:<agentId>:google-calendar:<type>:<resourceId>`
 */
export function calendarEventToMessage(
  event: CalendarEvent,
  params: { agentId: string },
): {
  sessionId: string;
  text: string;
  metadata: Record<string, string>;
} {
  const type = event.status === "cancelled" ? "cancelled" : "updated";
  const sessionId = `agent:${params.agentId}:google-calendar:${type}:${event.id}`;
  const text = formatEventSummary(event);
  const metadata: Record<string, string> = {
    eventId: event.id,
    eventStatus: event.status,
    htmlLink: event.htmlLink,
    calendarChannel: "google-calendar",
  };

  return { sessionId, text, metadata };
}
