import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Mirror of the `Platform` union from the frozen contract, as a Convex validator. */
export const platformValidator = v.union(
  v.literal("spotify"),
  v.literal("appleMusic"),
  v.literal("youtubeMusic"),
  v.literal("deezer"),
);

/** Partial per-platform link map stored on resolutions and the cache. */
export const platformLinksValidator = v.object({
  spotify: v.optional(v.string()),
  appleMusic: v.optional(v.string()),
  youtubeMusic: v.optional(v.string()),
  deezer: v.optional(v.string()),
});

export default defineSchema({
  // A shared playlist: the source snapshot + lifecycle status.
  playlists: defineTable({
    shortId: v.string(),
    sourcePlatform: platformValidator,
    sourceUrl: v.string(),
    normalizedUrl: v.string(),
    title: v.string(),
    ownerName: v.optional(v.string()),
    coverUrl: v.optional(v.string()),
    trackCount: v.number(),
    status: v.union(
      v.literal("reading"),
      v.literal("resolving"),
      v.literal("ready"),
      v.literal("error"),
    ),
    error: v.optional(v.string()),
    // Reserved (optional): previously cached YouTube Music "save" playlist URLs.
    // The one-tap save now resolves live in the `/api/yt` route on Vercel (whose
    // egress isn't YouTube-blocked), so this is no longer written but kept
    // nullable for backward compatibility with older documents.
    youtubeSaveUrls: v.optional(v.array(v.string())),
    createdAt: v.number(),
  })
    .index("by_shortId", ["shortId"])
    .index("by_normalizedUrl", ["normalizedUrl"])
    .index("by_createdAt", ["createdAt"]),

  // Immutable source tracks for a playlist (the snapshot read at share time).
  tracks: defineTable({
    playlistId: v.id("playlists"),
    position: v.number(),
    title: v.string(),
    artists: v.array(v.string()),
    album: v.optional(v.string()),
    isrc: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    sourcePlatform: platformValidator,
    sourceId: v.string(),
    sourceUrl: v.optional(v.string()),
  }).index("by_playlist", ["playlistId"]),

  // Per-track resolution results, mutated live as the workflow completes. Drives
  // the recipient page's progressive fill via a reactive query.
  trackResolutions: defineTable({
    playlistId: v.id("playlists"),
    trackId: v.id("tracks"),
    position: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("resolved"),
      v.literal("missed"),
    ),
    links: platformLinksValidator,
    ytVideoId: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    confidence: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_playlist", ["playlistId"])
    .index("by_track", ["trackId"]),

  // Global owned asset: ISRC -> platform links cache. Grows cheaper over time.
  trackLinks: defineTable({
    // Cache key: an ISRC, or "platform:id" when no ISRC is available.
    key: v.string(),
    byPlatform: platformLinksValidator,
    ytVideoId: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    confidence: v.number(),
    resolvedAt: v.number(),
  }).index("by_key", ["key"]),

  // Per-playlist progress counters (drive the live UI).
  resolutionProgress: defineTable({
    playlistId: v.id("playlists"),
    resolved: v.number(),
    total: v.number(),
    missedCount: v.number(),
    updatedAt: v.number(),
  }).index("by_playlist", ["playlistId"]),

  // Lightweight, PII-free counters for cost/abuse visibility.
  shareEvents: defineTable({
    kind: v.string(),
    at: v.number(),
    meta: v.optional(v.string()),
  }).index("by_kind", ["kind"]),
});
