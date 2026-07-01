#!/usr/bin/env node
/**
 * R1 spike: can we read a public Spotify playlist with no login by scraping the
 * embed page's __NEXT_DATA__? Run: `node scripts/spike-r1-spotify.mjs [playlistId]`
 *
 * Exits 0 WORKS, 2 BROKEN. Mirrors lib/adapters/spotify.ts:parseSpotifyEmbed so a
 * pass here validates the production parser against live data.
 */
const id = process.argv[2] || "37i9dQZF1DXcBWIGoYBM5M";
const url = `https://open.spotify.com/embed/playlist/${id}`;

const res = await fetch(url, {
  headers: {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
  },
});
const html = await res.text();
const m = html.match(
  /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
);
if (!m) {
  console.log(`R1 BROKEN: no __NEXT_DATA__ (status ${res.status}, ${html.length} bytes)`);
  process.exit(2);
}
const data = JSON.parse(m[1]);
const entity = data?.props?.pageProps?.state?.data?.entity;
const list = entity?.trackList ?? [];
if (!entity || list.length === 0) {
  console.log(`R1 DEGRADED: parsed JSON but no trackList (status ${res.status})`);
  process.exit(2);
}
console.log(
  `R1 WORKS: status=${res.status} title=${JSON.stringify(entity.name)} tracks=${list.length}`,
);
console.log(
  "first track:",
  JSON.stringify({
    title: list[0].title,
    subtitle: list[0].subtitle,
    duration: list[0].duration,
    uri: list[0].uri,
  }),
);
process.exit(0);
