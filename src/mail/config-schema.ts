import { z } from "zod";

const GoogleMailActionsSchema = z
  .object({
    send: z.boolean().default(true),
    reply: z.boolean().default(true),
    draft: z.boolean().default(true),
    label: z.boolean().default(true),
    archive: z.boolean().default(true),
    markRead: z.boolean().default(true),
    search: z.boolean().default(true),
  })
  .strict()
  .default({
    send: true,
    reply: true,
    draft: true,
    label: true,
    archive: true,
    markRead: true,
    search: true,
  });

export const GoogleMailConfigSchema = z
  .object({
    /** Whether this account is active. */
    enabled: z.boolean().default(true),

    /** Display name for the account. */
    name: z.string().optional(),

    /** Gmail label IDs to monitor for inbound messages. */
    labelFilter: z.array(z.string()).default(["INBOX"]),

    /** Whether to process already-read messages during sync. */
    processRead: z.boolean().default(false),

    /** Mark messages as read after the agent processes them. */
    markReadAfterProcessing: z.boolean().default(true),

    /** Maximum attachment size in megabytes to inline as base64. */
    mediaMaxMb: z.number().min(0).max(25).default(2),

    /** Polling interval in minutes when Pub/Sub push is not configured. */
    pollIntervalMinutes: z.number().int().min(1).max(1440).default(5),

    /** Google Cloud Pub/Sub topic for push notifications (optional). */
    pubsubTopic: z.string().optional(),

    /** Public webhook URL for Pub/Sub push delivery (optional). */
    webhookUrl: z.string().url().optional(),

    /** Email signature appended to outbound messages. */
    signature: z.string().optional(),

    /** Which outbound actions the agent may perform. */
    actions: GoogleMailActionsSchema,
  })
  .strict();

export type GoogleMailConfig = z.infer<typeof GoogleMailConfigSchema>;
