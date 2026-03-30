import { z } from "zod";

const CalendarEventTypeSchema = z.enum(["created", "updated", "cancelled"]);

export const GoogleCalendarConfigSchema = z
  .object({
    /** The calendar to sync. Defaults to the authenticated user's primary calendar. */
    calendarId: z.string().default("primary"),

    /** Public webhook URL for push notifications. Optional -- polling is used when absent. */
    webhookUrl: z.string().url().optional(),

    /** Interval in minutes between polling syncs. */
    syncIntervalMinutes: z.number().int().min(1).max(1440).default(60),

    /** How many days ahead to include when performing a full sync. */
    lookaheadDays: z.number().int().min(1).max(365).default(30),

    /** Which event mutation types to surface. */
    eventTypes: z.array(CalendarEventTypeSchema).default(["created", "updated", "cancelled"]),
  })
  .strict();

export type GoogleCalendarConfig = z.infer<typeof GoogleCalendarConfigSchema>;
