import { describe, expect, it } from "vitest";
import { createHostThrottle, mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("preserves input order", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }), 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});

describe("createHostThrottle", () => {
  it("spaces calls per host by the minimum interval", async () => {
    let clock = 0;
    const slept: number[] = [];
    const throttle = createHostThrottle({
      minIntervalMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });

    await throttle("spotify", async () => "a");
    await throttle("spotify", async () => "b");
    await throttle("spotify", async () => "c");
    // First call: no wait. Next two: wait ~100ms each.
    expect(slept).toEqual([100, 100]);
  });

  it("tracks hosts independently", async () => {
    let clock = 0;
    const slept: number[] = [];
    const throttle = createHostThrottle({
      minIntervalMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    await throttle("spotify", async () => 1);
    await throttle("deezer", async () => 2);
    // Different hosts → neither waits.
    expect(slept).toEqual([]);
  });
});
