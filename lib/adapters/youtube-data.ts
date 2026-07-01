/**
 * Official YouTube Data API v3 search — used as a resilience *fallback* for the
 * unofficial InnerTube search (which is keyless but fragile; risk R4b).
 *
 * Quota note: `search.list` costs 100 units against a default 10,000/day quota
 * (~100 searches/day), so this must NOT be the primary search — it only runs
 * when InnerTube returns no candidates or is blocked. The API key is read-only
 * (no OAuth), so it cannot create playlists; the recipient's one-tap save still
 * relies on the `watch_videos` trick.
 */

import type { SearchCandidate } from "../contract/types";
import type { HttpClient } from "./http";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

interface DataApiSearchResponse {
  items?: Array<{
    id?: { kind?: string; videoId?: string };
    snippet?: { title?: string; channelTitle?: string };
  }>;
}

/** Auto-generated music uploads use a "<Artist> - Topic" channel name. */
function channelToArtist(channelTitle: string | undefined): string[] {
  if (!channelTitle) return [];
  const trimmed = channelTitle.replace(/\s*-\s*Topic\s*$/i, "").trim();
  return trimmed ? [trimmed] : [];
}

/** Map a Data API search response to scorer-ready candidates. */
export function parseYouTubeDataSearch(
  response: DataApiSearchResponse,
): SearchCandidate[] {
  const items = response.items ?? [];
  const out: SearchCandidate[] = [];
  for (const item of items) {
    const videoId = item.id?.videoId;
    const title = item.snippet?.title;
    if (!videoId || !title) continue;
    out.push({
      title,
      artists: channelToArtist(item.snippet?.channelTitle),
      platform: "youtubeMusic",
      url: `https://music.youtube.com/watch?v=${videoId}`,
      externalId: videoId,
      ytVideoId: videoId,
    });
  }
  return out;
}

export interface YouTubeDataSearchConfig {
  apiKey: string;
  http: HttpClient;
  maxResults?: number;
}

/** Search YouTube for videos matching `query` via the official Data API. */
export async function searchYouTubeData(
  query: string,
  config: YouTubeDataSearchConfig,
): Promise<SearchCandidate[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: String(config.maxResults ?? 5),
    q: query,
    key: config.apiKey,
  });
  const response = await config.http.getJson<DataApiSearchResponse>(
    `${SEARCH_URL}?${params.toString()}`,
  );
  return parseYouTubeDataSearch(response);
}
