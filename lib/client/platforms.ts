import type { Platform } from "../contract/types";

export interface PlatformUI {
  label: string;
  short: string;
  /** Brand-ish accent used for link chips. */
  color: string;
  /** Single-glyph badge (avoids shipping icon assets). */
  glyph: string;
}

export const PLATFORM_UI: Record<Platform, PlatformUI> = {
  spotify: { label: "Spotify", short: "Spotify", color: "#1db954", glyph: "S" },
  appleMusic: { label: "Apple Music", short: "Apple", color: "#fa2d48", glyph: "A" },
  youtubeMusic: { label: "YouTube Music", short: "YT Music", color: "#ff0033", glyph: "Y" },
  deezer: { label: "Deezer", short: "Deezer", color: "#a238ff", glyph: "D" },
};

/** Stable display order for link chips. */
export const PLATFORM_ORDER: Platform[] = [
  "spotify",
  "appleMusic",
  "youtubeMusic",
  "deezer",
];

/** Build a fallback search URL for a track that didn't resolve on a platform. */
export function searchUrl(platform: Platform, query: string): string {
  const q = encodeURIComponent(query);
  switch (platform) {
    case "spotify":
      return `https://open.spotify.com/search/${q}`;
    case "appleMusic":
      return `https://music.apple.com/us/search?term=${q}`;
    case "youtubeMusic":
      return `https://music.youtube.com/search?q=${q}`;
    case "deezer":
      return `https://www.deezer.com/search/${q}`;
    default: {
      const _exhaustive: never = platform;
      return _exhaustive;
    }
  }
}
