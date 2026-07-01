/**
 * String similarity primitives for the matching engine.
 *
 * Jaro–Winkler implementation matching strsimpy's defaults (boost threshold 0.7,
 * scaling factor 0.1, max prefix 4) so the ported playlistor/unitunes scorer
 * behaves the same as the Python original.
 */

/** Raw Jaro similarity in [0, 1]. */
export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const len1 = a.length;
  const len2 = b.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const aMatches = new Array<boolean>(len1).fill(false);
  const bMatches = new Array<boolean>(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  return (
    (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3
  );
}

const WINKLER_THRESHOLD = 0.7;
const WINKLER_SCALE = 0.1;
const WINKLER_MAX_PREFIX = 4;

/** Jaro–Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b);
  if (j <= WINKLER_THRESHOLD) return j;

  let prefix = 0;
  const max = Math.min(WINKLER_MAX_PREFIX, a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return j + prefix * WINKLER_SCALE * (1 - j);
}

/** Lowercase + collapse whitespace, then Jaro–Winkler. */
export function normalizedStringSimilarity(a: string, b: string): number {
  return jaroWinkler(normalize(a), normalize(b));
}

/** Best similarity over the cartesian product of two lists (0 if either empty). */
export function pairwiseMax(
  a: readonly string[],
  b: readonly string[],
  score: (x: string, y: string) => number = normalizedStringSimilarity,
): number {
  if (a.length === 0 || b.length === 0) return 0;
  let best = 0;
  for (const x of a) {
    for (const y of b) {
      const s = score(x, y);
      if (s > best) best = s;
    }
  }
  return best;
}

/** Lowercase, strip diacritics, collapse internal whitespace, trim. */
export function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
