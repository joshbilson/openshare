/**
 * OpenShare frozen contract — platform adapter interfaces.
 *
 * Deliberately different from playlistor: there is NO createPlaylist. Writing a
 * playlist into Spotify/Apple requires the recipient to log in, which we never do.
 * Destination output is produced by recipient assembly (web page, watch_videos URL,
 * JSON export) instead.
 */

import type {
  CanonicalPlaylist,
  CanonicalTrack,
  Platform,
  ResolvedLink,
  SearchCandidate,
} from "./types";

/** Reads a playlist from a source platform with no user login. */
export interface SourceAdapter {
  readonly platform: Platform;
  /** True if this adapter can read the given URL. */
  matchesUrl(url: string): boolean;
  /** Read the public playlist into a canonical snapshot. */
  readPlaylist(url: string): Promise<CanonicalPlaylist>;
}

/**
 * Resolves a canonical track to a confident link on a destination platform via
 * the ISRC-first fallback ladder + scorer. Returns null when nothing clears the
 * accept threshold.
 */
export interface DestinationAdapter {
  readonly platform: Platform;
  findTrack(track: CanonicalTrack): Promise<ResolvedLink | null>;
}

/**
 * Low-level search primitive every destination adapter exposes to the matching
 * engine. Given a query string, return scorable candidates. The engine owns the
 * ladder + scoring; the adapter owns the platform API call.
 */
export type SearchFn = (query: string) => Promise<SearchCandidate[]>;

/**
 * Optional direct ISRC lookup. Spotify / Apple / Deezer support it; YouTube does
 * not (returns null). When present, it is the first rung of the ladder.
 */
export type IsrcLookupFn = (isrc: string) => Promise<SearchCandidate[]>;

/** Everything a destination adapter needs to participate in resolution. */
export interface DestinationSearch {
  readonly platform: Platform;
  /** ISRC-based lookup, or null if the platform has no ISRC search. */
  readonly lookupByIsrc: IsrcLookupFn | null;
  /** Free-text search used for the metadata/artist/fuzzy rungs. */
  readonly search: SearchFn;
}
