/**
 * Track-name parsing, ported from playlistor's `parse_track_name`.
 *
 * Splits "(feat. …)/(ft. …)/(with …)" — bracketed or trailing — out of the title
 * into a separate list of featured artists, returning a clean name for scoring.
 */

export interface ParsedTrackName {
  /** Title with featured-artist annotations removed. */
  name: string;
  /** Featured artists extracted from the title. */
  features: string[];
}

// Bracketed forms: "(feat. X)", "[ft X & Y]", "(with X)", "(featuring X)".
const BRACKETED = /[([]\s*(?:feat|ft|featuring|with)\b\.?\s*([^)\]]+)[)\]]/gi;
// Trailing, unbracketed forms: "Song feat. X", "Song ft X".
const TRAILING = /\s+(?:feat|ft|featuring)\b\.?\s+(.+)$/i;
// Splits a feature blob into individual artists.
const FEATURE_SEPARATORS = /\s*(?:,|&|\band\b|\bx\b|\/|\+)\s*/i;

function splitFeatures(blob: string): string[] {
  return blob
    .split(FEATURE_SEPARATORS)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseTrackName(title: string): ParsedTrackName {
  const features: string[] = [];

  let name = title.replace(BRACKETED, (_match, captured: string) => {
    features.push(...splitFeatures(captured));
    return " ";
  });

  const trailing = name.match(TRAILING);
  if (trailing) {
    features.push(...splitFeatures(trailing[1]));
    name = name.slice(0, trailing.index).trimEnd();
  }

  name = name.replace(/\s+/g, " ").trim();

  // De-dupe features case-insensitively, preserving first-seen casing.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const f of features) {
    const key = f.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(f);
    }
  }

  return { name, features: deduped };
}
