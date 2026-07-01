import { describe, expect, it } from "vitest";
import { buildOpenShareDoc, exportFilename } from "./export";
import { parseOpenShareDoc } from "../contract/json-format";

describe("buildOpenShareDoc", () => {
  it("produces a document that round-trips through the import parser", () => {
    const doc = buildOpenShareDoc({
      name: "Road Trip",
      sourcePlatform: "spotify",
      sourceUrl: "https://open.spotify.com/playlist/abc123",
      createdAt: "2026-06-30T00:00:00.000Z",
      tracks: [
        {
          title: "Midnight City",
          artists: ["M83"],
          album: "Hurry Up, We're Dreaming",
          durationMs: 240000,
          isrc: "USAT21100850",
          links: {
            spotify: "https://open.spotify.com/track/x",
            youtubeMusic: "https://music.youtube.com/watch?v=y",
          },
        },
      ],
    });

    expect(doc.openshareVersion).toBe(1);
    const parsed = parseOpenShareDoc(doc);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.name).toBe("Road Trip");
      expect(parsed.doc.tracks[0].links?.spotify).toContain("track/x");
    }
  });

  it("omits empty link maps so the schema stays clean", () => {
    const doc = buildOpenShareDoc({
      name: "Empty Links",
      sourcePlatform: "deezer",
      sourceUrl: "https://www.deezer.com/playlist/123",
      tracks: [{ title: "Solo", artists: ["Nobody"], links: {} }],
    });
    expect(doc.tracks[0].links).toBeUndefined();
    expect(parseOpenShareDoc(doc).ok).toBe(true);
  });

  it("defaults createdAt to a valid ISO timestamp", () => {
    const doc = buildOpenShareDoc({
      name: "Now",
      sourcePlatform: "appleMusic",
      sourceUrl: "https://music.apple.com/us/playlist/x/pl.123",
      tracks: [],
    });
    expect(parseOpenShareDoc(doc).ok).toBe(true);
  });
});

describe("exportFilename", () => {
  it("slugifies names and always ends in .json", () => {
    expect(exportFilename("Road Trip!! 2026")).toBe("openshare-road-trip-2026.json");
  });

  it("falls back to a default for empty names", () => {
    expect(exportFilename("")).toBe("openshare-playlist.json");
  });
});
