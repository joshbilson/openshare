/**
 * Deezer adapter — fully keyless (no token, no login).
 *
 * Source: GET /playlist/{id} (+ paginated /tracks). Destination: ISRC lookup via
 * /track/isrc:{isrc} and free-text via /search/track. Mappers are exported pure
 * for fixture tests.
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

const API = "https://api.deezer.com";

interface DeezerArtist {
  name?: string;
}
interface DeezerAlbum {
  title?: string;
  cover_xl?: string;
}
export interface DeezerTrack {
  id?: number | string;
  title?: string;
  duration?: number; // seconds
  link?: string;
  preview?: string;
  isrc?: string;
  artist?: DeezerArtist;
  contributors?: DeezerArtist[];
  album?: DeezerAlbum;
  error?: { type?: string; message?: string };
}
interface DeezerPlaylist {
  id?: number | string;
  title?: string;
  picture_xl?: string;
  nb_tracks?: number;
  creator?: { name?: string };
  tracks?: { data?: DeezerTrack[]; next?: string };
  error?: { type?: string; message?: string };
}
interface DeezerTracksPage {
  data?: DeezerTrack[];
  next?: string;
}
interface DeezerSearch {
  data?: DeezerTrack[];
}

function artistsOf(track: DeezerTrack): string[] {
  if (track.contributors && track.contributors.length > 0) {
    return track.contributors.map((c) => c.name ?? "").filter(Boolean);
  }
  return track.artist?.name ? [track.artist.name] : [];
}

export function mapDeezerCandidate(track: DeezerTrack): SearchCandidate {
  return {
    title: track.title ?? "",
    artists: artistsOf(track),
    album: track.album?.title,
    durationMs:
      typeof track.duration === "number" ? track.duration * 1000 : undefined,
    isrc: track.isrc,
    platform: "deezer",
    url: track.link ?? `https://www.deezer.com/track/${track.id}`,
    externalId: String(track.id ?? ""),
    previewUrl: track.preview || undefined,
  };
}

export function mapDeezerSourceTrack(
  track: DeezerTrack,
  position: number,
): SourceTrack {
  return {
    title: track.title ?? "",
    artists: artistsOf(track),
    album: track.album?.title,
    durationMs:
      typeof track.duration === "number" ? track.duration * 1000 : undefined,
    isrc: track.isrc,
    position,
    sourcePlatform: "deezer",
    sourceId: String(track.id ?? ""),
    sourceUrl: track.link,
  };
}

export function createDeezerAdapter(http: HttpClient): AdapterBundle {
  const source: SourceAdapter = {
    platform: "deezer",
    matchesUrl: (url) => detectSource(url)?.platform === "deezer",
    async readPlaylist(url): Promise<CanonicalPlaylist> {
      const ref = detectSource(url);
      if (!ref || ref.platform !== "deezer") {
        throw new Error(`Not a Deezer playlist URL: ${url}`);
      }
      const playlist = await http.getJson<DeezerPlaylist>(
        `${API}/playlist/${ref.id}`,
      );
      if (playlist.error) {
        throw new Error(
          `Deezer playlist error: ${playlist.error.message ?? playlist.error.type}`,
        );
      }

      const tracks: DeezerTrack[] = [...(playlist.tracks?.data ?? [])];
      let next = playlist.tracks?.next;
      // Follow pagination cursors for large playlists.
      while (next) {
        const page = await http.getJson<DeezerTracksPage>(next);
        tracks.push(...(page.data ?? []));
        next = page.next;
        if (tracks.length > 10000) break; // safety bound
      }

      return {
        title: playlist.title ?? "Deezer playlist",
        ownerName: playlist.creator?.name,
        coverUrl: playlist.picture_xl,
        sourcePlatform: "deezer",
        sourceUrl: url,
        sourceId: String(playlist.id ?? ref.id),
        tracks: tracks.map((t, i) => mapDeezerSourceTrack(t, i)),
      };
    },
  };

  const destination: DestinationSearch = {
    platform: "deezer",
    lookupByIsrc: async (isrc) => {
      const track = await http.getJson<DeezerTrack>(
        `${API}/track/isrc:${encodeURIComponent(isrc)}`,
      );
      if (track.error || !track.id) return [];
      return [mapDeezerCandidate(track)];
    },
    search: async (query) => {
      const res = await http.getJson<DeezerSearch>(
        `${API}/search/track?q=${encodeURIComponent(query)}&limit=10`,
      );
      return (res.data ?? []).map(mapDeezerCandidate);
    },
  };

  return { platform: "deezer", source, destination };
}
