import { createHash } from "node:crypto";
import {
  createOAuth2Client,
  createServiceAccountAuth,
  getAccessToken,
  CALENDAR_SCOPES,
} from "../shared/auth.js";
import type { GoogleAuth, OAuth2Client } from "google-auth-library";
import type { GoogleCalendarAccountConfig } from "./types.js";

/** Size-capped to prevent unbounded growth in long-running deployments. */
const MAX_AUTH_CACHE_SIZE = 32;

type AuthInstance = OAuth2Client | GoogleAuth;
const authCache = new Map<string, { key: string; auth: AuthInstance }>();

function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function buildAuthKey(account: GoogleCalendarAccountConfig): string {
  if (account.serviceAccountFile) {
    return `sa-file:${account.serviceAccountFile}`;
  }
  if (account.serviceAccountCredentials) {
    const hash = JSON.stringify(account.serviceAccountCredentials);
    return `sa-inline:${hashString(hash)}`;
  }
  if (account.credentialsFile) {
    return `file:${account.credentialsFile}`;
  }
  if (account.credentials) {
    return `inline:${account.credentials.client_id}`;
  }
  return "none";
}

function evictOldest(): void {
  if (authCache.size > MAX_AUTH_CACHE_SIZE) {
    const oldest = authCache.keys().next().value;
    if (oldest !== undefined) {
      authCache.delete(oldest);
    }
  }
}

/**
 * Returns an authenticated client suitable for Calendar API calls.
 *
 * Priority:
 * 1. User OAuth 2.0 credentials (client_id + client_secret + refresh_token)
 * 2. Service account (key file or inline JSON)
 * 3. Application Default Credentials
 */
function getAuthInstance(account: GoogleCalendarAccountConfig): AuthInstance {
  const key = buildAuthKey(account);
  const cached = authCache.get(account.accountId);
  if (cached && cached.key === key) {
    return cached.auth;
  }

  if (account.credentials) {
    const auth = createOAuth2Client({
      clientId: account.credentials.client_id,
      clientSecret: account.credentials.client_secret,
      refreshToken: account.credentials.refresh_token,
    });
    authCache.set(account.accountId, { key, auth });
    evictOldest();
    return auth;
  }

  if (account.serviceAccountFile) {
    const auth = createServiceAccountAuth({
      keyFile: account.serviceAccountFile,
      scopes: CALENDAR_SCOPES,
    });
    authCache.set(account.accountId, { key, auth });
    evictOldest();
    return auth;
  }

  if (account.serviceAccountCredentials) {
    const auth = createServiceAccountAuth({
      credentials: account.serviceAccountCredentials as Record<string, string>,
      scopes: CALENDAR_SCOPES,
    });
    authCache.set(account.accountId, { key, auth });
    evictOldest();
    return auth;
  }

  if (account.credentialsFile) {
    const auth = createServiceAccountAuth({
      keyFile: account.credentialsFile,
      scopes: CALENDAR_SCOPES,
    });
    authCache.set(account.accountId, { key, auth });
    evictOldest();
    return auth;
  }

  const auth = createServiceAccountAuth({ scopes: CALENDAR_SCOPES });
  authCache.set(account.accountId, { key, auth });
  evictOldest();
  return auth;
}

/** Obtain an access token string for Calendar API requests. */
export async function getCalendarAccessToken(
  account: GoogleCalendarAccountConfig,
): Promise<string> {
  const auth = getAuthInstance(account);
  return getAccessToken(auth);
}

/** Clear the auth cache entry for a given account. Useful after credential rotation. */
export function clearAuthCache(accountId: string): void {
  authCache.delete(accountId);
}

export { CALENDAR_SCOPES as GOOGLE_CALENDAR_SCOPE } from "../shared/auth.js";
