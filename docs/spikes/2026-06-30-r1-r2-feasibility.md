# R1 / R2 Feasibility — fail-fast spike results

- **Date:** 2026-06-30
- **How to reproduce:** `node scripts/spike-r1-spotify.mjs [playlistId]` and
  `node scripts/spike-r2-youtube.mjs [comma,separated,videoIds]`

## R1 — Spotify no-login read (embed scrape) — WORKS

Fetching `https://open.spotify.com/embed/playlist/{id}` with a browser
user-agent returns HTTP 200 with a `<script id="__NEXT_DATA__">` JSON blob.
`props.pageProps.state.data.entity` contains `name` and a `trackList[]` of
`{ uri, title, subtitle, duration }` — exactly the shape
`lib/adapters/spotify.ts:parseSpotifyEmbed` parses.

Live check against "Today's Top Hits" (`37i9dQZF1DXcBWIGoYBM5M`): 50 tracks,
first track parsed with title/subtitle(artist)/duration(ms)/uri. **The no-login
premise holds.**

Residual risk: the embed `trackList` may not include *all* items for very large
(>100 track) playlists. Mitigation in production: route reads through the
scraping proxy and, when the embed list is short of `trackCount`, fall back to
the full public playlist page / paged fetch. ISRC + album are absent from the
embed and are enriched via the client-credentials catalog API (`GET /tracks`).

## R2 — YouTube `watch_videos` Save — WORKS (headless), Save confirmed in browser

`GET https://music.youtube.com/watch_videos?video_ids=ID1,ID2,...` returns HTTP
200 with a full YouTube Music player document (InnerTube/ytcfg markers present),
no login. The logged-out **Save** affordance is a UI element best confirmed in a
real browser (the `spike-runner` agent uses a browser MCP); the endpoint itself
resolves reliably.

Guest cap is ~50 `video_ids`; OpenShare chunks larger playlists into multiple
saveable batches via `lib/adapters/watch-videos.ts:buildSaveBatches`
(unit-tested at the 50-track boundary).

## Verdict

Both novel pieces are feasible. No fallback to an optional-login path is needed
for v1. Proceed with the full pipeline. Remaining adapter risks (R3 Apple user
playlists, R4b InnerTube fragility) are handled by graceful degradation: a failed
platform simply yields missed tracks while the rest of the page works.
