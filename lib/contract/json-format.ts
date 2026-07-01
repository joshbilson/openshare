/**
 * OpenShare frozen contract — portable JSON interchange format.
 *
 * This shape doubles as: stored artifact, API response, export download, and
 * import/re-share input. Versioned for forward compatibility. Validated with Zod;
 * unknown fields are ignored (Zod strips them by default).
 */

import { z } from "zod";
import { PLATFORMS, type Platform, type SourceTrack } from "./types";

export const OPENSHARE_VERSION = 1 as const;

export const PlatformSchema = z.enum(PLATFORMS);

/** All-optional per-platform link map (explicit to avoid exhaustive-record pitfalls). */
export const PlatformLinksSchema = z
  .object({
    spotify: z.url().optional(),
    appleMusic: z.url().optional(),
    youtubeMusic: z.url().optional(),
    deezer: z.url().optional(),
  })
  .optional();

export const OpenShareTrackSchema = z.object({
  title: z.string().min(1),
  artists: z.array(z.string()),
  album: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  isrc: z.string().optional(),
  links: PlatformLinksSchema,
});

export const OpenShareDocSchema = z.object({
  openshareVersion: z.literal(OPENSHARE_VERSION),
  name: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  source: z.object({
    platform: PlatformSchema,
    url: z.url(),
  }),
  tracks: z.array(OpenShareTrackSchema),
});

export type OpenShareTrack = z.infer<typeof OpenShareTrackSchema>;
export type OpenShareDoc = z.infer<typeof OpenShareDocSchema>;

export type ParseResult =
  | { ok: true; doc: OpenShareDoc }
  | { ok: false; error: string };

/**
 * Validate untrusted input (an uploaded file or API body) into an OpenShareDoc.
 * Returns a discriminated result rather than throwing.
 */
export function parseOpenShareDoc(input: unknown): ParseResult {
  const result = OpenShareDocSchema.safeParse(input);
  if (result.success) {
    return { ok: true, doc: result.data };
  }
  const first = result.error.issues[0];
  const path = first?.path.join(".") || "(root)";
  return { ok: false, error: `${path}: ${first?.message ?? "invalid document"}` };
}

/**
 * Convert a validated OpenShareDoc back into source tracks for re-sharing. The
 * embedded links are hints only; the resolution workflow re-resolves matches.
 */
export function docToSourceTracks(doc: OpenShareDoc): SourceTrack[] {
  const platform: Platform = doc.source.platform;
  return doc.tracks.map((track, index) => ({
    title: track.title,
    artists: track.artists,
    album: track.album,
    durationMs: track.durationMs,
    isrc: track.isrc,
    position: index,
    sourcePlatform: platform,
    sourceId: track.isrc ?? `${platform}:${index}`,
    sourceUrl: track.links?.[platform],
  }));
}
