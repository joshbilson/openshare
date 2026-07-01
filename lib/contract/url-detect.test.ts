import { describe, expect, it } from "vitest";
import { detectSource, detectPlatform } from "./url-detect";

describe("detectSource", () => {
  it("detects a standard Spotify playlist URL", () => {
    const r = detectSource(
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc",
    );
    expect(r).toEqual({
      platform: "spotify",
      id: "37i9dQZF1DXcBWIGoYBM5M",
      normalizedUrl: "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
    });
  });

  it("detects a Spotify URL with an intl locale prefix", () => {
    const r = detectSource(
      "https://open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M",
    );
    expect(r?.id).toBe("37i9dQZF1DXcBWIGoYBM5M");
    expect(r?.platform).toBe("spotify");
  });

  it("detects the spotify: URI form", () => {
    const r = detectSource("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M");
    expect(r?.platform).toBe("spotify");
    expect(r?.normalizedUrl).toBe("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M");
  });

  it("dedupes URL variants to the same normalized key", () => {
    const a = detectSource("open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
    const b = detectSource("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M");
    expect(a?.normalizedUrl).toBe(b?.normalizedUrl);
  });

  it("detects an Apple Music catalog playlist with a slug", () => {
    const r = detectSource(
      "https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb",
    );
    expect(r?.platform).toBe("appleMusic");
    expect(r?.id).toBe("pl.f4d106fed2bd41149aaacabb233eb5eb");
  });

  it("detects an Apple Music user playlist (pl.u-)", () => {
    const r = detectSource(
      "https://music.apple.com/us/playlist/my-mix/pl.u-2aoZ7gd8tbXMo",
    );
    expect(r?.platform).toBe("appleMusic");
    expect(r?.id).toBe("pl.u-2aoZ7gd8tbXMo");
  });

  it("detects a YouTube Music playlist", () => {
    const r = detectSource(
      "https://music.youtube.com/playlist?list=PLabc123def456",
    );
    expect(r?.platform).toBe("youtubeMusic");
    expect(r?.id).toBe("PLabc123def456");
  });

  it("detects a list= param on a youtube watch URL", () => {
    const r = detectSource(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz",
    );
    expect(r?.platform).toBe("youtubeMusic");
    expect(r?.id).toBe("PLxyz");
  });

  it("detects a Deezer playlist with a language segment", () => {
    const r = detectSource("https://www.deezer.com/en/playlist/908622995");
    expect(r?.platform).toBe("deezer");
    expect(r?.id).toBe("908622995");
  });

  it("returns null for unsupported or unparseable input", () => {
    expect(detectSource("https://example.com/foo")).toBeNull();
    expect(detectSource("not a url")).toBeNull();
    expect(detectSource("")).toBeNull();
    expect(detectSource("https://open.spotify.com/track/abc")).toBeNull();
  });

  it("detectPlatform is a thin wrapper", () => {
    expect(detectPlatform("https://www.deezer.com/playlist/123")).toBe("deezer");
    expect(detectPlatform("nope")).toBeNull();
  });
});
