/**
 * YouTube Music adapter via the unofficial InnerTube API (keyless, no quota).
 *
 * YouTube tracks have no ISRC, so the destination has no ISRC lookup — matching
 * is text-only and scored by the engine, preferring "song" results. Source reads
 * use the InnerTube `browse` endpoint. InnerTube is fragile (risk R4b); the
 * parser is defensive and exported pure for fixture tests.
 */

import type { DestinationSearch, SourceAdapter } from "../contract/adapter";
import type {
  CanonicalPlaylist,
  SearchCandidate,
  SourceTrack,
} from "../contract/types";
import { detectSource } from "../contract/url-detect";
import type { HttpClient } from "./http";
import type { AdapterBundle } from "./types";
import { searchYouTubeData } from "./youtube-data";

const INNERTUBE = "https://music.youtube.com/youtubei/v1";
// Public InnerTube web-client key. This is NOT a secret or a credential: it is
// the same constant shipped in YouTube Music's own public JavaScript bundle and
// is identical for every anonymous visitor. Safe to commit.
const DEFAULT_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const DEFAULT_CLIENT_VERSION = "1.20240731.01.00";
// InnerTube search filter restricting results to songs.
const SONGS_PARAMS = "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D";

interface Run {
  text?: string;
  navigationEndpoint?: {
    watchEndpoint?: { videoId?: string };
    browseEndpoint?: {
      browseId?: string;
      browseEndpointContextSupportedConfigs?: {
        browseEndpointContextMusicConfig?: { pageType?: string };
      };
    };
  };
}
interface FlexColumn {
  musicResponsiveListItemFlexColumnRenderer?: { text?: { runs?: Run[] } };
}
export interface MusicListItemRenderer {
  flexColumns?: FlexColumn[];
  playlistItemData?: { videoId?: string };
  overlay?: {
    musicItemThumbnailOverlayRenderer?: {
      content?: {
        musicPlayButtonRenderer?: {
          playNavigationEndpoint?: { watchEndpoint?: { videoId?: string } };
        };
      };
    };
  };
}

export interface MusicItem {
  videoId: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
}

export function parseDurationToMs(text: string): number | undefined {
  const parts = text.trim().split(":").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return seconds * 1000;
}

function runs(column: FlexColumn | undefined): Run[] {
  return column?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [];
}

function pageType(run: Run): string | undefined {
  return run.navigationEndpoint?.browseEndpoint
    ?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
    ?.pageType;
}

export function parseMusicItem(
  renderer: MusicListItemRenderer,
): MusicItem | null {
  const cols = renderer.flexColumns ?? [];
  const titleRuns = runs(cols[0]);
  const title = titleRuns[0]?.text ?? "";

  const videoId =
    renderer.playlistItemData?.videoId ??
    renderer.overlay?.musicItemThumbnailOverlayRenderer?.content
      ?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint
      ?.videoId ??
    titleRuns[0]?.navigationEndpoint?.watchEndpoint?.videoId ??
    "";

  if (!videoId || !title) return null;

  const detailRuns = runs(cols[1]);
  const artists: string[] = [];
  let album: string | undefined;
  let durationMs: number | undefined;

  for (const run of detailRuns) {
    const text = run.text ?? "";
    if (text.trim() === "•" || text.trim() === "") continue;
    const type = pageType(run);
    if (type === "MUSIC_PAGE_TYPE_ARTIST") {
      artists.push(text);
    } else if (type === "MUSIC_PAGE_TYPE_ALBUM") {
      album = text;
    } else if (/^\d+(:\d+)+$/.test(text.trim())) {
      durationMs = parseDurationToMs(text);
    }
  }

  // Fallback: if no typed artist runs, take the first non-separator detail run.
  if (artists.length === 0) {
    const first = detailRuns.find(
      (r) => r.text && r.text.trim() !== "•" && !/^\d+(:\d+)+$/.test(r.text.trim()),
    );
    if (first?.text) artists.push(first.text);
  }

  return { videoId, title, artists, album, durationMs };
}

export function musicItemToCandidate(item: MusicItem): SearchCandidate {
  return {
    title: item.title,
    artists: item.artists,
    album: item.album,
    durationMs: item.durationMs,
    platform: "youtubeMusic",
    url: `https://music.youtube.com/watch?v=${item.videoId}`,
    externalId: item.videoId,
    ytVideoId: item.videoId,
  };
}

