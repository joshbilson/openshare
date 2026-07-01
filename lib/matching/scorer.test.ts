import { describe, expect, it } from "vitest";
import {
  ACCEPT_THRESHOLD,
  areTracksSame,
  artistsSimilarity,
  lengthSimilarity,
  specialTermMismatch,
  trackSimilarity,
  type ScorableTrack,
} from "./scorer";

const redboneSpotify: ScorableTrack = {
  title: "Redbone",
  artists: ["Childish Gambino"],
  album: "Awaken, My Love!",
  durationMs: 326933,
};

describe("trackSimilarity", () => {
  it("scores an identical track at ~1", () => {
    expect(trackSimilarity(redboneSpotify, redboneSpotify)).toBeCloseTo(1, 5);
  });

  it("matches the same track across platforms with metadata noise", () => {
    const redboneYouTube: ScorableTrack = {
      title: "Redbone",
      artists: ["Childish Gambino"],
      album: "Awaken, My Love",
      durationMs: 327000,
    };
    expect(areTracksSame(redboneSpotify, redboneYouTube)).toBe(true);
  });

  it("matches when a featured artist lives in the title on one side", () => {
    const a: ScorableTrack = {
      title: "Sunflower (feat. Swae Lee)",
      artists: ["Post Malone"],
    };
    const b: ScorableTrack = {
      title: "Sunflower",
      artists: ["Post Malone", "Swae Lee"],
    };
    expect(trackSimilarity(a, b)).toBeGreaterThanOrEqual(ACCEPT_THRESHOLD);
  });

  it("rejects two completely different tracks", () => {
    const other: ScorableTrack = {
      title: "Bohemian Rhapsody",
      artists: ["Queen"],
      album: "A Night at the Opera",
      durationMs: 354000,
    };
    expect(areTracksSame(redboneSpotify, other)).toBe(false);
  });
});

describe("specialTermMismatch (guard)", () => {
  it("hard-rejects studio vs live", () => {
    const studio: ScorableTrack = { title: "Creep", artists: ["Radiohead"] };
    const live: ScorableTrack = { title: "Creep (Live)", artists: ["Radiohead"] };
    expect(specialTermMismatch(studio.title, live.title)).toBe(true);
    expect(trackSimilarity(studio, live)).toBe(0);
  });

  it("hard-rejects original vs remix", () => {
    const a: ScorableTrack = { title: "One More Time", artists: ["Daft Punk"] };
    const b: ScorableTrack = {
      title: "One More Time (Remix)",
      artists: ["Daft Punk"],
    };
    expect(trackSimilarity(a, b)).toBe(0);
  });

  it("does not reject when both share the term", () => {
    const a: ScorableTrack = { title: "Creep (Live)", artists: ["Radiohead"] };
    const b: ScorableTrack = { title: "Creep - Live", artists: ["Radiohead"] };
    expect(specialTermMismatch(a.title, b.title)).toBe(false);
    expect(areTracksSame(a, b)).toBe(true);
  });
});

describe("artistsSimilarity", () => {
  it("returns 0.5 when either side is empty", () => {
    expect(artistsSimilarity([], ["Drake"])).toBe(0.5);
    expect(artistsSimilarity(["Drake"], [])).toBe(0.5);
  });

  it("uses pairwise max across lists", () => {
    expect(artistsSimilarity(["Drake", "21 Savage"], ["21 savage"])).toBeCloseTo(
      1,
      5,
    );
  });
});

describe("lengthSimilarity", () => {
  it("is 1 for identical durations and ramps linearly to 0 at the tolerance", () => {
    expect(lengthSimilarity(200000, 200000)).toBe(1);
    expect(lengthSimilarity(200000, 202500)).toBeCloseTo(0.5, 5);
    expect(lengthSimilarity(200000, 205000)).toBe(0);
    expect(lengthSimilarity(200000, 210000)).toBe(0);
  });
});
