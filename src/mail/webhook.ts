import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { GmailPubSubNotification } from "./types.js";

/**
 * Decode the Pub/Sub push notification payload.
 *
 * Pub/Sub pushes a JSON body with `message.data` as a base64-encoded string
 * containing `{ emailAddress, historyId }`.
 */
function decodePubSubNotification(body: unknown): GmailPubSubNotification | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const msg = (body as Record<string, unknown>).message;
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return null;
  }
  const data = (msg as Record<string, unknown>).data;
  if (typeof data !== "string") {
    return null;
  }
  try {
    const decoded = Buffer.from(data, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    const emailAddress = typeof parsed.emailAddress === "string" ? parsed.emailAddress : "";
    const historyId = typeof parsed.historyId === "number" ? parsed.historyId : 0;
    if (!emailAddress || historyId === 0) {
      return null;
    }
    return { emailAddress, historyId };
  } catch {
    return null;
  }
}

/**
 * Read the request body as a UTF-8 string with a max size guard.
 */
function readBody(req: IncomingMessage, maxBytes = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Extract the bearer token from the Authorization header.
 */
function extractBearerToken(header: unknown): string {
  const raw = Array.isArray(header) ? String(header[0] ?? "") : String(header ?? "");
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice("bearer ".length).trim() : "";
}

/**
 * Timing-safe comparison of two secret strings.
 * Hashes both inputs with SHA-256 to normalize length before comparison.
 */
function safeEqualSecret(provided: string, expected: string): boolean {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(provided), hash(expected));
}

export type GmailWebhookHandler = (notification: GmailPubSubNotification) => Promise<void>;

/**
 * Create an HTTP request handler for Gmail Pub/Sub push notifications.
 *
 * The handler:
 *   1. Verifies the bearer token BEFORE reading the body
 *   2. Decodes base64 message.data to get { emailAddress, historyId }
 *   3. Returns 200 immediately
 *   4. Triggers the sync callback asynchronously
 */
export function createGmailWebhookHandler(params: {
  /** Expected Pub/Sub bearer token for verification. */
  expectedToken?: string;
  /** Callback invoked asynchronously after the 200 response. */
  onNotification: GmailWebhookHandler;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }

    if (params.expectedToken) {
      const bearer = extractBearerToken(req.headers.authorization);
      if (!bearer || !safeEqualSecret(bearer, params.expectedToken)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
    }

    let rawBody: string;
    try {
      rawBody = await readBody(req);
    } catch {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      res.statusCode = 400;
      res.end("Invalid JSON");
      return;
    }

    const notification = decodePubSubNotification(parsed);
    if (!notification) {
      res.statusCode = 400;
      res.end("Invalid notification payload");
      return;
    }

    res.statusCode = 200;
    res.end("OK");

    void params.onNotification(notification).catch(() => {
      // Errors handled by the sync engine
    });
  };
}
