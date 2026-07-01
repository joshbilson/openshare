import { describe, expect, it, vi } from "vitest";
import type { DestinationSearch } from "../contract/adapter";
import type { SearchCandidate, SourceTrack } from "../contract/types";
import {
  resolvePlaylist,
  resolveTrackLinks,
  type CachedLinks,
  type LinkCache,
  type TrackResolution,
} from "./resolve-playlist";

const redbone: SourceTrack = {
  isrc: "USQX91601263",
  title: "Redbone",
  artists: ["Childish Gambino"],
  album: "Awaken, My Love!",
  durationMs: 326933,
  position: 0,
  sourcePlatform: "spotify",
  sourceId: "sp0",
  sourceUrl: "https://open.spotify.com/track/sp0",
};
const obscure: SourceTrack = {
  isrc: "ZZZZ00000001",
  title: "Totally Obscure",
  artists: ["Nobody Knows"],
  position: 1,
  sourcePlatform: "spotify",
  sourceId: "sp1",
  sourceUrl: "https://open.spotify.com/track/sp1",
};

function deezerCandidate(): SearchCandidate {
  return {
    title: "Redbone",
    artists: ["Childish Gambino"],
    album: "Awaken, My Love!",
    durationMs: 327000,
    isrc: "USQX91601263",
    platform: "deezer",
    url: "https://www.deezer.com/track/127190526",
    externalId: "127190526",
  };
}
function youtubeCandidate(): SearchCandidate {
  return {
    title: "Redbone",
    artists: ["Childish Gambino"],
    durationMs: 327000,
    platform: "youtubeMusic",
    url: "https://music.youtube.com/watch?v=Kp7eSUU9oy8",
    externalId: "Kp7eSUU9oy8",
    ytVideoId: "Kp7eSUU9oy8",
  };
}

function makeDeezer(): DestinationSearch {
  return {
    platform: "deezer",
    lookupByIsrc: vi.fn(async (isrc: string) =>
      isrc === "USQX91601263" ? [deezerCandidate()] : [],
    ),
    search: vi.fn(async () => []),
  };
}
function makeYouTube(): DestinationSearch {
  return {
    platform: "youtubeMusic",
    lookupByIsrc: null,
    search: vi.fn(async (q: string) =>
      q.toLowerCase().includes("redbone") ? [youtubeCandidate()] : [],
    ),
  };
}

describe("resolveTrackLinks", () => {
  it("resolves a track across deezer (ISRC) and youtube (text)", async () => {
    const res = await resolveTrackLinks(redbone, [makeDeezer(), makeYouTube()]);
    expect(res.status).toBe("resolved");
    expect(res.links.spotify).toBe("https://open.spotify.com/track/sp0");
    expect(res.links.deezer).toContain("deezer.com");
    expect(res.links.youtubeMusic).toContain("watch?v=");
    expect(res.ytVideoId).toBe("Kp7eSUU9oy8");
    expect(res.confidence).toBe(1); // exact ISRC on deezer
  });

  it("marks a track missed when no platform matches", async () => {
    const res = await resolveTrackLinks(obscure, [makeDeezer(), makeYouTube()]);
    expect(res.status).toBe("missed");
    expect(Object.keys(res.links)).toEqual(["spotify"]); // only the source link
  });
});

describe("resolvePlaylist", () => {
  it("resolves all tracks and reports progress per track", async () => {
    const progress: TrackResolution[] = [];
    const resolutions = await resolvePlaylist(
      [redbone, obscure],
      [makeDeezer(), makeYouTube()],
      { onResolved: (r) => void progress.push(r) },
    );
    expect(resolutions).toHaveLength(2);
    expect(progress).toHaveLength(2);
    expect(resolutions[0].status).toBe("resolved");
    expect(resolutions[1].status).toBe("missed");
  });

  it("uses the ISRC cache to skip upstream calls on a repeat", async () => {
    const store = new Map<string, CachedLinks>();
    const cache: LinkCache = {
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => void store.set(k, v),
    };
    const deezer = makeDeezer();

    const again: SourceTrack = { ...redbone, position: 2, sourceId: "sp2" };
    await resolvePlaylist([redbone, again], [deezer], {
      concurrency: 1,
      cache,
    });

    // deezer ISRC lookup hit once; the second identical-ISRC track came from cache.
    expect(deezer.lookupByIsrc).toHaveBeenCalledTimes(1);
    expect(store.has("USQX91601263")).toBe(true);
  });
});
