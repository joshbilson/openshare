/**
 * Spotify adapter.
 *
 * Reading public playlists with no login is locked down on the API (403), so the
 * source path scrapes the public embed page's `__NEXT_DATA__` JSON (risk R1),
 * optionally enriching tracks with ISRC/album via the client-credentials catalog
 * API (which still works app-only). The destination path uses client-credentials
 * search + `isrc:` lookup. Mappers + the embed parser are exported pure for tests.
 */

import type { DestinationSearch, SourceAdapter } from "../contract/adapter";
import type {
  CanonicalPlaylist,
  SearchCandidate,
  SourceTrack,
} from "../contract/types";
import { detectSource } from "../contract/url-detect";
import type { FetchLike, HttpClient } from "./http";
import type { AdapterBundle } from "./types";

const API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

interface SpotifyApiArtist {
  name?: string;
}
interface SpotifyApiTrack {
  id?: string;
  name?: string;
  duration_ms?: number;
  preview_url?: string | null;
  external_urls?: { spotify?: string };
  external_ids?: { isrc?: string };
  album?: { name?: string; images?: { url?: string }[] };
  artists?: SpotifyApiArtist[];
}
interface SpotifySearchResponse {
  tracks?: { items?: SpotifyApiTrack[] };
}
interface SpotifyTracksResponse {
  tracks?: SpotifyApiTrack[];
}

