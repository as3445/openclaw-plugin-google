/**
 * OpenClaw plugin entry point.
 *
 * Registers Google Calendar and Gmail tools so the agent can interact
 * with both APIs. Loaded by `openclaw plugins install openclaw-plugin-google`.
 *
 * Uses plain JSON Schema for tool parameters (no typebox dependency) so the
 * plugin works regardless of host module resolution.
 */

import * as calendarApi from "./calendar/api.js";
import * as mailApi from "./mail/api.js";
import { normalizeGmailMessage, formatEmailSummary } from "./mail/messages.js";
import { normalizeCalendarEvent, formatEventSummary } from "./calendar/events.js";
import type { GoogleMailAccountConfig } from "./mail/types.js";
import type { GoogleCalendarAccountConfig } from "./calendar/types.js";

// ---------------------------------------------------------------------------
// Account config from environment variables
// ---------------------------------------------------------------------------

function getCalendarAccount(): GoogleCalendarAccountConfig {
  return {
    accountId: process.env.GOOGLE_CALENDAR_ACCOUNT_ID ?? "default",
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
    syncIntervalMinutes: 60,
    lookaheadDays: 30,
    eventTypes: ["created", "updated", "cancelled"],
    credentials: process.env.GOOGLE_CLIENT_ID
      ? {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? "",
        }
      : undefined,
    serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  };
}

function getMailAccount(): GoogleMailAccountConfig {
  return {
    accountId: process.env.GOOGLE_MAIL_ACCOUNT_ID ?? "default",
    enabled: true,
    name: process.env.GOOGLE_MAIL_NAME ?? "default",
    labelFilter: ["INBOX"],
    processRead: false,
    markReadAfterProcessing: true,
    mediaMaxMb: 2,
    pollIntervalMinutes: 5,
    actions: { send: true, reply: true, draft: true, label: true, archive: true, markRead: true, search: true },
    credentials: process.env.GOOGLE_CLIENT_ID
      ? {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? "",
        }
      : undefined,
    serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  };
}

// ---------------------------------------------------------------------------
// Plugin definition — exported for the OpenClaw plugin loader
// ---------------------------------------------------------------------------

