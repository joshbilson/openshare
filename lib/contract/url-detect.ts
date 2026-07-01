/**
 * OpenShare frozen contract — source URL detection.
 *
 * Pure function: given any pasted/shared string, identify the source platform,
 * extract the playlist id, and produce a stable normalized key used for dedupe.
 */

import type { Platform } from "./types";

export interface SourceRef {
  platform: Platform;
  id: string;
  /** Stable canonical key for deduping the same playlist across URL variants. */
  normalizedUrl: string;
}

function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function ref(platform: Platform, id: string): SourceRef {
  return { platform, id, normalizedUrl: `${platform}:playlist:${id}` };
}

const SPOTIFY_URI = /^spotify:playlist:([A-Za-z0-9]{22})$/;
const SPOTIFY_PATH = /\/playlist\/([A-Za-z0-9]{22})/;
const APPLE_PATH = /\/playlist\/(?:[^/]+\/)?(pl\.[A-Za-z0-9_-]+)/;
const DEEZER_PATH = /\/playlist\/(\d+)/;

/**
 * Detect the source platform and playlist id, or null if unsupported/unparseable.
 * Handles Spotify (URL + `spotify:` URI + intl- locale paths), Apple Music
 * (catalog + `pl.u-` user playlists, with or without a slug segment), YouTube /
 * YouTube Music (`?list=`), and Deezer (numeric id).
 */
export function detectSource(raw: string): SourceRef | null {
  const input = (raw ?? "").trim();
  if (!input) return null;

  const uri = input.match(SPOTIFY_URI);
  if (uri) return ref("spotify", uri[1]);

  let url: URL;
  try {
    url = new URL(hasScheme(input) ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname;

  if (host === "open.spotify.com" || host === "spotify.com") {
    const m = path.match(SPOTIFY_PATH);
    return m ? ref("spotify", m[1]) : null;
  }

  if (host === "music.apple.com" || host === "geo.music.apple.com") {
    const m = path.match(APPLE_PATH);
    if (m) return ref("appleMusic", m[1]);
    const last = path.split("/").filter(Boolean).pop();
    return last && last.startsWith("pl.") ? ref("appleMusic", last) : null;
  }

  if (
    host === "music.youtube.com" ||
    host === "youtube.com" ||
    host === "m.youtube.com"
  ) {
    const list = url.searchParams.get("list");
    return list ? ref("youtubeMusic", list) : null;
  }

  if (host === "deezer.com" || host === "link.deezer.com") {
    const m = path.match(DEEZER_PATH);
    return m ? ref("deezer", m[1]) : null;
  }

  return null;
}

/** Convenience: just the platform, or null. */
export function detectPlatform(raw: string): Platform | null {
  return detectSource(raw)?.platform ?? null;
}
