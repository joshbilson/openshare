import { describe, expect, it, vi } from "vitest";
import type { HttpClient } from "./http";
import { parseYouTubeDataSearch, searchYouTubeData } from "./youtube-data";
import { createYouTubeAdapter } from "./youtube";

const SAMPLE = {
  items: [
    {
      id: { kind: "youtube#video", videoId: "vid123" },
      snippet: { title: "Bohemian Rhapsody", channelTitle: "Queen - Topic" },
    },
    {
      id: { kind: "youtube#channel", channelId: "chan1" },
      snippet: { title: "Queen Official", channelTitle: "Queen" },
    },
    {
      id: { kind: "youtube#video", videoId: "vid456" },
      snippet: { title: "Under Pressure", channelTitle: "Queen" },
    },
  ],
};

describe("parseYouTubeDataSearch", () => {
  it("keeps only video results and strips the ' - Topic' channel suffix", () => {
    const candidates = parseYouTubeDataSearch(SAMPLE);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      title: "Bohemian Rhapsody",
      artists: ["Queen"],
      ytVideoId: "vid123",
      platform: "youtubeMusic",
      url: "https://music.youtube.com/watch?v=vid123",
    });
    expect(candidates[1].ytVideoId).toBe("vid456");
  });

  it("returns nothing for an empty response", () => {
    expect(parseYouTubeDataSearch({})).toEqual([]);
  });
});

describe("searchYouTubeData", () => {
  it("requests the Data API search endpoint with the key and query", async () => {
    let requestedUrl = "";
    const http: HttpClient = {
      getJson: vi.fn(async (url: string) => {
        requestedUrl = url;
        return SAMPLE as unknown;
      }) as HttpClient["getJson"],
      getText: vi.fn(),
      postJson: vi.fn(),
    };

    const out = await searchYouTubeData("Queen Bohemian", {
      apiKey: "KEY123",
      http,
    });
    expect(out).toHaveLength(2);
    expect(requestedUrl).toContain("googleapis.com/youtube/v3/search");
    expect(requestedUrl).toContain("key=KEY123");
    expect(requestedUrl).toContain("q=Queen+Bohemian");
    expect(requestedUrl).toContain("type=video");
  });
});

describe("createYouTubeAdapter Data API fallback", () => {
  it("falls back to the Data API when InnerTube returns no candidates", async () => {
    const http: HttpClient = {
      // InnerTube search → empty payload (no renderers).
      postJson: vi.fn(async () => ({})) as HttpClient["postJson"],
      getJson: vi.fn(async () => SAMPLE as unknown) as HttpClient["getJson"],
      getText: vi.fn(),
    };
    const bundle = createYouTubeAdapter({ http, dataApiKey: "KEY123" });
    const candidates = await bundle.destination.search("Queen Bohemian");
    expect(candidates.map((c) => c.ytVideoId)).toEqual(["vid123", "vid456"]);
    expect(http.getJson).toHaveBeenCalledTimes(1);
  });

  it("does NOT call the Data API when InnerTube succeeds", async () => {
    const innerTube = {
      contents: {
        musicResponsiveListItemRenderer: {
          flexColumns: [
            {
              musicResponsiveListItemFlexColumnRenderer: {
                text: { runs: [{ text: "Song A" }] },
              },
            },
          ],
          playlistItemData: { videoId: "innertubeVid" },
        },
      },
    };
    const http: HttpClient = {
      postJson: vi.fn(async () => innerTube as unknown) as HttpClient["postJson"],
      getJson: vi.fn(async () => SAMPLE as unknown) as HttpClient["getJson"],
      getText: vi.fn(),
    };
    const bundle = createYouTubeAdapter({ http, dataApiKey: "KEY123" });
    const candidates = await bundle.destination.search("Song A");
    expect(candidates[0].ytVideoId).toBe("innertubeVid");
    expect(http.getJson).not.toHaveBeenCalled();
  });

  it("falls back when InnerTube throws", async () => {
    const http: HttpClient = {
      postJson: vi.fn(async () => {
        throw new Error("InnerTube blocked");
      }) as HttpClient["postJson"],
      getJson: vi.fn(async () => SAMPLE as unknown) as HttpClient["getJson"],
      getText: vi.fn(),
    };
    const bundle = createYouTubeAdapter({ http, dataApiKey: "KEY123" });
    const candidates = await bundle.destination.search("Queen Bohemian");
    expect(candidates.map((c) => c.ytVideoId)).toEqual(["vid123", "vid456"]);
  });

  it("re-throws InnerTube errors when no Data API key is set", async () => {
    const http: HttpClient = {
      postJson: vi.fn(async () => {
        throw new Error("InnerTube blocked");
      }) as HttpClient["postJson"],
      getJson: vi.fn(),
      getText: vi.fn(),
    };
    const bundle = createYouTubeAdapter({ http });
    await expect(bundle.destination.search("x")).rejects.toThrow(
      "InnerTube blocked",
    );
  });
});
