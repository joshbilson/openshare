/**
 * Build the portable OpenShare JSON document (export / re-share artifact) from
 * resolved playlist data. Pure and validated by the same Zod schema used on
 * import, so a round-trip is guaranteed.
 */

import { OPENSHARE_VERSION, type OpenShareDoc } from "../contract/json-format";
import type { Platform, PlatformLinks } from "../contract/types";

export interface ExportTrackInput {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
  links?: PlatformLinks;
}

export interface ExportInput {
  name: string;
  sourcePlatform: Platform;
  sourceUrl: string;
  /** ISO-8601 with offset; defaults to now. */
  createdAt?: string;
  tracks: ExportTrackInput[];
}

function cleanLinks(links?: PlatformLinks): PlatformLinks | undefined {
  if (!links) return undefined;
  const entries = Object.entries(links).filter(([, v]) => Boolean(v));
  return entries.length > 0 ? (Object.fromEntries(entries) as PlatformLinks) : undefined;
}

export function buildOpenShareDoc(input: ExportInput): OpenShareDoc {
  return {
    openshareVersion: OPENSHARE_VERSION,
    name: input.name,
    createdAt: input.createdAt ?? new Date().toISOString(),
    source: { platform: input.sourcePlatform, url: input.sourceUrl },
    tracks: input.tracks.map((t) => ({
      title: t.title,
      artists: t.artists,
      album: t.album,
      durationMs: t.durationMs,
      isrc: t.isrc,
      links: cleanLinks(t.links),
    })),
  };
}

/** A safe, descriptive filename for a downloaded export. */
export function exportFilename(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "playlist";
  return `openshare-${slug}.json`;
}
