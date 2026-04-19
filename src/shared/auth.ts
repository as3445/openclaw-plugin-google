import { GoogleAuth, OAuth2Client } from "google-auth-library";

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
];

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

// ---------------------------------------------------------------------------
// OAuth2 client creation
// ---------------------------------------------------------------------------

export type OAuth2Config = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

/**
 * Create an OAuth2Client pre-configured with a refresh token.
 * Suitable for per-user access to Google APIs.
 */
export function createOAuth2Client(config: OAuth2Config): OAuth2Client {
  const client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });
  client.setCredentials({ refresh_token: config.refreshToken });
  return client;
}

// ---------------------------------------------------------------------------
// Service account / ADC auth
// ---------------------------------------------------------------------------

export type ServiceAccountConfig = {
  keyFile?: string;
  credentials?: Record<string, string>;
  scopes?: string[];
};

/**
 * Create a GoogleAuth instance for service account or Application Default Credentials.
 */
export function createServiceAccountAuth(config: ServiceAccountConfig): GoogleAuth {
  return new GoogleAuth({
    ...(config.keyFile ? { keyFile: config.keyFile } : {}),
    ...(config.credentials ? { credentials: config.credentials } : {}),
    scopes: config.scopes,
  });
}

// ---------------------------------------------------------------------------
// Token retrieval
// ---------------------------------------------------------------------------

/**
 * Obtain an access token string from either an OAuth2Client or GoogleAuth instance.
 * Handles token refresh automatically.
 *
 * Callers should clear their auth cache on failure so the next attempt can
 * rebuild credentials (e.g. after token revocation or credential rotation).
 */
export async function getAccessToken(auth: OAuth2Client | GoogleAuth): Promise<string> {
  if (auth instanceof OAuth2Client) {
    const { token } = await auth.getAccessToken();
    if (!token) {
      throw new Error("Missing access token from OAuth2 client");
    }
    return token;
  }

  const client = await auth.getClient();
  const access = await client.getAccessToken();
  const token = typeof access === "string" ? access : access?.token;
  if (!token) {
    throw new Error("Missing access token from service account");
  }
  return token;
}
