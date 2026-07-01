import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { detectSource } from "../lib/contract/url-detect";
import { docToSourceTracks, parseOpenShareDoc } from "../lib/contract/json-format";
import type { SourceTrack } from "../lib/contract/types";
import { findSource } from "../lib/resolve/registry";
import { buildBundles } from "./lib/adapters";
import { siteUrl } from "./lib/env";
import { newShortId } from "./playlists";

interface ShareResult {
  shortId: string;
  url: string;
  deduped: boolean;
}

function toCreateTracks(tracks: SourceTrack[]) {
  return tracks.map((t) => ({
    position: t.position,
    title: t.title,
    artists: t.artists,
    album: t.album,
    isrc: t.isrc,
    durationMs: t.durationMs,
    sourceId: t.sourceId,
    sourceUrl: t.sourceUrl,
  }));
}

/**
 * Create a share from a playlist URL. Detects the source platform, dedupes by
 * normalized URL, reads the snapshot (no login), mints a short id, returns the
 * link immediately, and schedules background resolution.
 */
export const createShare = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<ShareResult> => {
    const ref = detectSource(url);
    if (!ref) throw new Error("Unsupported or invalid playlist URL.");

    const existing = await ctx.runQuery(internal.playlists.findByNormalizedUrl, {
      normalizedUrl: ref.normalizedUrl,
    });
    if (existing) {
      return {
        shortId: existing.shortId,
        url: `${siteUrl()}/p/${existing.shortId}`,
        deduped: true,
      };
    }

    const bundles = buildBundles();
    const source = findSource(bundles, url);
    if (!source) {
      throw new Error(`No reader is configured for ${ref.platform}.`);
    }

    const snapshot = await source.readPlaylist(url);
    const shortId = newShortId();

    const playlistId = await ctx.runMutation(internal.playlists.create, {
      shortId,
      sourcePlatform: ref.platform,
      sourceUrl: url,
      normalizedUrl: ref.normalizedUrl,
      title: snapshot.title,
      ownerName: snapshot.ownerName,
      coverUrl: snapshot.coverUrl,
      tracks: toCreateTracks(snapshot.tracks),
    });

    await ctx.scheduler.runAfter(0, internal.matching.resolvePlaylistAction, {
      playlistId,
    });
    await ctx.runMutation(internal.events.record, { kind: "share_created" });

    return { shortId, url: `${siteUrl()}/p/${shortId}`, deduped: false };
  },
});

/** Re-share from an uploaded OpenShare JSON document (validated with Zod). */
export const importShare = action({
  args: { doc: v.any() },
  handler: async (ctx, { doc }): Promise<ShareResult> => {
    const parsed = parseOpenShareDoc(doc);
    if (!parsed.ok) {
      throw new Error(`Invalid OpenShare document: ${parsed.error}`);
    }

    const ref = detectSource(parsed.doc.source.url);
    const normalizedUrl = ref
      ? ref.normalizedUrl
      : `import:${parsed.doc.source.platform}:${parsed.doc.name}`;

    if (ref) {
      const existing = await ctx.runQuery(
        internal.playlists.findByNormalizedUrl,
        { normalizedUrl },
      );
      if (existing) {
        return {
          shortId: existing.shortId,
          url: `${siteUrl()}/p/${existing.shortId}`,
          deduped: true,
        };
      }
    }

    const shortId = newShortId();
    const playlistId = await ctx.runMutation(internal.playlists.create, {
      shortId,
      sourcePlatform: parsed.doc.source.platform,
      sourceUrl: parsed.doc.source.url,
      normalizedUrl,
      title: parsed.doc.name,
      tracks: toCreateTracks(docToSourceTracks(parsed.doc)),
    });

    await ctx.scheduler.runAfter(0, internal.matching.resolvePlaylistAction, {
      playlistId,
    });

    return { shortId, url: `${siteUrl()}/p/${shortId}`, deduped: false };
  },
});
