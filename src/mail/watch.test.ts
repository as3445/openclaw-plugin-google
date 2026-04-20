import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { computeWatchRenewalDelay, scheduleWatchRenewal } from "./watch.js";
import type { GmailWatchState } from "./types.js";

describe("computeWatchRenewalDelay", () => {
  it("returns 0 for an already-expired watch", () => {
    const state: GmailWatchState = {
      historyId: "123",
      expiration: Date.now() - 1000,
      topicName: "projects/test/topics/gmail-push",
    };
    expect(computeWatchRenewalDelay(state)).toBe(0);
  });

  it("returns ~80% of remaining TTL for an active watch", () => {
    const state: GmailWatchState = {
      historyId: "123",
      expiration: Date.now() + 100_000,
      topicName: "projects/test/topics/gmail-push",
    };
    const delay = computeWatchRenewalDelay(state);
    expect(delay).toBeGreaterThan(79_000);
    expect(delay).toBeLessThanOrEqual(80_000);
  });
});

describe("scheduleWatchRenewal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls renewFn when the timer fires", async () => {
    const renewResult: GmailWatchState = {
      historyId: "456",
      expiration: Date.now() + 7 * 24 * 60 * 60 * 1000,
      topicName: "projects/test/topics/gmail-push",
    };

    let called = false;
    const handle = scheduleWatchRenewal(
      {
        historyId: "123",
        expiration: Date.now() + 10_000,
        topicName: "projects/test/topics/gmail-push",
      },
      async () => {
        called = true;
        return renewResult;
      },
    );

    await vi.advanceTimersByTimeAsync(8_000);
    expect(called).toBe(true);
    handle.clear();
  });

  it("retries after 5 minutes on renewFn failure (crash-loop fix)", async () => {
    let callCount = 0;
    const handle = scheduleWatchRenewal(
      {
        historyId: "123",
        expiration: Date.now() + 10_000,
        topicName: "projects/test/topics/gmail-push",
      },
      async () => {
        callCount++;
        throw new Error("invalid_grant: Token has been revoked");
      },
    );

    // First call at ~80% of TTL (8s)
    await vi.advanceTimersByTimeAsync(8_000);
    // Flush microtasks so .then rejection handler runs and schedules retry
    await vi.runOnlyPendingTimersAsync();
    expect(callCount).toBe(1);

    // Retry fires after 5 minutes
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await vi.runOnlyPendingTimersAsync();
    expect(callCount).toBe(2);

    handle.clear();
  });

  it("clear() stops all future timers", async () => {
    let callCount = 0;
    const handle = scheduleWatchRenewal(
      {
        historyId: "123",
        expiration: Date.now() + 10_000,
        topicName: "projects/test/topics/gmail-push",
      },
      async () => {
        callCount++;
        return {
          historyId: "456",
          expiration: Date.now() + 7 * 24 * 60 * 60 * 1000,
          topicName: "projects/test/topics/gmail-push",
        };
      },
    );

    handle.clear();
    await vi.advanceTimersByTimeAsync(100_000);
    expect(callCount).toBe(0);
  });

  it("immediately renews when watch is already expired", async () => {
    let callCount = 0;
    const handle = scheduleWatchRenewal(
      {
        historyId: "123",
        expiration: Date.now() - 5000,
        topicName: "projects/test/topics/gmail-push",
      },
      async () => {
        callCount++;
        return {
          historyId: "456",
          expiration: Date.now() + 7 * 24 * 60 * 60 * 1000,
          topicName: "projects/test/topics/gmail-push",
        };
      },
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(callCount).toBe(1);
    handle.clear();
  });
});
