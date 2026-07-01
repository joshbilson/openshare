import { describe, expect, it } from "vitest";
import type { HttpClient } from "./http";
import {
  createYouTubeAdapter,
  parseDurationToMs,
  parseInnerTubeSearch,
  parseMusicItem,
  type MusicListItemRenderer,
} from "./youtube";

const renderer: MusicListItemRenderer = {
  flexColumns: [
    {
      musicResponsiveListItemFlexColumnRenderer: {
        text: {
          runs: [
            {
              text: "Redbone",
              navigationEndpoint: { watchEndpoint: { videoId: "Kp7eSUU9oy8" } },
            },
          ],
        },
      },
    },
    {
      musicResponsiveListItemFlexColumnRenderer: {
        text: {
          runs: [
            {
              text: "Childish Gambino",
              navigationEndpoint: {
                browseEndpoint: {
                  browseId: "UCx",
                  browseEndpointContextSupportedConfigs: {
                    browseEndpointContextMusicConfig: {
                      pageType: "MUSIC_PAGE_TYPE_ARTIST",
                    },
                  },
                },
              },
            },
            { text: " • " },
            {
              text: "Awaken, My Love!",
              navigationEndpoint: {
                browseEndpoint: {
                  browseId: "MPREb",
                  browseEndpointContextSupportedConfigs: {
                    browseEndpointContextMusicConfig: {
                      pageType: "MUSIC_PAGE_TYPE_ALBUM",
                    },
                  },
                },
              },
            },
            { text: " • " },
            { text: "5:27" },
          ],
        },
      },
    },
  ],
  playlistItemData: { videoId: "Kp7eSUU9oy8" },
};

const searchResponse = {
  contents: {
    tabbedSearchResultsRenderer: {
      tabs: [
        {
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [
                  {
                    musicShelfRenderer: {
                      contents: [{ musicResponsiveListItemRenderer: renderer }],
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    },
  },
};

describe("parseDurationToMs", () => {
  it("parses mm:ss and h:mm:ss", () => {
    expect(parseDurationToMs("5:27")).toBe(327000);
    expect(parseDurationToMs("1:02:03")).toBe(3723000);
    expect(parseDurationToMs("nope")).toBeUndefined();
  });
});

describe("parseMusicItem", () => {
  it("extracts videoId, title, artists, album, duration", () => {
    expect(parseMusicItem(renderer)).toEqual({
      videoId: "Kp7eSUU9oy8",
      title: "Redbone",
      artists: ["Childish Gambino"],
      album: "Awaken, My Love!",
      durationMs: 327000,
    });
  });

  it("returns null without a videoId", () => {
    expect(parseMusicItem({ flexColumns: [] })).toBeNull();
  });
});

describe("parseInnerTubeSearch", () => {
  it("walks the nested response and returns candidates", () => {
    const candidates = parseInnerTubeSearch(searchResponse);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      platform: "youtubeMusic",
      ytVideoId: "Kp7eSUU9oy8",
      url: "https://music.youtube.com/watch?v=Kp7eSUU9oy8",
    });
  });
});

describe("YouTube destination", () => {
  it("has no ISRC lookup and searches via InnerTube", async () => {
    const http: HttpClient = {
      async getJson<T>(): Promise<T> {
        throw new Error("not used");
      },
      async getText() {
        return "";
      },
      async postJson<T>(url: string): Promise<T> {
        expect(url).toContain("/youtubei/v1/search");
        return searchResponse as T;
      },
    };
    const { destination } = createYouTubeAdapter({ http });
    expect(destination.lookupByIsrc).toBeNull();
    const candidates = await destination.search("redbone");
    expect(candidates[0].ytVideoId).toBe("Kp7eSUU9oy8");
  });
});
