/**
 * One-tap "Save to YouTube Music": GET /api/yt?p=<shortId>&b=<batch>
 *
 * Turns a playlist's resolved YouTube video ids into a real anonymous playlist
 * via the `watch_videos` trick and 302-redirects the recipient straight into
 * YouTube Music (`music.youtube.com/watch?v=…&list=…`, which loads the temp
 * playlist as the play queue with a one-tap Save).
 *
 * Why this runs on Vercel and not Convex: YouTube 429-blocks Convex's datacenter
 * egress with a `google.com/sorry` CAPTCHA, but Vercel's egress resolves the
 * redirect cleanly in ~1s. If resolution ever fails we fall back to the raw
 * `watch_videos` URL, which still builds a real playlist from the recipient's
 * own (residential, un-blocked) IP. Playlists over the ~50-track guest cap are
 * split into batches (`b` is 1-based).
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import {
  YT_GUEST_CAP,
  buildWatchVideosUrl,
  musicWatchUrl,
  parseTempPlaylistId,
} from "@/lib/adapters/watch-videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const shortId = url.searchParams.get("p");
  const batch = Math.max(1, Math.floor(Number(url.searchParams.get("b")) || 1));
  if (!shortId) return new Response("Missing playlist id", { status: 400 });

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return redirectTo("https://music.youtube.com/");

  let ids: string[] = [];
  try {
    const client = new ConvexHttpClient(convexUrl);
    ids = await client.query(api.resolutions.youtubePlaylistIds, { shortId });
  } catch {
    ids = [];
  }

  const slice = ids.slice((batch - 1) * YT_GUEST_CAP, batch * YT_GUEST_CAP);
  if (slice.length === 0) return redirectTo("https://music.youtube.com/");

  const rawUrl = buildWatchVideosUrl(slice);
  try {
    const res = await fetch(rawUrl, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": DESKTOP_UA, "accept-language": "en-US,en;q=0.9" },
    });
    const location = res.headers.get("location");
    const listId = location ? parseTempPlaylistId(location) : null;
    // The temp playlist opens in YouTube Music via the watch?v=…&list=… form
    // (the /playlist?list= page is blank for anonymous watch_videos playlists).
    if (listId) return redirectTo(musicWatchUrl(slice[0], listId));
  } catch {
    // fall through to the raw watch_videos fallback
  }

  // Fallback: the recipient's own browser resolves the redirect into a playlist.
  return redirectTo(rawUrl);
}
