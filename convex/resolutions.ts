import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { platformLinksValidator } from "./schema";

/** All per-track resolutions for a playlist, ordered by position. */
export const listByPlaylist = query({
  args: { playlistId: v.id("playlists") },
  handler: async (ctx, { playlistId }) => {
    const rows = await ctx.db
      .query("trackResolutions")
      .withIndex("by_playlist", (q) => q.eq("playlistId", playlistId))
      .collect();
    rows.sort((a, b) => a.position - b.position);
    return rows;
  },
});

/**
 * One reactive read for the recipient page: the playlist, its tracks, the live
 * per-track resolutions, and progress. Re-runs automatically as matches fill in.
 */
export const recipientView = query({
  args: { shortId: v.string() },
  handler: async (ctx, { shortId }) => {
    const playlist = await ctx.db
      .query("playlists")
      .withIndex("by_shortId", (q) => q.eq("shortId", shortId))
      .unique();
    if (!playlist) return null;

    const [tracks, resolutions, progress] = await Promise.all([
      ctx.db
        .query("tracks")
        .withIndex("by_playlist", (q) => q.eq("playlistId", playlist._id))
        .collect(),
      ctx.db
        .query("trackResolutions")
        .withIndex("by_playlist", (q) => q.eq("playlistId", playlist._id))
        .collect(),
      ctx.db
        .query("resolutionProgress")
        .withIndex("by_playlist", (q) => q.eq("playlistId", playlist._id))
        .unique(),
    ]);

    tracks.sort((a, b) => a.position - b.position);
    resolutions.sort((a, b) => a.position - b.position);

    return { playlist, tracks, resolutions, progress };
  },
});

/**
 * Ordered YouTube video ids for a playlist's resolved tracks. Backs the
 * `/api/yt` one-tap "Save to YouTube Music" route, which turns them into a real
 * anonymous playlist via watch_videos. Public: video ids are non-sensitive.
 */
export const youtubePlaylistIds = query({
  args: { shortId: v.string() },
  handler: async (ctx, { shortId }) => {
    const playlist = await ctx.db
      .query("playlists")
      .withIndex("by_shortId", (q) => q.eq("shortId", shortId))
      .unique();
    if (!playlist) return [];

    const rows = await ctx.db
      .query("trackResolutions")
      .withIndex("by_playlist", (q) => q.eq("playlistId", playlist._id))
      .collect();

    return rows
      .filter((r): r is typeof r & { ytVideoId: string } => Boolean(r.ytVideoId))
      .sort((a, b) => a.position - b.position)
      .map((r) => r.ytVideoId);
  },
});

export const record = internalMutation({
  args: {
    playlistId: v.id("playlists"),
    trackId: v.id("tracks"),
    position: v.number(),
    status: v.union(v.literal("resolved"), v.literal("missed")),
    links: platformLinksValidator,
    ytVideoId: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("trackResolutions")
      .withIndex("by_track", (q) => q.eq("trackId", args.trackId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        links: args.links,
        ytVideoId: args.ytVideoId,
        previewUrl: args.previewUrl,
        confidence: args.confidence,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("trackResolutions", {
        playlistId: args.playlistId,
        trackId: args.trackId,
        position: args.position,
        status: args.status,
        links: args.links,
        ytVideoId: args.ytVideoId,
        previewUrl: args.previewUrl,
        confidence: args.confidence,
        updatedAt: now,
      });
    }

    const progress = await ctx.db
      .query("resolutionProgress")
      .withIndex("by_playlist", (q) => q.eq("playlistId", args.playlistId))
      .unique();
    if (progress) {
      await ctx.db.patch(progress._id, {
        resolved: progress.resolved + 1,
        missedCount: progress.missedCount + (args.status === "missed" ? 1 : 0),
        updatedAt: now,
      });
    }
  },
});
