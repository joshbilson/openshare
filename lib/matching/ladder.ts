/**
 * ISRC-first search fallback ladder.
 *
 * For one canonical track and one destination platform, try, in order:
 *   1. ISRC lookup (exact → confidence 1).
 *   2. Full metadata: clean name + all artists.
 *   3. Primary artist: clean name + first artist.
 *   4. Fuzzy name only.
 * Each rung searches, picks the highest-similarity candidate, and accepts it if
 * it clears the threshold; otherwise it falls through. Returns null if nothing
 * clears the bar (the caller records it as a missed track).
 *
 * Pure orchestration over an injected `DestinationSearch` — no platform knowledge,
 * no network of its own, so it is fully unit-testable with fixtures.
 */

import type { DestinationSearch } from "../contract/adapter";
import type {
  CanonicalTrack,
  MatchStrategy,
  ResolvedLink,
  SearchCandidate,
} from "../contract/types";
import { parseTrackName } from "./parse-track-name";
import { ACCEPT_THRESHOLD, trackSimilarity } from "./scorer";

interface Scored {
  candidate: SearchCandidate;
  score: number;
}

function bestCandidate(
  track: CanonicalTrack,
  candidates: readonly SearchCandidate[],
): Scored | null {
  let best: Scored | null = null;
  for (const candidate of candidates) {
    const score = trackSimilarity(track, candidate);
    if (!best || score > best.score) best = { candidate, score };
  }
  return best;
}

function toLink(
  candidate: SearchCandidate,
  confidence: number,
  matchedVia: MatchStrategy,
): ResolvedLink {
  return {
    platform: candidate.platform,
    url: candidate.url,
    externalId: candidate.externalId,
    ytVideoId: candidate.ytVideoId,
    previewUrl: candidate.previewUrl,
    isrc: candidate.isrc,
    confidence,
    matchedVia,
  };
}

export interface ResolveOptions {
  threshold?: number;
}

export async function resolveTrack(
  track: CanonicalTrack,
  dest: DestinationSearch,
  options: ResolveOptions = {},
): Promise<ResolvedLink | null> {
  const threshold = options.threshold ?? ACCEPT_THRESHOLD;

  // Rung 1: ISRC.
  if (track.isrc && dest.lookupByIsrc) {
    const candidates = await dest.lookupByIsrc(track.isrc);
    if (candidates.length > 0) {
      const wanted = track.isrc.toUpperCase();
      const exact = candidates.find((c) => c.isrc?.toUpperCase() === wanted);
      if (exact) return toLink(exact, 1, "isrc");
      const best = bestCandidate(track, candidates);
      if (best && best.score >= threshold) {
        return toLink(best.candidate, best.score, "isrc");
      }
    }
  }

  // Rungs 2–4: text search with progressively looser queries.
  const parsed = parseTrackName(track.title);
  const clean = parsed.name || track.title;
  const firstArtist = track.artists[0] ?? "";
  const allArtists = track.artists.join(" ");

  const steps: Array<{ strategy: MatchStrategy; query: string }> = [
    { strategy: "metadata", query: `${clean} ${allArtists}` },
    { strategy: "artist", query: `${clean} ${firstArtist}` },
    { strategy: "fuzzy", query: clean },
  ];

  const tried = new Set<string>();
  for (const step of steps) {
    const query = step.query.replace(/\s+/g, " ").trim();
    if (!query || tried.has(query)) continue;
    tried.add(query);

    const candidates = await dest.search(query);
    const best = bestCandidate(track, candidates);
    if (best && best.score >= threshold) {
      return toLink(best.candidate, best.score, step.strategy);
    }
  }

  return null;
}
