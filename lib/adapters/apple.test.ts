import { describe, expect, it } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import type { HttpClient } from "./http";
import {
  createAppleAdapter,
  createAppleTokenProvider,
  extractAppleStorefront,
  mapAppleCandidate,
} from "./apple";

const song = {
  id: "1450330685",
  attributes: {
    name: "Redbone",
    artistName: "Childish Gambino",
    albumName: "Awaken, My Love!",
    durationInMillis: 326933,
    isrc: "USQX91601263",
    url: "https://music.apple.com/us/album/redbone/1450330684?i=1450330685",
    previews: [{ url: "https://audio-ssl.itunes.apple.com/x.m4a" }],
  },
};

describe("mapAppleCandidate / storefront", () => {
  it("maps an Apple song to a candidate", () => {
    expect(mapAppleCandidate(song)).toMatchObject({
      title: "Redbone",
      artists: ["Childish Gambino"],
      album: "Awaken, My Love!",
      durationMs: 326933,
      isrc: "USQX91601263",
      platform: "appleMusic",
      externalId: "1450330685",
    });
  });

  it("extracts the storefront from a URL", () => {
    expect(
      extractAppleStorefront("https://music.apple.com/gb/playlist/x/pl.123"),
    ).toBe("gb");
    expect(extractAppleStorefront("https://music.apple.com/playlist/x")).toBe("us");
  });
});

describe("Apple source + destination", () => {
  const http: HttpClient = {
    async getJson<T>(url: string): Promise<T> {
      if (url.includes("/playlists/")) {
        return {
          data: [
            {
              attributes: { name: "Editor's Picks", curatorName: "Apple Music" },
              relationships: { tracks: { data: [song], next: undefined } },
            },
          ],
        } as T;
      }
      if (url.includes("filter[isrc]")) return { data: [song] } as T;
      if (url.includes("/search")) {
        return { results: { songs: { data: [song] } } } as T;
      }
      throw new Error(`unexpected url ${url}`);
    },
    async getText() {
      return "";
    },
    async postJson<T>(): Promise<T> {
      return {} as T;
    },
  };

  it("reads a catalog playlist", async () => {
    const { source } = createAppleAdapter({
      http,
      getDeveloperToken: async () => "dev-token",
    });
    const playlist = await source!.readPlaylist(
      "https://music.apple.com/us/playlist/editors-picks/pl.abc123",
    );
    expect(playlist.title).toBe("Editor's Picks");
    expect(playlist.tracks[0].isrc).toBe("USQX91601263");
  });

  it("resolves by ISRC and by text", async () => {
    const { destination } = createAppleAdapter({
      http,
      getDeveloperToken: async () => "dev-token",
    });
    expect((await destination.lookupByIsrc!("USQX91601263"))[0].externalId).toBe(
      "1450330685",
    );
    expect((await destination.search("redbone"))[0].platform).toBe("appleMusic");
  });
});

describe("createAppleTokenProvider", () => {
  it("signs and caches an ES256 developer token", async () => {
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const getToken = createAppleTokenProvider({
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKey: pem,
    });
    const token = await getToken();
    expect(token.split(".")).toHaveLength(3);
    // Cached on second call.
    expect(await getToken()).toBe(token);
  });
});
