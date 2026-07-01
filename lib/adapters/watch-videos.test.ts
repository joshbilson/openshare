import { describe, expect, it, vi } from "vitest";
import {
  buildWatchVideosUrl,
  chunk,
  musicPlaylistUrl,
  musicWatchUrl,
  parseTempPlaylistId,
  resolveMusicPlaylistUrl,
} from "./watch-videos";

describe("buildWatchVideosUrl", () => {
  it("joins video ids into a www.youtube.com watch_videos URL", () => {
    expect(buildWatchVideosUrl(["a", "b", "c"])).toBe(
      "https://www.youtube.com/watch_videos?video_ids=a,b,c",
    );
  });
});

describe("musicPlaylistUrl", () => {
  it("builds a music.youtube.com playlist URL from a list id", () => {
    expect(musicPlaylistUrl("TLGG123")).toBe(
      "https://music.youtube.com/playlist?list=TLGG123",
    );
  });
});

describe("musicWatchUrl", () => {
  it("builds a music.youtube.com watch URL with the list as the queue", () => {
    expect(musicWatchUrl("vid1", "TLGG123")).toBe(
      "https://music.youtube.com/watch?v=vid1&list=TLGG123",
    );
  });
});

describe("parseTempPlaylistId", () => {
  it("extracts list from a full watch URL", () => {
    expect(
      parseTempPlaylistId("https://www.youtube.com/watch?v=abc&list=TLGGxyz"),
    ).toBe("TLGGxyz");
  });

  it("extracts list from a bare relative Location header", () => {
    expect(parseTempPlaylistId("/watch?v=abc&list=TLGGxyz")).toBe("TLGGxyz");
  });

  it("returns null when no list param is present", () => {
    expect(parseTempPlaylistId("https://www.youtube.com/watch?v=abc")).toBeNull();
    expect(parseTempPlaylistId("")).toBeNull();
  });
});

describe("resolveMusicPlaylistUrl", () => {
  it("resolves a music playlist URL from a manual-redirect Location header", async () => {
    const fetchImpl = vi.fn(async () => ({
      headers: {
        get: (k: string) =>
          k === "location"
            ? "https://www.youtube.com/watch?v=a&list=TLGG_MANUAL"
            : null,
      },
      url: "",
    })) as unknown as typeof fetch;

    const out = await resolveMusicPlaylistUrl(["a", "b"], fetchImpl);
    expect(out).toBe("https://music.youtube.com/watch?v=a&list=TLGG_MANUAL");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to the resolved URL when there is no Location header", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.redirect === "manual") {
        return { headers: { get: () => null }, url: "" } as unknown as Response;
      }
      return {
        headers: { get: () => null },
        url: "https://www.youtube.com/watch?v=a&list=TLGG_FOLLOW",
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const out = await resolveMusicPlaylistUrl(["a", "b"], fetchImpl);
    expect(out).toBe("https://music.youtube.com/watch?v=a&list=TLGG_FOLLOW");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns null for an empty id list without calling fetch", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await resolveMusicPlaylistUrl(["", "  "], fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caps the request at the guest limit", async () => {
    const ids = Array.from({ length: 80 }, (_, i) => `v${i}`);
    let requested = "";
    const fetchImpl = vi.fn(async (url: string) => {
      requested = url;
      return {
        headers: {
          get: (k: string) =>
            k === "location" ? "/watch?v=v0&list=TLGG_CAP" : null,
        },
        url: "",
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await resolveMusicPlaylistUrl(ids, fetchImpl);
    const count = requested.split("video_ids=")[1].split(",").length;
    expect(count).toBe(50);
  });
});

describe("chunk", () => {
  it("splits into fixed-size groups", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
