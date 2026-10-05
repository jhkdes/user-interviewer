import { describe, expect, it, vi } from "vitest";
import { createCompletedCountCache } from "../completed-count-cache";

function setup(ttlMs = 60_000) {
  let clock = 1_000_000;
  const cache = createCompletedCountCache({ ttlMs, now: () => clock });
  return {
    cache,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("createCompletedCountCache", () => {
  it("looks the count up once and serves it from memory until the TTL passes", async () => {
    const { cache, advance } = setup();
    const load = vi.fn().mockResolvedValue(12);

    expect(await cache.get("study-1", load)).toBe(12);
    advance(59_999);
    expect(await cache.get("study-1", load)).toBe(12);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("looks it up again, and picks up a new number, once the TTL has passed", async () => {
    const { cache, advance } = setup();
    const load = vi.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(13);

    expect(await cache.get("study-1", load)).toBe(12);
    advance(60_000);
    expect(await cache.get("study-1", load)).toBe(13);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps each study's count separate", async () => {
    const { cache } = setup();

    expect(await cache.get("study-1", async () => 1)).toBe(1);
    expect(await cache.get("study-2", async () => 2)).toBe(2);
    expect(await cache.get("study-1", async () => 99)).toBe(1);
  });

  it("remembers a count of zero rather than treating it as missing", async () => {
    const { cache } = setup();
    const load = vi.fn().mockResolvedValue(0);

    expect(await cache.get("study-1", load)).toBe(0);
    expect(await cache.get("study-1", load)).toBe(0);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares one lookup between requests that arrive while it is running", async () => {
    const { cache } = setup();
    let finish: (count: number) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );

    const first = cache.get("study-1", load);
    const second = cache.get("study-1", load);
    const third = cache.get("study-1", load);
    finish(7);

    expect(await Promise.all([first, second, third])).toEqual([7, 7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not remember a study that wasn't found, so the next request asks again", async () => {
    const { cache } = setup();
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(5);

    expect(await cache.get("study-1", load)).toBeNull();
    expect(await cache.get("study-1", load)).toBe(5);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not remember a failure, and passes it on to every request waiting on it", async () => {
    const { cache } = setup();
    let fail: (error: Error) => void = () => {};
    const failing = vi.fn(
      () =>
        new Promise<number>((_, reject) => {
          fail = reject;
        }),
    );

    const first = cache.get("study-1", failing);
    const second = cache.get("study-1", failing);
    fail(new Error("db down"));
    await expect(first).rejects.toThrow("db down");
    await expect(second).rejects.toThrow("db down");

    expect(await cache.get("study-1", async () => 3)).toBe(3);
  });
});
