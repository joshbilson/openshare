/**
 * Track similarity scorer, ported from playlistor (adapted from platers/unitunes).
 *
 * Weighted average of per-field Jaro–Winkler similarities, with a special-term
 * guard that hard-rejects studio↔live/remix/etc. mismatches. Constants are
 * adopted verbatim from the original and tuned later against fixtures.
 */

import {
  normalize,
  normalizedStringSimilarity,
  pairwiseMax,
} from "./strings";
import { parseTrackName } from "./parse-track-name";

export const SCORE_WEIGHTS = {
  name: 50,
  artists: 30,
  album: 20,
  length: 20,
} as const;

/** similarity ≥ this ⇒ "same track". */
export const ACCEPT_THRESHOLD = 0.7;

/** ± window for the linear length-similarity ramp. */
export const LENGTH_TOLERANCE_MS = 5000;

/**
 * If any of these appears in one title but not the other, the tracks are not the
 * same (blocks e.g. studio↔live, original↔remix).
 */
export const SPECIAL_TERMS = [
  "instrumental",
  "remix",
  "cover",
  "live",
  "version",
  "edit",
  "nightcore",
] as const;

/** Minimal shape the scorer needs — both CanonicalTrack and SearchCandidate fit. */
export interface ScorableTrack {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
}

function uniqueArtists(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = normalize(v);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

/** True if a guard term is present in exactly one of the two titles. */
export function specialTermMismatch(titleA: string, titleB: string): boolean {
  const a = normalize(titleA);
  const b = normalize(titleB);
  for (const term of SPECIAL_TERMS) {
    const re = new RegExp(`\\b${term}\\b`);
    if (re.test(a) !== re.test(b)) return true;
  }
  return false;
}

/** Pairwise-max artist similarity; 0.5 when either side has no artists. */
export function artistsSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0.5;
  return pairwiseMax(a, b);
}

/** Linear within ±LENGTH_TOLERANCE_MS, else 0. */
export function lengthSimilarity(aMs: number, bMs: number): number {
  const diff = Math.abs(aMs - bMs);
  if (diff >= LENGTH_TOLERANCE_MS) return 0;
  return 1 - diff / LENGTH_TOLERANCE_MS;
}

/**
 * Overall similarity in [0, 1]. Weighted average over the fields available on
 * both tracks; album/length contribute only when present on both sides.
 */
export function trackSimilarity(a: ScorableTrack, b: ScorableTrack): number {
  if (specialTermMismatch(a.title, b.title)) return 0;

  const parsedA = parseTrackName(a.title);
  const parsedB = parseTrackName(b.title);

  const artistsA = uniqueArtists([...a.artists, ...parsedA.features]);
  const artistsB = uniqueArtists([...b.artists, ...parsedB.features]);

  let weightSum = 0;
  let scoreSum = 0;

  const nameScore = normalizedStringSimilarity(parsedA.name, parsedB.name);
  weightSum += SCORE_WEIGHTS.name;
  scoreSum += SCORE_WEIGHTS.name * nameScore;

  const artistScore = artistsSimilarity(artistsA, artistsB);
  weightSum += SCORE_WEIGHTS.artists;
  scoreSum += SCORE_WEIGHTS.artists * artistScore;

  if (a.album && b.album) {
    const albumScore = normalizedStringSimilarity(a.album, b.album);
    weightSum += SCORE_WEIGHTS.album;
    scoreSum += SCORE_WEIGHTS.album * albumScore;
  }

  if (typeof a.durationMs === "number" && typeof b.durationMs === "number") {
    const lengthScore = lengthSimilarity(a.durationMs, b.durationMs);
    weightSum += SCORE_WEIGHTS.length;
    scoreSum += SCORE_WEIGHTS.length * lengthScore;
  }

  const similarity = weightSum === 0 ? 0 : scoreSum / weightSum;
  return Math.min(1, Math.max(0, similarity));
}

/** Convenience boolean form. */
export function areTracksSame(
  a: ScorableTrack,
  b: ScorableTrack,
  threshold: number = ACCEPT_THRESHOLD,
): boolean {
  return trackSimilarity(a, b) >= threshold;
}
