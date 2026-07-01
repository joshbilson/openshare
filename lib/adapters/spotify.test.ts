import { describe, expect, it, vi } from "vitest";
import type { FetchLike, HttpClient } from "./http";
import {
  createSpotifyAdapter,
  createSpotifyTokenProvider,
  mapSpotifyCandidate,
  parseSpotifyEmbed,
} from "./spotify";

const apiTrack = {
  id: "0wXuerDYiBnERgIpbb3JBR",
  name: "Redbone",
  duration_ms: 326933,
  preview_url: "https://p.scdn.co/mp3-preview/x",
  external_urls: { spotify: "https://open.spotify.com/track/0wXuerDYiBnERgIpbb3JBR" },
  external_ids: { isrc: "USQX91601263" },
  album: { name: "Awaken, My Love!" },
  artists: [{ name: "Childish Gambino" }],
};

const embedHtml = `<!doctype html><html><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      state: {
        data: {
          entity: {
            name: "Late Night Drive",
            subtitle: "joshua",
            coverArt: { sources: [{ url: "https://i.scdn.co/image/abc" }] },
            trackList: [
              {
                uri: "spotify:track:0wXuerDYiBnERgIpbb3JBR",
                title: "Redbone",
                subtitle: "Childish Gambino",
                duration: 326933,
              },
              {
                uri: "spotify:track:track2id",
                title: "Time",
                subtitle: "Pink Floyd, David Gilmour",
                duration: 413000,
              },
            ],
          },
        },
      },
    },
  },
})}</script></body></html>`;

describe("mapSpotifyCandidate", () => {
  it("maps an API track including ISRC", () => {
    const c = mapSpotifyCandidate(apiTrack);
    expect(c).toMatchObject({
      title: "Redbone",
      artists: ["Childish Gambino"],
      isrc: "USQX91601263",
      platform: "spotify",
      durationMs: 326933,
      externalId: "0wXuerDYiBnERgIpbb3JBR",
    });
  });
});

describe("parseSpotifyEmbed", () => {
  it("extracts the tracklist from __NEXT_DATA__", () => {
    const parsed = parseSpotifyEmbed(embedHtml);
    expect(parsed.title).toBe("Late Night Drive");
    expect(parsed.coverUrl).toBe("https://i.scdn.co/image/abc");
    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks[0]).toMatchObject({
      id: "0wXuerDYiBnERgIpbb3JBR",
      title: "Redbone",
      artists: ["Childish Gambino"],
      durationMs: 326933,
    });
    expect(parsed.tracks[1].artists).toEqual(["Pink Floyd", "David Gilmour"]);
  });

  it("throws when __NEXT_DATA__ is missing", () => {
    expect(() => parseSpotifyEmbed("<html></html>")).toThrow();
  });
});

describe("Spotify source read", () => {
  it("scrapes the embed and enriches with the catalog API", async () => {
    const http: HttpClient = {
      async getJson<T>(url: string): Promise<T> {
        if (url.includes("/tracks?ids=")) {
          return { tracks: [apiTrack] } as T;
        }
        throw new Error(`unexpected json url ${url}`);
      },
      async getText(url: string) {
        expect(url).toContain("/embed/playlist/");
        return embedHtml;
      },
      async postJson<T>(): Promise<T> {
        throw new Error("not used");
      },
    };
    const { source } = createSpotifyAdapter({
      http,
      getAccessToken: async () => "test-token",
    });
    const playlist = await source!.readPlaylist(
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    );
    expect(playlist.title).toBe("Late Night Drive");
    expect(playlist.tracks).toHaveLength(2);
    // Enriched track gained ISRC + album from the catalog API.
    expect(playlist.tracks[0].isrc).toBe("USQX91601263");
    expect(playlist.tracks[0].album).toBe("Awaken, My Love!");
  });
});

describe("Spotify destination", () => {
  it("searches by ISRC and by text using the bearer token", async () => {
    const getJson = vi.fn(async (url: string) => {
      expect(url).toContain("market=US");
      return { tracks: { items: [apiTrack] } };
    });
    const http = {
      getJson,
      getText: async () => "",
      postJson: async () => ({}),
    } as unknown as HttpClient;

    const { destination } = createSpotifyAdapter({
      http,
      getAccessToken: async () => "test-token",
    });
    expect((await destination.lookupByIsrc!("USQX91601263"))[0].isrc).toBe(
      "USQX91601263",
    );
    expect((await destination.search("redbone"))[0].platform).toBe("spotify");
  });
});

describe("createSpotifyTokenProvider", () => {
  it("requests and caches a client-credentials token", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "abc123", expires_in: 3600 }), {
        status: 200,
      }),
    );
    const getToken = createSpotifyTokenProvider({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchImpl,
    });
    expect(await getToken()).toBe("abc123");
    expect(await getToken()).toBe("abc123");
    // Cached: only one network call.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
