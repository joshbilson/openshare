# OpenShare — agent memory

Durable, learned context. Read `CLAUDE.md` first for stack/contract/conventions; this file only adds what isn't there.

## Learned User Preferences

- Prefers fully autonomous, parallelized builds (many git worktrees / parallel agent teams, single phase) that run to completion — don't stop until every todo is done.
- Wants to own the infrastructure and avoid third-party API dependencies ("we want to be in control") — favor first-party implementations over external services even when it's more work.
- Core MVP is one-tap whole-playlist sharing; don't reframe the product around saving individual songs.

## Learned Workspace Facts

- Deploys to Vercel project `happy-pixels/openshare`, with several Vercel Marketplace integrations enabled.
- Matching is first-party (Odesli was dropped after it deprecated): ISRC-first join across platforms plus a text-similarity fallback scorer; below the confidence threshold, surface a manual search link instead of forcing a match.
- YouTube Music destination search uses InnerTube (`music.youtube.com/youtubei/v1`, keyless) directly; it works fine from Convex's egress IP. The YouTube Data API is only a quota-safe *fallback* for that search (~100 searches/day) — it is read-only, CANNOT create playlists, and its key must be set in **Convex** env (`YOUTUBE_API_KEY`), because the Vercel var is "Sensitive" and can't be pulled back. Never hardcode/commit the value.
- Source playlists are read by scraping public pages for Spotify/Apple (their APIs are locked/need login), with a Firecrawl fallback — the most fragile part of the pipeline.
- Recipient one-tap "Save to YouTube Music" (the MVP): resolve the `watch_videos` redirect **from Vercel** (a Next.js route, `/api/yt`) — NOT from Convex, whose datacenter IP is 429/CAPTCHA-blocked by Google (`google.com/sorry`) for `watch_videos`. To open the resulting anonymous temp (`TLGG…`) playlist in YouTube Music, redirect to `music.youtube.com/watch?v=<firstId>&list=<TLGG>` (loads it as the play queue with a one-tap Save); the `/playlist?list=` page is BLANK for temp playlists, and it caps at ~50 guest tracks (chunk into batches). The temp playlist has no custom title ("Untitled List") — an accepted limitation (titling needs login).
- Entry points are web-first: Next.js web app + iOS Shortcut + Android PWA Web Share Target; no native apps in v1.
