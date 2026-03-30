/** A normalized Google Calendar event. */
export type CalendarEvent = {
  id: string;
  summary: string;
  description: string;
  start: CalendarEventDateTime;
  end: CalendarEventDateTime;
  location: string;
  attendees: CalendarAttendee[];
  status: CalendarEventStatus;
  htmlLink: string;
  creator: CalendarPrincipal;
  organizer: CalendarPrincipal;
  updated: string;
  recurringEventId?: string;
};

export type CalendarEventDateTime = {
  dateTime?: string;
  date?: string;
  timeZone?: string;
};

export type CalendarAttendee = {
  email: string;
  displayName?: string;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  self?: boolean;
  organizer?: boolean;
};

export type CalendarPrincipal = {
  email: string;
  displayName?: string;
  self?: boolean;
};

export type CalendarEventStatus = "confirmed" | "tentative" | "cancelled";

/** Headers sent by Google Calendar push notifications. */
export type CalendarWebhookHeaders = {
  channelId: string;
  channelToken: string;
  resourceId: string;
  resourceState: "sync" | "exists" | "not_exists";
  resourceUri?: string;
  messageNumber?: string;
  channelExpiration?: string;
};

/** Persisted sync state for incremental calendar sync. */
export type SyncState = {
  syncToken: string;
  calendarId: string;
  lastSyncAt: string;
};

/** A registered push notification watch channel. */
export type WatchChannel = {
  id: string;
  resourceId: string;
  token: string;
  expiration: number;
  calendarId: string;
};

/** Account configuration for a Google Calendar connection. */
export type GoogleCalendarAccountConfig = {
  accountId: string;
  calendarId: string;
  credentialsFile?: string;
  credentials?: {
    client_id: string;
    client_secret: string;
    refresh_token: string;
    type?: string;
  };
  serviceAccountFile?: string;
  serviceAccountCredentials?: Record<string, unknown>;
  webhookUrl?: string;
  syncIntervalMinutes: number;
  lookaheadDays: number;
  eventTypes: CalendarEventType[];
};

export type CalendarEventType = "created" | "updated" | "cancelled";

/** Raw event shape from the Google Calendar API v3. */
export type RawCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  start?: CalendarEventDateTime;
  end?: CalendarEventDateTime;
  location?: string;
  attendees?: CalendarAttendee[];
  status?: string;
  htmlLink?: string;
  creator?: CalendarPrincipal;
  organizer?: CalendarPrincipal;
  updated?: string;
  recurringEventId?: string;
};

/** Response shape from the Calendar API events.list / events.watch. */
export type CalendarEventsListResponse = {
  kind?: string;
  summary?: string;
  items?: RawCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

/** Response shape from the Calendar API channels.stop or events.watch creation. */
export type CalendarWatchResponse = {
  kind?: string;
  id?: string;
  resourceId?: string;
  resourceUri?: string;
  token?: string;
  expiration?: string;
};
