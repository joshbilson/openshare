/**
 * YouTube Music no-login playlist builder.
 *
 * The `watch_videos` endpoint on **www.youtube.com** turns a list of video ids
 * into a real, anonymous temporary playlist: it 303-redirects to
 * `watch?v=…&list=TLGG…`. That `TLGG…` id is a genuine playlist.
 *
 * Opening it in YouTube Music is subtle: `music.youtube.com/playlist?list=TLGG…`
 * shows a BLANK page (YT Music doesn't support anonymous temp playlists as a
 * playlist page), but `music.youtube.com/watch?v=<firstId>&list=TLGG…` DOES load
 * the temp playlist as the play queue inside YouTube Music, with a one-tap Save.
 * So we always hand the recipient the `watch?v=…&list=…` form on the music
 * domain.
 *
 * Note: the `music.youtube.com/watch_videos` variant does NOT build a playlist —
 * it just opens the app — so playlist creation always goes through
 * www.youtube.com first. Guests are capped at ~50 videos per playlist, so larger
 * playlists are chunked into batches.
 */

/** Guest cap on a single watch_videos playlist. */
export const YT_GUEST_CAP = 50;

const WATCH_VIDEOS_BASE = "https://www.youtube.com/watch_videos";
const MUSIC_PLAYLIST_BASE = "https://music.youtube.com/playlist";
const MUSIC_WATCH_BASE = "https://music.youtube.com/watch";

/** Desktop UA — avoids consent interstitials on some datacenter egress IPs. */
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Headers that make a datacenter request look like a consenting US browser.
 * The `SOCS`/`CONSENT` cookies skip the EU consent interstitial that otherwise
 * swallows the watch_videos 303 (YouTube geolocates many datacenter IPs to the
 * consent-required region).
 */
export const YT_REQUEST_HEADERS: Record<string, string> = {
  "user-agent": DESKTOP_UA,
  "accept-language": "en-US,en;q=0.9",
  cookie: "SOCS=CAISNQgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+1",
};

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  const step = Math.max(1, Math.floor(size));
  for (let i = 0; i < items.length; i += step) {
    out.push(items.slice(i, i + step));
  }
  return out;
}

/** The raw watch_videos URL that builds an anonymous temp playlist on YouTube. */
export function buildWatchVideosUrl(videoIds: readonly string[]): string {
  return `${WATCH_VIDEOS_BASE}?video_ids=${videoIds.join(",")}`;
}

/**
 * A YouTube Music playlist-page URL. Works for real (`PL…`, `OLAK…`) playlists,
 * but NOT for anonymous `watch_videos` temp (`TLGG…`) playlists — use
 * {@link musicWatchUrl} for those.
 */
export function musicPlaylistUrl(listId: string): string {
  return `${MUSIC_PLAYLIST_BASE}?list=${encodeURIComponent(listId)}`;
}

/**
 * A YouTube Music URL that opens `videoId` playing with `listId` as the queue.
 * This is the form that loads anonymous `watch_videos` temp playlists inside
 * YouTube Music (the `/playlist?list=` page is blank for those).
 */
export function musicWatchUrl(videoId: string, listId: string): string {
  return `${MUSIC_WATCH_BASE}?v=${encodeURIComponent(videoId)}&list=${encodeURIComponent(listId)}`;
}

/**
 * Extract the temporary playlist id (`list=…`) from a watch_videos redirect —
 * accepts either a bare `Location` header or a fully-resolved watch URL.
 */
export function parseTempPlaylistId(locationOrUrl: string): string | null {
  if (!locationOrUrl) return null;
  try {
    const u = new URL(locationOrUrl, "https://www.youtube.com");
    const list = u.searchParams.get("list");
    return list && list.length > 0 ? list : null;
  } catch {
    const m = locationOrUrl.match(/[?&]list=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Resolve a set of YouTube video ids into a YouTube Music playlist URL by
 * creating an anonymous temp playlist via watch_videos and reading back its
 * `list` id. Returns `null` when the redirect can't be resolved so the caller
 * can fall back to the raw watch_videos URL. Video ids beyond the guest cap are
 * dropped — chunk the input first for large playlists.
 */
export async function resolveMusicPlaylistUrl(
  videoIds: readonly string[],
  fetchImpl: FetchLike,
): Promise<string | null> {
  const ids = videoIds
    .filter((id) => id && id.trim().length > 0)
    .slice(0, YT_GUEST_CAP);
  if (ids.length === 0) return null;

  const url = buildWatchVideosUrl(ids);
  const headers = YT_REQUEST_HEADERS;

  // Prefer a manual redirect so we don't download the (heavy) watch page.
  try {
    const res = await fetchImpl(url, { method: "GET", redirect: "manual", headers });
    const location = res.headers.get("location");
    const listId = location ? parseTempPlaylistId(location) : null;
    if (listId) return musicWatchUrl(ids[0], listId);
  } catch {
    // fall through to the follow-based attempt
  }

  // Fallback: follow the redirect and read the resolved watch URL's `list`.
  try {
    const res = await fetchImpl(url, { method: "GET", redirect: "follow", headers });
    const listId = parseTempPlaylistId(res.url);
    if (listId) return musicWatchUrl(ids[0], listId);
  } catch {
    // give up — caller falls back to the raw watch_videos URL
  }

  return null;
}
