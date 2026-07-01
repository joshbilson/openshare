import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { platformLinksValidator } from "./schema";

/** ISRC (or "platform:id") keyed cross-platform link cache — our owned asset. */
export const getByKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    return await ctx.db
      .query("trackLinks")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
  },
});

export const upsert = internalMutation({
  args: {
    key: v.string(),
    byPlatform: platformLinksValidator,
    ytVideoId: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    confidence: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("trackLinks")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        byPlatform: { ...existing.byPlatform, ...args.byPlatform },
        ytVideoId: args.ytVideoId ?? existing.ytVideoId,
        previewUrl: args.previewUrl ?? existing.previewUrl,
        confidence: Math.max(existing.confidence, args.confidence),
        resolvedAt: now,
      });
    } else {
      await ctx.db.insert("trackLinks", {
        key: args.key,
        byPlatform: args.byPlatform,
        ytVideoId: args.ytVideoId,
        previewUrl: args.previewUrl,
        confidence: args.confidence,
        resolvedAt: now,
      });
    }
  },
});
