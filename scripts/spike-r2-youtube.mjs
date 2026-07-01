#!/usr/bin/env node
/**
 * R2 spike: does music.youtube.com/watch_videos still resolve a temporary,
 * saveable playlist with no login, and how does it behave past the ~50 guest cap?
 * Run: `node scripts/spike-r2-youtube.mjs`
 *
 * A headless fetch can confirm the endpoint resolves (200 + a watch page); the
 * actual "Save" button is a logged-out UI affordance best confirmed in a browser
 * (spike-runner agent uses a browser MCP). Exits 0 if the endpoint responds.
 */
const ids = (process.argv[2] || "Kp7eSUU9oy8,dQw4w9WgXcQ,3JZ_D3ELwOQ").split(",");
const url = `https://music.youtube.com/watch_videos?video_ids=${ids.join(",")}`;

const res = await fetch(url, {
  redirect: "follow",
  headers: {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  },
});
const body = await res.text();
const looksLikePlayer =
  body.includes("watch_videos") ||
  body.includes("ytcfg") ||
  body.includes("INNERTUBE");
console.log(
  `R2: status=${res.status} finalUrl=${res.url} bytes=${body.length} playerMarkers=${looksLikePlayer}`,
);
console.log(
  "Chunking note: guest cap ~50 video_ids; OpenShare splits larger playlists into",
  Math.ceil(ids.length / 50),
  "batch(es) for this input (see lib/adapters/watch-videos.ts).",
);
process.exit(res.status >= 200 && res.status < 400 ? 0 : 2);
