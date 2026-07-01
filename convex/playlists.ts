import { v } from "convex/values";
import { customAlphabet } from "nanoid";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { platformValidator } from "./schema";

/** URL-safe, unambiguous short id (no 0/o/1/l/i) for /p/{id}. */
export const newShortId = customAlphabet(
  "23456789abcdefghijkmnpqrstuvwxyz",
  8,
);

const trackInput = v.object({
  position: v.number(),
  title: v.string(),
  artists: v.array(v.string()),
  album: v.optional(v.string()),
  isrc: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  sourceId: v.string(),
  sourceUrl: v.optional(v.string()),
});

export const getByShortId = query({
  args: { shortId: v.string() },
  handler: async (ctx, { shortId }) => {
    return await ctx.db
      .query("playlists")
      .withIndex("by_shortId", (q) => q.eq("shortId", shortId))
      .unique();
  },
});

export const getByNormalizedUrl = query({
  args: { normalizedUrl: v.string() },
  handler: async (ctx, { normalizedUrl }) => {
    return await ctx.db
      .query("playlists")
      .withIndex("by_normalizedUrl", (q) => q.eq("normalizedUrl", normalizedUrl))
      .unique();
  },
});

export const findByNormalizedUrl = internalQuery({
  args: { normalizedUrl: v.string() },
  handler: async (ctx, { normalizedUrl }) => {
    return await ctx.db
      .query("playlists")
      .withIndex("by_normalizedUrl", (q) => q.eq("normalizedUrl", normalizedUrl))
      .unique();
  },
});

export const getSnapshot = internalQuery({
  args: { playlistId: v.id("playlists") },
  handler: async (ctx, { playlistId }) => {
    const playlist = await ctx.db.get(playlistId);
    if (!playlist) return null;
    const tracks = await ctx.db
      .query("tracks")
      .withIndex("by_playlist", (q) => q.eq("playlistId", playlistId))
      .collect();
    tracks.sort((a, b) => a.position - b.position);
    return { playlist, tracks };
  },
});

export const create = internalMutation({
  args: {
    shortId: v.string(),
    sourcePlatform: platformValidator,
    sourceUrl: v.string(),
    normalizedUrl: v.string(),
    title: v.string(),
    ownerName: v.optional(v.string()),
    coverUrl: v.optional(v.string()),
    tracks: v.array(trackInput),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const playlistId = await ctx.db.insert("playlists", {
      shortId: args.shortId,
      sourcePlatform: args.sourcePlatform,
      sourceUrl: args.sourceUrl,
      normalizedUrl: args.normalizedUrl,
      title: args.title,
      ownerName: args.ownerName,
      coverUrl: args.coverUrl,
      trackCount: args.tracks.length,
      status: "resolving",
      createdAt: now,
    });

    for (const track of args.tracks) {
      const trackId = await ctx.db.insert("tracks", {
        playlistId,
        position: track.position,
        title: track.title,
        artists: track.artists,
        album: track.album,
        isrc: track.isrc,
        durationMs: track.durationMs,
        sourcePlatform: args.sourcePlatform,
        sourceId: track.sourceId,
        sourceUrl: track.sourceUrl,
      });
      // Seed a pending resolution carrying the known source link.
      const links: Record<string, string> = {};
      if (track.sourceUrl) links[args.sourcePlatform] = track.sourceUrl;
      await ctx.db.insert("trackResolutions", {
        playlistId,
        trackId,
        position: track.position,
        status: "pending",
        links,
        updatedAt: now,
      });
    }

    await ctx.db.insert("resolutionProgress", {
      playlistId,
      resolved: 0,
      total: args.tracks.length,
      missedCount: 0,
      updatedAt: now,
    });

    return playlistId;
  },
});

export const setStatus = internalMutation({
  args: {
    playlistId: v.id("playlists"),
    status: v.union(
      v.literal("reading"),
      v.literal("resolving"),
      v.literal("ready"),
      v.literal("error"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { playlistId, status, error }) => {
    await ctx.db.patch(playlistId, { status, error });
  },
});