function collectItemRenderers(node: unknown, out: MusicListItemRenderer[]): void {
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if ("musicResponsiveListItemRenderer" in record) {
    out.push(record.musicResponsiveListItemRenderer as MusicListItemRenderer);
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const v of value) collectItemRenderers(v, out);
    } else if (value && typeof value === "object") {
      collectItemRenderers(value, out);
    }
  }
}

/** Extract song candidates from an InnerTube search response. */
export function parseInnerTubeSearch(response: unknown): SearchCandidate[] {
  const renderers: MusicListItemRenderer[] = [];
  collectItemRenderers(response, renderers);
  const items = renderers
    .map(parseMusicItem)
    .filter((i): i is MusicItem => i !== null);
  return items.map(musicItemToCandidate);
}

/** Extract a playlist title + source tracks from an InnerTube browse response. */
export function parseInnerTubeBrowsePlaylist(response: unknown): {
  title: string;
  tracks: SourceTrack[];
} {
  const renderers: MusicListItemRenderer[] = [];
  collectItemRenderers(response, renderers);
  const items = renderers
    .map(parseMusicItem)
    .filter((i): i is MusicItem => i !== null);

  let title = "YouTube Music playlist";
  if (response && typeof response === "object") {
    const header = (response as { header?: unknown }).header;
    const found = findTitle(header);
    if (found) title = found;
  }

  return {
    title,
    tracks: items.map((item, position) => ({
      title: item.title,
      artists: item.artists,
      album: item.album,
      durationMs: item.durationMs,
      position,
      sourcePlatform: "youtubeMusic",
      sourceId: item.videoId,
      sourceUrl: `https://music.youtube.com/watch?v=${item.videoId}`,
    })),
  };
}

function findTitle(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const record = node as Record<string, unknown>;
  const title = record.title as { text?: string; runs?: { text?: string }[] };
  if (title?.runs?.[0]?.text) return title.runs[0].text;
  if (typeof title?.text === "string") return title.text;
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const found = findTitle(value);
      if (found) return found;
    }
  }
  return undefined;
}

export interface YouTubeConfig {
  http: HttpClient;
  apiKey?: string;
  clientVersion?: string;
  hl?: string;
  gl?: string;
  /**
   * Official YouTube Data API v3 key. When present, it is used as a quota-safe
   * *fallback* for destination search — only when InnerTube yields no candidates
   * or is blocked. Read-only: it never creates playlists.
   */
  dataApiKey?: string;
}

export function createYouTubeAdapter(config: YouTubeConfig): AdapterBundle {
  const key = config.apiKey ?? DEFAULT_KEY;
  const clientVersion = config.clientVersion ?? DEFAULT_CLIENT_VERSION;
  const context = {
    client: {
      clientName: "WEB_REMIX",
      clientVersion,
      hl: config.hl ?? "en",
      gl: config.gl ?? "US",
    },
  };

  const source: SourceAdapter = {
    platform: "youtubeMusic",
    matchesUrl: (url) => detectSource(url)?.platform === "youtubeMusic",
    async readPlaylist(url): Promise<CanonicalPlaylist> {
      const ref = detectSource(url);
      if (!ref || ref.platform !== "youtubeMusic") {
        throw new Error(`Not a YouTube Music playlist URL: ${url}`);
      }
      const browseId = ref.id.startsWith("VL") ? ref.id : `VL${ref.id}`;
      const response = await config.http.postJson<unknown>(
        `${INNERTUBE}/browse?key=${key}&prettyPrint=false`,
        { context, browseId },
      );
      const parsed = parseInnerTubeBrowsePlaylist(response);
      return {
        title: parsed.title,
        sourcePlatform: "youtubeMusic",
        sourceUrl: url,
        sourceId: ref.id,
        tracks: parsed.tracks,
      };
    },
  };

  const destination: DestinationSearch = {
    platform: "youtubeMusic",
    lookupByIsrc: null,
    search: async (query) => {
      try {
        const response = await config.http.postJson<unknown>(
          `${INNERTUBE}/search?key=${key}&prettyPrint=false`,
          { context, query, params: SONGS_PARAMS },
        );
        const candidates = parseInnerTubeSearch(response);
        if (candidates.length > 0 || !config.dataApiKey) return candidates;
      } catch (error) {
        // InnerTube blocked/broke — fall back to the official API if we have a key.
        if (!config.dataApiKey) throw error;
      }
      return searchYouTubeData(query, {
        apiKey: config.dataApiKey,
        http: config.http,
      });
    },
  };

  return { platform: "youtubeMusic", source, destination };
}
