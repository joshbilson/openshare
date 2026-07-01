import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/** Record a lightweight, PII-free event counter (cost/abuse visibility). */
export const record = internalMutation({
  args: { kind: v.string(), meta: v.optional(v.string()) },
  handler: async (ctx, { kind, meta }) => {
    await ctx.db.insert("shareEvents", { kind, at: Date.now(), meta });
  },
});

/**
 * Per-IP token check for share creation. Stores one event per allowed request
 * under `ip:{hash}` and refuses once `limit` requests fall within `windowMs`.
 */
export const checkIpRateLimit = internalMutation({
  args: { ip: v.string(), limit: v.number(), windowMs: v.number() },
  handler: async (ctx, { ip, limit, windowMs }) => {
    const key = `ip:${ip}`;
    const cutoff = Date.now() - windowMs;
    const events = await ctx.db
      .query("shareEvents")
      .withIndex("by_kind", (q) => q.eq("kind", key))
      .collect();
    const within = events.filter((e) => e.at >= cutoff);
    if (within.length >= limit) {
      return { allowed: false as const, retryAfterMs: windowMs };
    }
    await ctx.db.insert("shareEvents", { kind: key, at: Date.now() });
    return { allowed: true as const };
  },
});
