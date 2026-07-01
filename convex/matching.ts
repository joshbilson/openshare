import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { Platform, SourceTrack } from "../lib/contract/types";
import { selectDestinations } from "../lib/resolve/registry";
import { resolvePlaylist, type LinkCache } from "../lib/resolve/resolve-playlist";
import { buildBundles } from "./lib/adapters";

interface SnapshotTrack {
  _id: Id<"tracks">;
  position: number;
  title: string;
  artists: string[];
  album?: string;
  isrc?: string;
  durationMs?: number;
  sourceId: string;
  sourceUrl?: string;
}

/**
 * Background resolution: fan out per-track matching across destination platforms
 * with bounded parallelism, an ISRC cache, per-host throttling (inside the
 * adapters' HTTP client), and live progress writes. Graceful on per-platform
 * failure. Scheduled by the share flow.
 */
export const resolvePlaylistAction = internalAction({
  args: { playlistId: v.id("playlists") },
  handler: async (ctx, { playlistId }) => {
    const snapshot = await ctx.runQuery(internal.playlists.getSnapshot, {
      playlistId,
    });
    if (!snapshot) return;

    const sourcePlatform = snapshot.playlist.sourcePlatform as Platform;
    const tracks = snapshot.tracks as SnapshotTrack[];

    try {
      const bundles = buildBundles();
      const destinations = selectDestinations(bundles, sourcePlatform);

      const cache: LinkCache = {
        get: async (key) => {
          const doc = await ctx.runQuery(internal.cache.getByKey, { key });
          if (!doc) return null;
          return {
            byPlatform: doc.byPlatform,
            ytVideoId: doc.ytVideoId,
            previewUrl: doc.previewUrl,
            confidence: doc.confidence,
          };
        },
        set: async (key, value) => {
          await ctx.runMutation(internal.cache.upsert, {
            key,
            byPlatform: value.byPlatform,
            ytVideoId: value.ytVideoId,
            previewUrl: value.previewUrl,
            confidence: value.confidence,
          });
        },
      };

      const idByPosition = new Map<number, Id<"tracks">>(
        tracks.map((t) => [t.position, t._id]),
      );
      const sourceTracks: SourceTrack[] = tracks.map((t) => ({
        isrc: t.isrc,
        title: t.title,
        artists: t.artists,
        album: t.album,
        durationMs: t.durationMs,
        position: t.position,
        sourcePlatform,
        sourceId: t.sourceId,
        sourceUrl: t.sourceUrl,
      }));

      await resolvePlaylist(sourceTracks, destinations, {
        concurrency: 6,
        cache,
        onResolved: async (res) => {
          const trackId = idByPosition.get(res.position);
          if (!trackId) return;
          await ctx.runMutation(internal.resolutions.record, {
            playlistId,
            trackId,
            position: res.position,
            status: res.status,
            links: res.links,
            ytVideoId: res.ytVideoId,
            previewUrl: res.previewUrl,
            confidence: res.confidence,
          });
        },
      });

      await ctx.runMutation(internal.playlists.setStatus, {
        playlistId,
        status: "ready",
      });
    } catch (error) {
      await ctx.runMutation(internal.playlists.setStatus, {
        playlistId,
        status: "error",
        error: String(error),
      });
    }
  },
});
