/**
 * Apple Music adapter.
 *
 * Catalog content is no-login readable with only a developer token (ES256 JWT
 * signed with a MusicKit p8 key — no user token). Source: GET
 * /v1/catalog/{sf}/playlists/{id} (+ tracks pagination). Destination: ISRC via
 * filter[isrc] and free-text via /search. Mappers exported pure for tests.
 */

import { SignJWT, importPKCS8 } from "jose";
import type { DestinationSearch, SourceAdapter } from "../contract/adapter";
import type {
  CanonicalPlaylist,
  SearchCandidate,
  SourceTrack,
} from "../contract/types";
import { detectSource } from "../contract/url-detect";
import type { HttpClient } from "./http";
import type { AdapterBundle } from "./types";

const API = "https://api.music.apple.com";

interface AppleSong {
  id?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    isrc?: string;
    url?: string;
    previews?: { url?: string }[];
  };
}
interface ApplePlaylistResponse {
  data?: {
    attributes?: {
      name?: string;
      curatorName?: string;
      artwork?: { url?: string };
    };
    relationships?: { tracks?: { data?: AppleSong[]; next?: string } };
  }[];
}
interface AppleTracksPage {
  data?: AppleSong[];
  next?: string;
}
interface AppleSongsResponse {
  data?: AppleSong[];
}
interface AppleSearchResponse {
  results?: { songs?: { data?: AppleSong[] } };
}

export function mapAppleCandidate(song: AppleSong): SearchCandidate {
  const a = song.attributes ?? {};
  return {
    title: a.name ?? "",
    artists: a.artistName ? [a.artistName] : [],
    album: a.albumName,
    durationMs: a.durationInMillis,
    isrc: a.isrc,
    platform: "appleMusic",
    url: a.url ?? "",
    externalId: song.id ?? "",
    previewUrl: a.previews?.[0]?.url,
  };
}

export function mapAppleSourceTrack(song: AppleSong, position: number): SourceTrack {
  const a = song.attributes ?? {};
  return {
    title: a.name ?? "",
    artists: a.artistName ? [a.artistName] : [],
    album: a.albumName,
    durationMs: a.durationInMillis,
    isrc: a.isrc,
    position,
    sourcePlatform: "appleMusic",
    sourceId: song.id ?? "",
    sourceUrl: a.url,
  };
}

/** Storefront from an Apple Music URL (e.g. /us/…), defaulting to `us`. */
export function extractAppleStorefront(url: string, fallback = "us"): string {
  try {
    const { pathname } = new URL(url);
    const first = pathname.split("/").filter(Boolean)[0];
    if (first && /^[a-z]{2}$/i.test(first)) return first.toLowerCase();
  } catch {
    // fall through
  }
  return fallback;
}

/** Cached ES256 developer-token provider signed from a MusicKit p8 key. */
export function createAppleTokenProvider(opts: {
  teamId: string;
  keyId: string;
  /** PKCS8 PEM contents of the .p8 key. */
  privateKey: string;
  ttlSeconds?: number;
}): () => Promise<string> {
  let cached: { token: string; expiresAt: number } | null = null;
  const ttl = opts.ttlSeconds ?? 60 * 60 * 12;

  return async () => {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const key = await importPKCS8(opts.privateKey, "ES256");
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: opts.keyId })
      .setIssuer(opts.teamId)
      .setIssuedAt(now)
      .setExpirationTime(now + ttl)
      .sign(key);
    cached = { token, expiresAt: (now + ttl) * 1000 };
    return token;
  };
}

export interface AppleConfig {
  http: HttpClient;
  getDeveloperToken: () => Promise<string>;
  defaultStorefront?: string;
}

export function createAppleAdapter(config: AppleConfig): AdapterBundle {
  const defaultStorefront = config.defaultStorefront ?? "us";

  async function authHeaders(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await config.getDeveloperToken()}` };
  }

  const source: SourceAdapter = {
    platform: "appleMusic",
    matchesUrl: (url) => detectSource(url)?.platform === "appleMusic",
    async readPlaylist(url): Promise<CanonicalPlaylist> {
      const ref = detectSource(url);
      if (!ref || ref.platform !== "appleMusic") {
        throw new Error(`Not an Apple Music playlist URL: ${url}`);
      }
      const storefront = extractAppleStorefront(url, defaultStorefront);
      const headers = await authHeaders();

      const res = await config.http.getJson<ApplePlaylistResponse>(
        `${API}/v1/catalog/${storefront}/playlists/${ref.id}`,
        { headers },
      );
      const entity = res.data?.[0];
      if (!entity) throw new Error(`Apple playlist not found: ${ref.id}`);

      const songs: AppleSong[] = [
        ...(entity.relationships?.tracks?.data ?? []),
      ];
      let next = entity.relationships?.tracks?.next;
      while (next) {
        const page = await config.http.getJson<AppleTracksPage>(`${API}${next}`, {
          headers,
        });
        songs.push(...(page.data ?? []));
        next = page.next;
        if (songs.length > 10000) break;
      }

      return {
        title: entity.attributes?.name ?? "Apple Music playlist",
        ownerName: entity.attributes?.curatorName,
        coverUrl: entity.attributes?.artwork?.url
          ?.replace("{w}", "640")
          .replace("{h}", "640"),
        sourcePlatform: "appleMusic",
        sourceUrl: url,
        sourceId: ref.id,
        tracks: songs.map((s, i) => mapAppleSourceTrack(s, i)),
      };
    },
  };

  const destination: DestinationSearch = {
    platform: "appleMusic",
    lookupByIsrc: async (isrc) => {
      const res = await config.http.getJson<AppleSongsResponse>(
        `${API}/v1/catalog/${defaultStorefront}/songs?filter[isrc]=${encodeURIComponent(isrc)}`,
        { headers: await authHeaders() },
      );
      return (res.data ?? []).map(mapAppleCandidate);
    },
    search: async (query) => {
      const res = await config.http.getJson<AppleSearchResponse>(
        `${API}/v1/catalog/${defaultStorefront}/search?types=songs&limit=10&term=${encodeURIComponent(query)}`,
        { headers: await authHeaders() },
      );
      return (res.results?.songs?.data ?? []).map(mapAppleCandidate);
    },
  };

  return { platform: "appleMusic", source, destination };
}
