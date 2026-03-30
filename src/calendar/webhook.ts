import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { CalendarWebhookHeaders } from "./types.js";

const VALID_RESOURCE_STATES = new Set<string>(["sync", "exists", "not_exists"]);

/**
 * Parse Google Calendar push-notification headers from an incoming request.
 *
 * Calendar webhooks carry ALL information in headers -- the request body is
 * empty. The headers of interest:
 *   X-Goog-Channel-ID      - the channel id from watchCalendar
 *   X-Goog-Channel-Token   - the secret token we supplied
 *   X-Goog-Resource-ID     - opaque resource identifier
 *   X-Goog-Resource-State  - "sync" | "exists" | "not_exists"
 *   X-Goog-Resource-URI    - the URI of the changed resource
 *   X-Goog-Message-Number  - monotonically increasing message number
 *   X-Goog-Channel-Expiration - RFC 2822 expiration timestamp
 */
export function parseWebhookHeaders(req: IncomingMessage): CalendarWebhookHeaders | null {
  const channelId = headerValue(req, "x-goog-channel-id");
  const channelToken = headerValue(req, "x-goog-channel-token");
  const resourceId = headerValue(req, "x-goog-resource-id");
  const resourceState = headerValue(req, "x-goog-resource-state");

  if (!channelId || !resourceId || !resourceState) {
    return null;
  }

  if (!VALID_RESOURCE_STATES.has(resourceState)) {
    return null;
  }

  return {
    channelId,
    channelToken: channelToken ?? "",
    resourceId,
    resourceState: resourceState as CalendarWebhookHeaders["resourceState"],
    resourceUri: headerValue(req, "x-goog-resource-uri") ?? undefined,
    messageNumber: headerValue(req, "x-goog-message-number") ?? undefined,
    channelExpiration: headerValue(req, "x-goog-channel-expiration") ?? undefined,
  };
}

/** Constant-time string comparison to prevent timing-based token extraction. */
function timingSafeTokenEqual(expected: string, actual: string): boolean {
  const expectedBuf = Buffer.from(expected, "utf-8");
  const actualBuf = Buffer.from(actual, "utf-8");
  if (expectedBuf.length !== actualBuf.length) {
    crypto.timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

function headerValue(req: IncomingMessage, name: string): string | null {
  const raw = req.headers[name];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

/**
 * Create an HTTP request handler for Google Calendar push notifications.
 *
 * The handler:
 *   1. Verifies the channel token BEFORE any further processing.
 *   2. Returns 200 immediately (Google retries on non-2xx).
 *   3. On "exists" state, invokes `onEventChange` to trigger an incremental sync.
 *
 * Calendar webhooks carry no body -- all metadata is in headers.
 */
export function createCalendarWebhookHandler(params: {
  /** Expected channel tokens, keyed by channel ID. */
  channelTokens: Map<string, string>;
  /** Called when events have changed and an incremental sync should occur. */
  onEventChange: (headers: CalendarWebhookHeaders) => Promise<void>;
}): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const { channelTokens, onEventChange } = params;

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const headers = parseWebhookHeaders(req);
    if (!headers) {
      res.statusCode = 400;
      res.end("missing required headers");
      return false;
    }

    const expectedToken = channelTokens.get(headers.channelId);
    if (!expectedToken || !timingSafeTokenEqual(expectedToken, headers.channelToken)) {
      res.statusCode = 403;
      res.end("invalid channel token");
      return false;
    }

    res.statusCode = 200;
    res.end();

    if (headers.resourceState === "exists") {
      onEventChange(headers).catch((err) => {
        console.error("[google-calendar] incremental sync failed:", err);
      });
    }

    return true;
  };
}