export function mapSpotifyCandidate(track: SpotifyApiTrack): SearchCandidate {
  return {
    title: track.name ?? "",
    artists: (track.artists ?? []).map((a) => a.name ?? "").filter(Boolean),
    album: track.album?.name,
    durationMs: track.duration_ms,
    isrc: track.external_ids?.isrc,
    platform: "spotify",
    url: track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`,
    externalId: track.id ?? "",
    previewUrl: track.preview_url || undefined,
  };
}

export interface EmbedTrack {
  id: string;
  title: string;
  artists: string[];
  durationMs?: number;
}
export interface ParsedEmbed {
  title: string;
  ownerName?: string;
  coverUrl?: string;
  tracks: EmbedTrack[];
}

interface EmbedEntityTrack {
  uri?: string;
  title?: string;
  subtitle?: string;
  duration?: number;
  artists?: { name?: string }[];
}

function idFromUri(uri: string | undefined): string {
  if (!uri) return "";
  const parts = uri.split(":");
  return parts[parts.length - 1] ?? "";
}

function artistsFromEmbedTrack(track: EmbedEntityTrack): string[] {
  if (track.artists && track.artists.length > 0) {
    return track.artists.map((a) => a.name ?? "").filter(Boolean);
  }
  if (track.subtitle) {
    return track.subtitle
      .split(/,|·|;|&/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Extract the tracklist from a Spotify embed page's `__NEXT_DATA__` JSON. */
export function parseSpotifyEmbed(html: string): ParsedEmbed {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("Spotify embed: __NEXT_DATA__ not found");

  const data = JSON.parse(match[1]) as {
    props?: {
      pageProps?: {
        state?: {
          data?: {
            entity?: {
              name?: string;
              title?: string;
              subtitle?: string;
              coverArt?: { sources?: { url?: string }[] };
              trackList?: EmbedEntityTrack[];
            };
          };
        };
      };
    };
  };

  const entity = data.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error("Spotify embed: entity missing");

  const list = entity.trackList ?? [];
  return {
    title: entity.name ?? entity.title ?? "Spotify playlist",
    ownerName: entity.subtitle,
    coverUrl: entity.coverArt?.sources?.[0]?.url,
    tracks: list.map((t) => ({
      id: idFromUri(t.uri),
      title: t.title ?? "",
      artists: artistsFromEmbedTrack(t),
      durationMs: typeof t.duration === "number" ? t.duration : undefined,
    })),
  };
}

function base64(input: string): string {
  if (typeof btoa === "function") return btoa(input);
  // Node fallback.
  return Buffer.from(input, "utf-8").toString("base64");
}

/** Cached client-credentials access-token provider. */
export function createSpotifyTokenProvider(opts: {
  clientId: string;
  clientSecret: string;
  fetch?: FetchLike;
}): () => Promise<string> {
  const fetchImpl: FetchLike = opts.fetch ?? ((i, init) => fetch(i, init));
  let cached: { token: string; expiresAt: number } | null = null;

  return async () => {
    if (cached && cached.expiresAt > Date.now() + 5000) return cached.token;
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${base64(`${opts.clientId}:${opts.clientSecret}`)}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    });
    if (!response.ok) {
      throw new Error(`Spotify token request failed: ${response.status}`);
    }
    const json = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    cached = {
      token: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return cached.token;
  };
}

export interface SpotifyConfig {
  /** Client for api.spotify.com (may be proxied). */
  http: HttpClient;
  /** Bearer token provider (client-credentials). */
  getAccessToken: () => Promise<string>;
  /** Client for the open.spotify.com embed scrape (proxied egress). Defaults to `http`. */
  embedHttp?: HttpClient;
  /** Required `market` for client-credentials search. */
  market?: string;
}

export function createSpotifyAdapter(config: SpotifyConfig): AdapterBundle {
  const market = config.market ?? "US";
  const embedHttp = config.embedHttp ?? config.http;

  async function authHeaders(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await config.getAccessToken()}` };
  }

  async function enrich(tracks: EmbedTrack[]): Promise<Map<string, SpotifyApiTrack>> {
    const ids = tracks.map((t) => t.id).filter(Boolean);
    const byId = new Map<string, SpotifyApiTrack>();
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const res = await config.http.getJson<SpotifyTracksResponse>(
        `${API}/tracks?ids=${batch.join(",")}&market=${market}`,
        { headers: await authHeaders() },
      );
      for (const track of res.tracks ?? []) {
        if (track?.id) byId.set(track.id, track);
      }
    }
    return byId;
  }

  const source: SourceAdapter = {
    platform: "spotify",
    matchesUrl: (url) => detectSource(url)?.platform === "spotify",
    async readPlaylist(url): Promise<CanonicalPlaylist> {
      const ref = detectSource(url);
      if (!ref || ref.platform !== "spotify") {
        throw new Error(`Not a Spotify playlist URL: ${url}`);
      }
      const html = await embedHttp.getText(
        `https://open.spotify.com/embed/playlist/${ref.id}`,
      );
      const parsed = parseSpotifyEmbed(html);

      // Best-effort enrichment for ISRC + album (improves cross-platform matching).
      let enriched = new Map<string, SpotifyApiTrack>();
      try {
        enriched = await enrich(parsed.tracks);
      } catch {
        // Enrichment is optional; the embed tracklist still works for matching.
      }

      const tracks: SourceTrack[] = parsed.tracks.map((t, position) => {
        const api = enriched.get(t.id);
        return {
          title: t.title,
          artists:
            api?.artists && api.artists.length > 0
              ? api.artists.map((a) => a.name ?? "").filter(Boolean)
              : t.artists,
          album: api?.album?.name,
          isrc: api?.external_ids?.isrc,
          durationMs: t.durationMs ?? api?.duration_ms,
          position,
          sourcePlatform: "spotify",
          sourceId: t.id,
          sourceUrl: t.id ? `https://open.spotify.com/track/${t.id}` : undefined,
        };
      });

      return {
        title: parsed.title,
        ownerName: parsed.ownerName,
        coverUrl: parsed.coverUrl,
        sourcePlatform: "spotify",
        sourceUrl: url,
        sourceId: ref.id,
        tracks,
      };
    },
  };

  const destination: DestinationSearch = {
    platform: "spotify",
    lookupByIsrc: async (isrc) => {
      const res = await config.http.getJson<SpotifySearchResponse>(
        `${API}/search?q=${encodeURIComponent(`isrc:${isrc}`)}&type=track&market=${market}&limit=10`,
        { headers: await authHeaders() },
      );
      return (res.tracks?.items ?? []).map(mapSpotifyCandidate);
    },
    search: async (query) => {
      const res = await config.http.getJson<SpotifySearchResponse>(
        `${API}/search?q=${encodeURIComponent(query)}&type=track&market=${market}&limit=10`,
        { headers: await authHeaders() },
      );
      return (res.tracks?.items ?? []).map(mapSpotifyCandidate);
    },
  };

  return { platform: "spotify", source, destination };
}
