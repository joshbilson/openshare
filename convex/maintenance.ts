import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PER_RUN = 200;

/**
 * Cron cleanup: delete playlists (and their tracks / resolutions / progress)
 * older than `olderThanMs`, using the `by_createdAt` index. Bounded per run.
 */
export const cleanup = internalMutation({
  args: { olderThanMs: v.optional(v.number()) },
  handler: async (ctx, { olderThanMs }) => {
    const cutoff = Date.now() - (olderThanMs ?? THIRTY_DAYS_MS);

    const stale = await ctx.db
      .query("playlists")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(MAX_PER_RUN);

    for (const playlist of stale) {
      const tracks = await ctx.db
        .query("tracks")
        .withIndex("by_playlist", (q) => q.eq("playlistId", playlist._id))
        .collect();
      for (const t of tracks) await ctx.db.delete(t._id);

      const resolutions = await ctx.db
        .query("trackResolutions")
        .withIndex("by_playlist", (q) => q.eq("playlistId", playlist._id))
        .collect();
      for (const r of resolutions) await ctx.db.delete(r._id);

      const progress = await ctx.db
        .query("resolutionProgress")
        .withIndex("by_playlist", (q) => q.eq("playlistId", playlist._id))
        .unique();
      if (progress) await ctx.db.delete(progress._id);

      await ctx.db.delete(playlist._id);
    }

    return { deletedPlaylists: stale.length };
  },
});
