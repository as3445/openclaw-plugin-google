import crypto from "node:crypto";
import { getCalendarAccessToken } from "./auth.js";
import type {
  CalendarEventsListResponse,
  CalendarWatchResponse,
  GoogleCalendarAccountConfig,
  RawCalendarEvent,
} from "./types.js";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

// ---------------------------------------------------------------------------
// Internal fetch helpers
// ---------------------------------------------------------------------------

/** Maximum number of pagination pages to follow before bailing out. */
const MAX_PAGINATION_PAGES = 100;

/** Truncate error body to avoid leaking sensitive data in logs/stack traces. */
function sanitizeErrorBody(text: string): string {
  const truncated = text.length > 200 ? text.slice(0, 200) + "..." : text;
  return truncated.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

async function calendarFetch<T>(
  account: GoogleCalendarAccountConfig,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getCalendarAccessToken(account);
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Google Calendar API ${response.status}: ${sanitizeErrorBody(text) || response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

async function calendarFetchOk(
  account: GoogleCalendarAccountConfig,
  url: string,
  init?: RequestInit,
): Promise<void> {
  const token = await getCalendarAccessToken(account);
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Google Calendar API ${response.status}: ${sanitizeErrorBody(text) || response.statusText}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Events CRUD
// ---------------------------------------------------------------------------

export type ListEventsOptions = {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  pageToken?: string;
  singleEvents?: boolean;
  orderBy?: "startTime" | "updated";
  q?: string;
};

/** List events within a time range. */
export async function listEvents(
  account: GoogleCalendarAccountConfig,
  calendarId: string,
  options: ListEventsOptions = {},
): Promise<CalendarEventsListResponse> {
  const url = new URL(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
  if (options.timeMin) url.searchParams.set("timeMin", options.timeMin);
  if (options.timeMax) url.searchParams.set("timeMax", options.timeMax);
  if (options.maxResults) url.searchParams.set("maxResults", String(options.maxResults));
  if (options.pageToken) url.searchParams.set("pageToken", options.pageToken);
  if (options.singleEvents !== undefined) {
    url.searchParams.set("singleEvents", String(options.singleEvents));
  }
  if (options.orderBy) url.searchParams.set("orderBy", options.orderBy);
  if (options.q) url.searchParams.set("q", options.q);
  return calendarFetch<CalendarEventsListResponse>(account, url.toString(), { method: "GET" });
}

/** Get a single event by ID. */
export async function getEvent(
  account: GoogleCalendarAccountConfig,
  calendarId: string,
  eventId: string,
): Promise<RawCalendarEvent> {
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  return calendarFetch<RawCalendarEvent>(account, url, { method: "GET" });
}

/** Create a new event. */
export async function createEvent(
  account: GoogleCalendarAccountConfig,
  calendarId: string,
  event: Partial<RawCalendarEvent>,
): Promise<RawCalendarEvent> {
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  return calendarFetch<RawCalendarEvent>(account, url, {
    method: "POST",
    body: JSON.stringify(event),
  });
}

/** Update an existing event (patch semantics). */
export async function updateEvent(
  account: GoogleCalendarAccountConfig,
  calendarId: string,
  eventId: string,
  event: Partial<RawCalendarEvent>,
): Promise<RawCalendarEvent> {
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  return calendarFetch<RawCalendarEvent>(account, url, {
    method: "PATCH",
    body: JSON.stringify(event),
  });
}

/** Delete an event. */
export async function deleteEvent(
  account: GoogleCalendarAccountConfig,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  await calendarFetchOk(account, url, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Incremental sync
// ---------------------------------------------------------------------------

/**
 * Perform an incremental (or initial) sync of events.
 *
 * When `syncToken` is provided, only changes since the last sync are returned.
 * When absent, a full listing is performed (with `timeMin` set to now).
 *
 * Returns events and the next sync token. If the sync token is expired (410 Gone),
 * the caller should discard state and re-sync from scratch.
 */
export async function syncEvents(
  account: GoogleCalendarAccountConfig,
  calendarId: string,
  syncToken?: string,
): Promise<{ events: RawCalendarEvent[]; nextSyncToken: string }> {
  const allEvents: RawCalendarEvent[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  // eslint-disable-next-line no-constant-condition -- pagination loop
  while (true) {
    if (++pageCount > MAX_PAGINATION_PAGES) {
      throw new Error(
        `Google Calendar sync exceeded ${MAX_PAGINATION_PAGES} pages; aborting to prevent runaway pagination`,
      );
    }
    const url = new URL(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);

    if (syncToken && !pageToken) {
      url.searchParams.set("syncToken", syncToken);
    } else if (!syncToken && !pageToken) {
      url.searchParams.set("timeMin", new Date().toISOString());
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
    }

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    url.searchParams.set("maxResults", "250");

    const page = await calendarFetch<CalendarEventsListResponse>(account, url.toString(), {
      method: "GET",
    });

    if (page.items) {
      allEvents.push(...page.items);
    }

    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
      continue;
    }

    const nextSyncToken = page.nextSyncToken;
    if (!nextSyncToken) {
      throw new Error("Google Calendar API did not return a sync token");
    }

    return { events: allEvents, nextSyncToken };
  }
}

// ---------------------------------------------------------------------------
// Push notification watch
// ---------------------------------------------------------------------------

/**
 * Create a watch channel for push notifications on a calendar.
 * Google will POST to `webhookUrl` when events change.
 */
export async function watchCalendar(
  account: GoogleCalendarAccountConfig,
  calendarId: string,
  webhookUrl: string,
  channelToken: string,
): Promise<CalendarWatchResponse> {
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/watch`;
  const channelId = crypto.randomUUID();
  return calendarFetch<CalendarWatchResponse>(account, url, {
    method: "POST",
    body: JSON.stringify({
      id: channelId,
      type: "web_hook",
      address: webhookUrl,
      token: channelToken,
    }),
  });
}

/**
 * Stop an existing watch channel.
 */
export async function stopWatch(
  account: GoogleCalendarAccountConfig,
  channelId: string,
  resourceId: string,
): Promise<void> {
  const url = `${CALENDAR_API_BASE}/channels/stop`;
  await calendarFetchOk(account, url, {
    method: "POST",
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}
