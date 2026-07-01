import { describe, expect, it } from "vitest";
import type { HttpClient } from "./http";
import {
  createDeezerAdapter,
  mapDeezerCandidate,
  type DeezerTrack,
} from "./deezer";

const sampleTrack: DeezerTrack = {
  id: 127190526,
  title: "Redbone",
  duration: 327,
  link: "https://www.deezer.com/track/127190526",
  preview: "https://cdns-preview.deezer.com/x.mp3",
  isrc: "USQX91601263",
  artist: { name: "Childish Gambino" },
  album: { title: "Awaken, My Love!" },
};

const playlistFixture = {
  id: 908622995,
  title: "Chill Vibes",
  picture_xl: "https://e-cdns-images.dzcdn.net/cover.jpg",
  nb_tracks: 3,
  creator: { name: "deezerfan" },
  tracks: {
    data: [sampleTrack, { ...sampleTrack, id: 2, title: "Track 2" }],
    next: "https://api.deezer.com/playlist/908622995/tracks?index=2",
  },
};
const pageFixture = {
  data: [{ ...sampleTrack, id: 3, title: "Track 3" }],
};
const searchFixture = { data: [sampleTrack] };

function fakeHttp(): HttpClient {
  return {
    async getJson<T>(url: string): Promise<T> {
      if (url.includes("/tracks?")) return pageFixture as T;
      if (url.includes("/track/isrc:")) return sampleTrack as T;
      if (url.includes("/search/track")) return searchFixture as T;
      if (url.includes("/playlist/")) return playlistFixture as T;
      throw new Error(`unexpected url ${url}`);
    },
    async getText() {
      throw new Error("not used");
    },
    async postJson<T>(): Promise<T> {
      throw new Error("not used");
    },
  };
}

describe("mapDeezerCandidate", () => {
  it("maps a Deezer track to a candidate (seconds → ms)", () => {
    expect(mapDeezerCandidate(sampleTrack)).toEqual({
      title: "Redbone",
      artists: ["Childish Gambino"],
      album: "Awaken, My Love!",
      durationMs: 327000,
      isrc: "USQX91601263",
      platform: "deezer",
      url: "https://www.deezer.com/track/127190526",
      externalId: "127190526",
      previewUrl: "https://cdns-preview.deezer.com/x.mp3",
    });
  });
});

describe("Deezer source adapter", () => {
  it("reads a playlist and follows pagination", async () => {
    const { source } = createDeezerAdapter(fakeHttp());
    const playlist = await source!.readPlaylist(
      "https://www.deezer.com/playlist/908622995",
    );
    expect(playlist.title).toBe("Chill Vibes");
    expect(playlist.ownerName).toBe("deezerfan");
    expect(playlist.tracks).toHaveLength(3);
    expect(playlist.tracks[2].title).toBe("Track 3");
    expect(playlist.tracks[0].position).toBe(0);
  });

  it("matchesUrl only for Deezer", () => {
    const { source } = createDeezerAdapter(fakeHttp());
    expect(source!.matchesUrl("https://www.deezer.com/playlist/1")).toBe(true);
    expect(source!.matchesUrl("https://open.spotify.com/playlist/x")).toBe(false);
  });
});

describe("Deezer destination adapter", () => {
  it("looks up by ISRC", async () => {
    const { destination } = createDeezerAdapter(fakeHttp());
    const candidates = await destination.lookupByIsrc!("USQX91601263");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].isrc).toBe("USQX91601263");
  });

  it("returns [] when ISRC lookup errors", async () => {
    const http: HttpClient = {
      async getJson<T>(): Promise<T> {
        return { error: { message: "no data" } } as T;
      },
      async getText() {
        return "";
      },
      async postJson<T>(): Promise<T> {
        return {} as T;
      },
    };
    const { destination } = createDeezerAdapter(http);
    expect(await destination.lookupByIsrc!("BADISRC")).toEqual([]);
  });

  it("searches by text", async () => {
    const { destination } = createDeezerAdapter(fakeHttp());
    const candidates = await destination.search("redbone childish gambino");
    expect(candidates[0].platform).toBe("deezer");
  });
});
