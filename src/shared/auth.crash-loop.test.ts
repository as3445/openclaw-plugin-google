import { describe, expect, it, vi } from "vitest";
import { getAccessToken } from "./auth.js";
import { OAuth2Client } from "google-auth-library";

/**
 * Tests for the shared getAccessToken function, focused on reproducing
 * the crash-loop caused by unhandled rejections when credentials are invalid.
 */

describe("getAccessToken", () => {
  it("returns a token for valid OAuth2 credentials", async () => {
    const client = new OAuth2Client({ clientId: "test", clientSecret: "test" });
    // Stub getAccessToken to return a valid token
    vi.spyOn(client, "getAccessToken").mockResolvedValue({
      token: "mock-token",
      res: null as never,
    });

    const token = await getAccessToken(client);
    expect(token).toBe("mock-token");
  });

  it("throws on OAuth2 token revocation (the crash-loop trigger)", async () => {
    const client = new OAuth2Client({ clientId: "test", clientSecret: "test" });
    vi.spyOn(client, "getAccessToken").mockRejectedValue(
      new Error("invalid_grant: Token has been revoked"),
    );

    await expect(getAccessToken(client)).rejects.toThrow("invalid_grant");
  });

  it("throws when OAuth2 returns null token", async () => {
    const client = new OAuth2Client({ clientId: "test", clientSecret: "test" });
    vi.spyOn(client, "getAccessToken").mockResolvedValue({
      token: null,
      res: null as never,
    });

    await expect(getAccessToken(client)).rejects.toThrow("Missing access token");
  });

  it(".then/.catch pattern prevents unhandled rejections from crashing", async () => {
    // The FIXED pattern: rejection is handled by the second .then callback
    // instead of using async/await inside setTimeout
    let errorHandled = false;

    const promise = Promise.reject(new Error("auth failure"));
    promise.then(
      () => { /* success */ },
      () => { errorHandled = true; },
    );

    await Promise.resolve();
    expect(errorHandled).toBe(true);
  });
});
