import { describe, expect, it } from "vitest";
import {
  OPENSHARE_VERSION,
  parseOpenShareDoc,
  docToSourceTracks,
  type OpenShareDoc,
} from "./json-format";

const validDoc: OpenShareDoc = {
  openshareVersion: 1,
  name: "late night drive",
  createdAt: "2026-06-30T05:50:00Z",
  source: {
    platform: "spotify",
    url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  },
  tracks: [
    {
      title: "Redbone",
      artists: ["Childish Gambino"],
      album: "Awaken, My Love!",
      durationMs: 326933,
      isrc: "USQX91601263",
      links: {
        spotify: "https://open.spotify.com/track/0wXuerDYiBnERgIpbb3JBR",
        deezer: "https://www.deezer.com/track/127190526",
      },
    },
  ],
};

describe("parseOpenShareDoc", () => {
  it("accepts a valid document", () => {
    const result = parseOpenShareDoc(validDoc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.tracks).toHaveLength(1);
      expect(result.doc.tracks[0].isrc).toBe("USQX91601263");
    }
  });

  it("round-trips through JSON unchanged", () => {
    const serialized = JSON.stringify(validDoc);
    const result = parseOpenShareDoc(JSON.parse(serialized));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc).toEqual(validDoc);
    }
  });

  it("strips unknown fields rather than failing", () => {
    const withExtra = {
      ...validDoc,
      somethingNew: "ignored",
      tracks: [{ ...validDoc.tracks[0], futureField: 1 }],
    };
    const result = parseOpenShareDoc(withExtra);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("somethingNew" in result.doc).toBe(false);
      expect("futureField" in result.doc.tracks[0]).toBe(false);
    }
  });

  it("rejects an unsupported version", () => {
    const result = parseOpenShareDoc({ ...validDoc, openshareVersion: 2 });
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed source url", () => {
    const result = parseOpenShareDoc({
      ...validDoc,
      source: { platform: "spotify", url: "not-a-url" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid createdAt", () => {
    const result = parseOpenShareDoc({ ...validDoc, createdAt: "yesterday" });
    expect(result.ok).toBe(false);
  });

  it("exposes the current version constant", () => {
    expect(OPENSHARE_VERSION).toBe(1);
  });
});

describe("docToSourceTracks", () => {
  it("maps tracks to canonical source tracks with positions", () => {
    const tracks = docToSourceTracks(validDoc);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      title: "Redbone",
      artists: ["Childish Gambino"],
      isrc: "USQX91601263",
      position: 0,
      sourcePlatform: "spotify",
    });
    expect(tracks[0].sourceUrl).toBe(
      "https://open.spotify.com/track/0wXuerDYiBnERgIpbb3JBR",
    );
  });

  it("falls back to a synthetic sourceId when no ISRC is present", () => {
    const doc: OpenShareDoc = {
      ...validDoc,
      tracks: [{ title: "No ISRC", artists: [] }],
    };
    const tracks = docToSourceTracks(doc);
    expect(tracks[0].sourceId).toBe("spotify:0");
  });
});
