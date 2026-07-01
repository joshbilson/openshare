/**
 * OpenShare frozen contract — canonical domain types.
 *
 * Everything (matching engine, adapters, Convex functions, UI) imports these.
 * Do not fork or redefine them in a slice; if the contract is wrong, flag it.
 */

export const PLATFORMS = [
  "spotify",
  "appleMusic",
  "youtubeMusic",
  "deezer",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/** Human-facing platform labels. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  spotify: "Spotify",
  appleMusic: "Apple Music",
  youtubeMusic: "YouTube Music",
  deezer: "Deezer",
};

/**
 * The minimal track shape the matching engine scores against. Intentionally has
 * no I/O or platform-specific fields — pure data.
 */
export interface CanonicalTrack {
  isrc?: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  /** 0-based position within its playlist. */
  position: number;
}

/** A track as read from a source platform (canonical track + provenance). */
export interface SourceTrack extends CanonicalTrack {
  sourcePlatform: Platform;
  sourceId: string;
  sourceUrl?: string;
}

/** A playlist as read from a source platform. */
export interface CanonicalPlaylist {
  title: string;
  ownerName?: string;
  coverUrl?: string;
  sourcePlatform: Platform;
  sourceUrl: string;
  sourceId: string;
  tracks: SourceTrack[];
}

/** Which rung of the fallback ladder produced a match. */
export type MatchStrategy = "isrc" | "metadata" | "artist" | "fuzzy";

/**
 * A candidate returned by a destination search, before/after scoring. Carries
 * both scoring fields and the link details needed to build a ResolvedLink.
 */
export interface SearchCandidate {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
  platform: Platform;
  /** Canonical share/deep-link URL on the platform. */
  url: string;
  /** Platform-native track id. */
  externalId: string;
  /** YouTube videoId, used to build watch_videos save links. */
  ytVideoId?: string;
  previewUrl?: string;
}

/** A confident cross-platform match for one source track on one platform. */
export interface ResolvedLink {
  platform: Platform;
  url: string;
  externalId: string;
  ytVideoId?: string;
  previewUrl?: string;
  isrc?: string;
  /** Similarity in [0,1]; 1 for an exact ISRC hit. */
  confidence: number;
  matchedVia: MatchStrategy;
}

/** Partial per-platform link map (used in JSON export and the recipient page). */
export type PlatformLinks = Partial<Record<Platform, string>>;
