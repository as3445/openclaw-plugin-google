/**
 * OpenClaw plugin entry point.
 *
 * Registers Google Calendar and Gmail tools so the agent can interact
 * with both APIs. Loaded by `openclaw plugins install openclaw-plugin-google`.
 *
 * Uses createRequire for openclaw SDK and typebox so the module loads
 * correctly under jiti's CJS fallback (await import() causes ParseError
 * when jiti parses the file as CommonJS).
 */

import { createRequire } from "node:module";
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
// Dynamic plugin registration (only when loaded inside OpenClaw)
// ---------------------------------------------------------------------------

function register() {
  // Use createRequire instead of await import() — jiti (OpenClaw's plugin
  // loader) parses files through a CJS fallback where top-level and nested
  // await causes "Unexpected reserved word 'await'" ParseError.
  const require = createRequire(import.meta.url);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sdk: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Type: any;
  try {
    sdk = require("openclaw/plugin-sdk/plugin-entry");
    Type = require("@sinclair/typebox").Type;
  } catch {
    // Not inside OpenClaw — standalone library usage, skip registration.
    return;
  }

  sdk.definePluginEntry({
    id: "google-workspace",
    name: "Google Calendar & Gmail",
    description: "Google Calendar events and bidirectional Gmail via direct API",

    register(api) {
      // =================================================================
      // Calendar tools
      // =================================================================

      api.registerTool({
        name: "google_calendar_list_events",
        description: "List upcoming Google Calendar events within a date range",
        parameters: Type.Object({
          calendarId: Type.Optional(Type.String({ description: "Calendar ID (default: primary)" })),
          timeMin: Type.Optional(Type.String({ description: "Start time (ISO 8601)" })),
          timeMax: Type.Optional(Type.String({ description: "End time (ISO 8601)" })),
          maxResults: Type.Optional(Type.Number({ description: "Max events to return (default 10)" })),
        }),
        async execute(_id, params) {
          const account = getCalendarAccount();
          const events = await calendarApi.listEvents(
            account,
            (params as Record<string, unknown>).calendarId as string ?? "primary",
            {
              timeMin: (params as Record<string, unknown>).timeMin as string ?? new Date().toISOString(),
              timeMax: (params as Record<string, unknown>).timeMax as string | undefined,
              maxResults: (params as Record<string, unknown>).maxResults as number ?? 10,
            },
          );
          const items = (events.items ?? []).map(normalizeCalendarEvent);
          return { content: [{ type: "text" as const, text: items.map(formatEventSummary).join("\n") || "No events found." }] };
        },
      });

      api.registerTool({
        name: "google_calendar_create_event",
        description: "Create a new Google Calendar event",
        parameters: Type.Object({
          summary: Type.String({ description: "Event title" }),
          start: Type.String({ description: "Start time (ISO 8601)" }),
          end: Type.String({ description: "End time (ISO 8601)" }),
          description: Type.Optional(Type.String({ description: "Event description" })),
          location: Type.Optional(Type.String({ description: "Event location" })),
          calendarId: Type.Optional(Type.String({ description: "Calendar ID (default: primary)" })),
        }),
        async execute(_id, params) {
          const p = params as Record<string, unknown>;
          const account = getCalendarAccount();
          const event = await calendarApi.createEvent(account, p.calendarId as string ?? "primary", {
            summary: p.summary as string,
            start: { dateTime: p.start as string },
            end: { dateTime: p.end as string },
            description: p.description as string | undefined,
            location: p.location as string | undefined,
          });
          return { content: [{ type: "text" as const, text: `Event created: ${event.summary} (${event.htmlLink ?? event.id})` }] };
        },
      });

      api.registerTool({
        name: "google_calendar_delete_event",
        description: "Delete a Google Calendar event",
        parameters: Type.Object({
          eventId: Type.String({ description: "Event ID to delete" }),
          calendarId: Type.Optional(Type.String({ description: "Calendar ID (default: primary)" })),
        }),
        async execute(_id, params) {
          const p = params as Record<string, unknown>;
          const account = getCalendarAccount();
          await calendarApi.deleteEvent(account, p.calendarId as string ?? "primary", p.eventId as string);
          return { content: [{ type: "text" as const, text: `Event ${p.eventId} deleted.` }] };
        },
      });

      // =================================================================
      // Gmail tools
      // =================================================================

      api.registerTool({
        name: "gmail_send",
        description: "Compose and send a new email via Gmail",
        parameters: Type.Object({
          to: Type.String({ description: "Comma-separated recipient email addresses" }),
          subject: Type.String({ description: "Email subject line" }),
          body: Type.String({ description: "Plain text email body" }),
          cc: Type.Optional(Type.String({ description: "Comma-separated CC addresses" })),
          bcc: Type.Optional(Type.String({ description: "Comma-separated BCC addresses" })),
        }),
        async execute(_id, params) {
          const p = params as Record<string, unknown>;
          const account = getMailAccount();
          const result = await mailApi.sendMessage(account, {
            to: (p.to as string).split(",").map((s) => s.trim()),
            cc: p.cc ? (p.cc as string).split(",").map((s) => s.trim()) : undefined,
            bcc: p.bcc ? (p.bcc as string).split(",").map((s) => s.trim()) : undefined,
            subject: p.subject as string,
            body: p.body as string,
          });
          return { content: [{ type: "text" as const, text: `Email sent (ID: ${result.id}).` }] };
        },
      });

      api.registerTool({
        name: "gmail_reply",
        description: "Reply to an existing email thread",
        parameters: Type.Object({
          originalMessageId: Type.String({ description: "Gmail message ID to reply to" }),
          body: Type.String({ description: "Reply body text" }),
        }),
        async execute(_id, params) {
          const p = params as Record<string, unknown>;
          const account = getMailAccount();
          const result = await mailApi.replyToMessage(account, p.originalMessageId as string, p.body as string);
          return { content: [{ type: "text" as const, text: `Reply sent (ID: ${result.id}).` }] };
        },
      });

      api.registerTool({
        name: "gmail_search",
        description: "Search Gmail using query syntax (e.g. 'from:alice subject:meeting')",
        parameters: Type.Object({
          query: Type.String({ description: "Gmail search query" }),
          maxResults: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
        }),
        async execute(_id, params) {
          const p = params as Record<string, unknown>;
          const account = getMailAccount();
          const list = await mailApi.listMessages(account, p.query as string, (p.maxResults as number) ?? 10);
          const ids = (list.messages ?? []).map((m) => m.id);
          if (ids.length === 0) return { content: [{ type: "text" as const, text: "No messages found." }] };
          const summaries: string[] = [];
          for (const id of ids.slice(0, 10)) {
            const raw = await mailApi.getMessage(account, id, "metadata");
            const msg = normalizeGmailMessage(raw);
            summaries.push(formatEmailSummary(msg));
          }
          return { content: [{ type: "text" as const, text: summaries.join("\n") }] };
        },
      });

      api.registerTool({
        name: "gmail_archive",
        description: "Archive a Gmail message (remove INBOX label)",
        parameters: Type.Object({ messageId: Type.String({ description: "Gmail message ID" }) }),
        async execute(_id, params) {
          const p = params as Record<string, unknown>;
          const account = getMailAccount();
          await mailApi.modifyLabels(account, p.messageId as string, [], ["INBOX"]);
          return { content: [{ type: "text" as const, text: `Archived ${p.messageId}.` }] };
        },
      });

      api.registerTool({
        name: "gmail_mark_read",
        description: "Mark a Gmail message as read",
        parameters: Type.Object({ messageId: Type.String({ description: "Gmail message ID" }) }),
        async execute(_id, params) {
          const p = params as Record<string, unknown>;
          const account = getMailAccount();
          await mailApi.modifyLabels(account, p.messageId as string, [], ["UNREAD"]);
          return { content: [{ type: "text" as const, text: `Marked ${p.messageId} as read.` }] };
        },
      });

      api.registerTool({
        name: "gmail_draft",
        description: "Create an email draft without sending",
        parameters: Type.Object({
          to: Type.String({ description: "Comma-separated recipients" }),
          subject: Type.String({ description: "Subject line" }),
          body: Type.String({ description: "Email body" }),
        }),
        async execute(_id, params) {
          const p = params as Record<string, unknown>;
          const account = getMailAccount();
          const result = await mailApi.createDraft(account, {
            to: (p.to as string).split(",").map((s) => s.trim()),
            subject: p.subject as string,
            body: p.body as string,
          });
          return { content: [{ type: "text" as const, text: `Draft created (ID: ${result.id}).` }] };
        },
      });
    },
  });
}

// Auto-register when loaded
register();
