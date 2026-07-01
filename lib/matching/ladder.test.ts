import { describe, expect, it, vi } from "vitest";
import type { DestinationSearch } from "../contract/adapter";
import type { CanonicalTrack, SearchCandidate } from "../contract/types";
import { resolveTrack } from "./ladder";

const redbone: CanonicalTrack = {
  isrc: "USQX91601263",
  title: "Redbone",
  artists: ["Childish Gambino"],
  album: "Awaken, My Love!",
  durationMs: 326933,
  position: 0,
};

function candidate(partial: Partial<SearchCandidate>): SearchCandidate {
  return {
    title: "Redbone",
    artists: ["Childish Gambino"],
    album: "Awaken, My Love!",
    durationMs: 327000,
    platform: "deezer",
    url: "https://www.deezer.com/track/127190526",
    externalId: "127190526",
    ...partial,
  };
}

describe("resolveTrack", () => {
  it("returns confidence 1 via ISRC on an exact ISRC hit and skips text search", async () => {
    const search = vi.fn<DestinationSearch["search"]>().mockResolvedValue([]);
    const dest: DestinationSearch = {
      platform: "deezer",
      lookupByIsrc: vi.fn().mockResolvedValue([candidate({ isrc: "USQX91601263" })]),
      search,
    };

    const link = await resolveTrack(redbone, dest);
    expect(link).not.toBeNull();
    expect(link?.matchedVia).toBe("isrc");
    expect(link?.confidence).toBe(1);
    expect(search).not.toHaveBeenCalled();
  });

  it("falls through to text search when there is no ISRC lookup (e.g. YouTube)", async () => {
    const dest: DestinationSearch = {
      platform: "youtubeMusic",
      lookupByIsrc: null,
      search: vi.fn().mockResolvedValue([
        candidate({
          platform: "youtubeMusic",
          url: "https://music.youtube.com/watch?v=abc",
          externalId: "abc",
          ytVideoId: "abc",
          isrc: undefined,
        }),
      ]),
    };

    const link = await resolveTrack(redbone, dest);
    expect(link?.platform).toBe("youtubeMusic");
    expect(link?.ytVideoId).toBe("abc");
    expect(link?.matchedVia).toBe("metadata");
    expect(link?.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("falls through rungs until a query yields a confident match", async () => {
    const search = vi
      .fn<DestinationSearch["search"]>()
      .mockResolvedValueOnce([]) // metadata rung: nothing
      .mockResolvedValueOnce([candidate({})]); // artist rung: hit
    const dest: DestinationSearch = {
      platform: "deezer",
      lookupByIsrc: vi.fn().mockResolvedValue([]),
      search,
    };

    // Two artists ⇒ the metadata, artist, and fuzzy queries are all distinct,
    // so the artist rung is reached as its own search call.
    const twoArtists: CanonicalTrack = {
      ...redbone,
      isrc: undefined,
      artists: ["Childish Gambino", "Ludwig Göransson"],
    };
    const link = await resolveTrack(twoArtists, dest);
    expect(link).not.toBeNull();
    expect(link?.matchedVia).toBe("artist");
  });

  it("returns null when nothing clears the threshold", async () => {
    const dest: DestinationSearch = {
      platform: "deezer",
      lookupByIsrc: vi.fn().mockResolvedValue([]),
      search: vi
        .fn()
        .mockResolvedValue([candidate({ title: "Totally Different Song", artists: ["Nobody"] })]),
    };

    const link = await resolveTrack({ ...redbone, isrc: undefined }, dest);
    expect(link).toBeNull();
  });

  it("dedupes identical queries across rungs (single artist)", async () => {
    const search = vi.fn<DestinationSearch["search"]>().mockResolvedValue([]);
    const dest: DestinationSearch = {
      platform: "deezer",
      lookupByIsrc: null,
      search,
    };

    // "Redbone Childish Gambino" (metadata) == "Redbone Childish Gambino" (artist)
    // so only the metadata and fuzzy queries are distinct → 2 calls, not 3.
    await resolveTrack({ ...redbone, isrc: undefined }, dest);
    expect(search).toHaveBeenCalledTimes(2);
  });
});