export const id = "google-workspace";
export const name = "Google Calendar & Gmail";
export const description = "Google Calendar events and bidirectional Gmail via direct API";
export const configSchema = { type: "object" as const, additionalProperties: true };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function register(api: any) {
  // =================================================================
  // Calendar tools
  // =================================================================

  api.registerTool({
    name: "google_calendar_list_events",
    label: "List Calendar Events",
    description: "List upcoming Google Calendar events within a date range",
    parameters: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID (default: primary)" },
        timeMin: { type: "string", description: "Start time (ISO 8601)" },
        timeMax: { type: "string", description: "End time (ISO 8601)" },
        maxResults: { type: "number", description: "Max events to return (default 10)" },
      },
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const account = getCalendarAccount();
      const events = await calendarApi.listEvents(
        account,
        (params.calendarId as string) ?? "primary",
        {
          timeMin: (params.timeMin as string) ?? new Date().toISOString(),
          timeMax: params.timeMax as string | undefined,
          maxResults: (params.maxResults as number) ?? 10,
        },
      );
      const items = (events.items ?? []).map(normalizeCalendarEvent);
      return { content: [{ type: "text" as const, text: items.map(formatEventSummary).join("\n") || "No events found." }] };
    },
  });

  api.registerTool({
    name: "google_calendar_create_event",
    label: "Create Calendar Event",
    description: "Create a new Google Calendar event",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title" },
        start: { type: "string", description: "Start time (ISO 8601)" },
        end: { type: "string", description: "End time (ISO 8601)" },
        description: { type: "string", description: "Event description" },
        location: { type: "string", description: "Event location" },
        calendarId: { type: "string", description: "Calendar ID (default: primary)" },
      },
      required: ["summary", "start", "end"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const account = getCalendarAccount();
      const event = await calendarApi.createEvent(account, (params.calendarId as string) ?? "primary", {
        summary: params.summary as string,
        start: { dateTime: params.start as string },
        end: { dateTime: params.end as string },
        description: params.description as string | undefined,
        location: params.location as string | undefined,
      });
      return { content: [{ type: "text" as const, text: `Event created: ${event.summary} (${event.htmlLink ?? event.id})` }] };
    },
  });

  api.registerTool({
    name: "google_calendar_delete_event",
    label: "Delete Calendar Event",
    description: "Delete a Google Calendar event",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Event ID to delete" },
        calendarId: { type: "string", description: "Calendar ID (default: primary)" },
      },
      required: ["eventId"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const account = getCalendarAccount();
      await calendarApi.deleteEvent(account, (params.calendarId as string) ?? "primary", params.eventId as string);
      return { content: [{ type: "text" as const, text: `Event ${params.eventId} deleted.` }] };
    },
  });

  // =================================================================
  // Gmail tools
  // =================================================================

  api.registerTool({
    name: "gmail_send",
    label: "Send Email",
    description: "Compose and send a new email via Gmail",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Comma-separated recipient email addresses" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Plain text email body" },
        cc: { type: "string", description: "Comma-separated CC addresses" },
        bcc: { type: "string", description: "Comma-separated BCC addresses" },
      },
      required: ["to", "subject", "body"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const account = getMailAccount();
      const result = await mailApi.sendMessage(account, {
        to: (params.to as string).split(",").map((s) => s.trim()),
        cc: params.cc ? (params.cc as string).split(",").map((s) => s.trim()) : undefined,
        bcc: params.bcc ? (params.bcc as string).split(",").map((s) => s.trim()) : undefined,
        subject: params.subject as string,
        body: params.body as string,
      });
      return { content: [{ type: "text" as const, text: `Email sent (ID: ${result.id}).` }] };
    },
  });

  api.registerTool({
    name: "gmail_reply",
    label: "Reply to Email",
    description: "Reply to an existing email thread",
    parameters: {
      type: "object",
      properties: {
        originalMessageId: { type: "string", description: "Gmail message ID to reply to" },
        body: { type: "string", description: "Reply body text" },
      },
      required: ["originalMessageId", "body"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const account = getMailAccount();
      const result = await mailApi.replyToMessage(account, params.originalMessageId as string, params.body as string);
      return { content: [{ type: "text" as const, text: `Reply sent (ID: ${result.id}).` }] };
    },
  });

  api.registerTool({
    name: "gmail_search",
    label: "Search Email",
    description: "Search Gmail using query syntax (e.g. 'from:alice subject:meeting')",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query" },
        maxResults: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const account = getMailAccount();
      const list = await mailApi.listMessages(account, params.query as string, (params.maxResults as number) ?? 10);
      const ids = (list.messages ?? []).map((m: { id: string }) => m.id);
      if (ids.length === 0) return { content: [{ type: "text" as const, text: "No messages found." }] };
      const summaries: string[] = [];
      for (const mid of ids.slice(0, 10)) {
        const raw = await mailApi.getMessage(account, mid, "metadata");
        const msg = normalizeGmailMessage(raw);
        summaries.push(formatEmailSummary(msg));
      }
      return { content: [{ type: "text" as const, text: summaries.join("\n") }] };
    },
  });

  api.registerTool({
    name: "gmail_archive",
    label: "Archive Email",
    description: "Archive a Gmail message (remove INBOX label)",
    parameters: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "Gmail message ID" },
      },
      required: ["messageId"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const account = getMailAccount();
      await mailApi.modifyLabels(account, params.messageId as string, [], ["INBOX"]);
      return { content: [{ type: "text" as const, text: `Archived ${params.messageId}.` }] };
    },
  });

  api.registerTool({
    name: "gmail_mark_read",
    label: "Mark Email Read",
    description: "Mark a Gmail message as read",
    parameters: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "Gmail message ID" },
      },
      required: ["messageId"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const account = getMailAccount();
      await mailApi.modifyLabels(account, params.messageId as string, [], ["UNREAD"]);
      return { content: [{ type: "text" as const, text: `Marked ${params.messageId} as read.` }] };
    },
  });

  api.registerTool({
    name: "gmail_draft",
    label: "Create Email Draft",
    description: "Create an email draft without sending",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Comma-separated recipients" },
        subject: { type: "string", description: "Subject line" },
        body: { type: "string", description: "Email body" },
      },
      required: ["to", "subject", "body"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const account = getMailAccount();
      const result = await mailApi.createDraft(account, {
        to: (params.to as string).split(",").map((s) => s.trim()),
        subject: params.subject as string,
        body: params.body as string,
      });
      return { content: [{ type: "text" as const, text: `Draft created (ID: ${result.id}).` }] };
    },
  });
}

// Default export for OpenClaw plugin loader compatibility
export default { id, name, description, configSchema, register };
