/**
 * Playlist resolution core — pure orchestration over the matching engine and a
 * set of destination adapters. No Convex/network of its own: the Convex action is
 * a thin wrapper that injects a DB-backed cache + progress callback. Fully
 * unit-testable with mock destinations.
 */

import type { DestinationSearch } from "../contract/adapter";
import type { Platform, PlatformLinks, SourceTrack } from "../contract/types";
import { resolveTrack } from "../matching/ladder";
import { mapWithConcurrency } from "../util/concurrency";

export interface CachedLinks {
  byPlatform: PlatformLinks;
  ytVideoId?: string;
  previewUrl?: string;
  confidence: number;
}

/** ISRC-keyed link cache (Convex `trackLinks`); in-memory in tests. */
export interface LinkCache {
  get(key: string): Promise<CachedLinks | null>;
  set(key: string, value: CachedLinks): Promise<void>;
}

export type TrackResolutionStatus = "resolved" | "missed";

export interface TrackResolution {
  position: number;
  status: TrackResolutionStatus;
  links: PlatformLinks;
  ytVideoId?: string;
  previewUrl?: string;
  /** Best match confidence across platforms in [0,1]. */
  confidence: number;
}

export interface ResolvePlaylistOptions {
  concurrency?: number;
  cache?: LinkCache;
  /** Called as each track finishes (order not guaranteed) — drives live progress. */
  onResolved?: (resolution: TrackResolution) => Promise<void> | void;
}

/** Resolve one source track onto every destination platform. */
export async function resolveTrackLinks(
  track: SourceTrack,
  destinations: readonly DestinationSearch[],
  cache?: LinkCache,
): Promise<TrackResolution> {
  const links: PlatformLinks = {};
  if (track.sourceUrl) links[track.sourcePlatform] = track.sourceUrl;

  let ytVideoId: string | undefined;
  let previewUrl: string | undefined;
  let best = 0;

  const cacheKey = track.isrc ? track.isrc.toUpperCase() : null;
  const cached = cacheKey && cache ? await cache.get(cacheKey) : null;
  if (cached) {
    for (const [platform, url] of Object.entries(cached.byPlatform)) {
      if (url && !links[platform as Platform]) links[platform as Platform] = url;
    }
    ytVideoId ??= cached.ytVideoId;
    previewUrl ??= cached.previewUrl;
    best = Math.max(best, cached.confidence);
  }

  for (const dest of destinations) {
    if (links[dest.platform]) continue; // already known via source or cache
    try {
      const link = await resolveTrack(track, dest);
      if (!link) continue;
      links[dest.platform] = link.url;
      if (dest.platform === "youtubeMusic" && link.ytVideoId) {
        ytVideoId = link.ytVideoId;
      }
      if (!previewUrl && link.previewUrl) previewUrl = link.previewUrl;
      best = Math.max(best, link.confidence);
    } catch {
      // Graceful degradation: a failing platform yields a missed link, not a
      // failed playlist. Other platforms still resolve.
    }
  }

  const crossPlatform = Object.keys(links).filter(
    (p) => p !== track.sourcePlatform,
  ).length;
  const status: TrackResolutionStatus = crossPlatform > 0 ? "resolved" : "missed";

  if (cacheKey && cache) {
    await cache.set(cacheKey, {
      byPlatform: { ...links },
      ytVideoId,
      previewUrl,
      confidence: best,
    });
  }

  return { position: track.position, status, links, ytVideoId, previewUrl, confidence: best };
}

/** Resolve all tracks with bounded parallelism, reporting progress per track. */
export async function resolvePlaylist(
  tracks: readonly SourceTrack[],
  destinations: readonly DestinationSearch[],
  options: ResolvePlaylistOptions = {},
): Promise<TrackResolution[]> {
  const concurrency = options.concurrency ?? 8;
  return mapWithConcurrency(tracks, concurrency, async (track) => {
    const resolution = await resolveTrackLinks(track, destinations, options.cache);
    if (options.onResolved) await options.onResolved(resolution);
    return resolution;
  });
}
