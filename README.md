# OpenShare

**One playlist link that opens on every music app — no login, no account linking.**

You made a playlist on Spotify, your friend uses YouTube Music. Paste the link
into OpenShare and get a single universal link. When they open it they see the
full tracklist with deep links for Spotify, Apple Music, Deezer, and YouTube
Music — plus a one‑tap **Save to YouTube Music** that works without signing in.

Free and open source (MIT). No third‑party aggregator API; OpenShare owns its
own matching.

> **Forking is fully isolated from the live site.** This repo contains no
> deployment credentials, provider tokens, or project linking. A clone talks
> only to whatever `NEXT_PUBLIC_CONVEX_URL` you point it at, and writing to the
> canonical production backend requires a `CONVEX_DEPLOY_KEY` that is never
> committed. Running or deploying your own copy cannot affect the hosted
> instance. See [SECURITY.md](SECURITY.md).

## Docs

| Audience | Start here |
| --- | --- |
| **Humans** | This README, then [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). |
| **AI agents** | [CLAUDE.md](CLAUDE.md) (stack, frozen contract, conventions) then [AGENTS.md](AGENTS.md) (learned context). |
| **Design rationale** | [`docs/superpowers/specs/2026-06-30-openshare-design.md`](docs/superpowers/specs/2026-06-30-openshare-design.md) and the [feasibility spikes](docs/spikes/2026-06-30-r1-r2-feasibility.md). |

---

## How it works (and why no login is possible)

| Step | Approach |
| --- | --- |
| **Read the source playlist** | Public reads only. Spotify is read by scraping its embed page (`__NEXT_DATA__`); Apple Music via a MusicKit developer token; Deezer and YouTube Music via their public/unofficial endpoints. No user OAuth. |
| **Match tracks across platforms** | An in‑house engine. ISRC‑first, then a fuzzy fallback ladder (metadata → artist → text) scored with weighted Jaro‑Winkler and special‑term guards. Threshold 0.70. |
| **Create on the destination** | Native no‑login playlist creation doesn't exist for Spotify/Apple, so recipients get a web page of deep links. YouTube Music uses the undocumented `watch_videos` trick to produce a real, saveable playlist (chunked at 50 for the guest cap) — see below. |
| **Own your data** | Every playlist exports to a portable, versioned JSON file you can re‑import and re‑share anywhere. |

Both novel pieces (Spotify no‑login scrape, YouTube `watch_videos` save) were
validated against live endpoints — see
[`docs/spikes/2026-06-30-r1-r2-feasibility.md`](docs/spikes/2026-06-30-r1-r2-feasibility.md).

### One‑tap "Save to YouTube Music"

This is the MVP, and it has some hard‑won subtleties baked into the code:

1. The recipient page links to a same‑origin route, [`app/api/yt/route.ts`](app/api/yt/route.ts)
   (`/api/yt?p={shortId}`), not directly to YouTube.
2. That route (Node runtime, on Vercel) fetches
   `https://www.youtube.com/watch_videos?video_ids=…` and reads the `303`
   redirect, which contains a genuine anonymous playlist id (`list=TLGG…`).
   This resolution runs **from Vercel, not Convex** — Convex's datacenter egress
   IP is CAPTCHA/`429`‑blocked by Google for this endpoint, whereas Vercel's is
   not.
3. It then redirects the recipient to
   `https://music.youtube.com/watch?v=<firstId>&list=<TLGG…>`. This `watch?v=…&list=…`
   form loads the temp playlist as the play queue **inside YouTube Music** with a
   one‑tap **Save**. (The `music.youtube.com/playlist?list=TLGG…` page is blank
   for anonymous temp playlists, which is why we don't use it.)

Known limitation: guest playlists have no custom title — YouTube shows them as
"Untitled List". Naming requires a login, which OpenShare deliberately avoids.

## Architecture

- **`lib/contract/`** — frozen shared contract: canonical `Track`/`Playlist`
  types, the JSON interchange Zod schema, source/destination adapter
  interfaces, and URL detection. Everything imports from here.
- **`lib/matching/`** — the scorer + 4‑step fallback ladder (pure, fully tested).
- **`lib/adapters/`** — Spotify / Apple Music / Deezer / YouTube adapters behind
  the frozen interfaces, plus the `watch_videos` builder. HTTP is injected so
  adapters are unit‑testable offline.
- **`lib/resolve/`** — orchestrates per‑track resolution with bounded
  concurrency and an ISRC cache.
- **`convex/`** — reactive backend: playlist storage, the background resolution
  action (fan‑out + per‑host throttling + cache), live progress, `/share` +
  `/import` HTTP actions for the iOS Shortcut/PWA, abuse counters, and a daily
  cleanup cron.
- **`app/` + `components/`** — Next.js App Router UI: the share page, the live
  recipient page `/p/{id}`, the install guide, the Android Web Share Target
  (`app/share-target/`), and the server‑side "Save to YouTube Music" resolver
  (`app/api/yt/`).

## Tech stack

Next.js 16 (App Router, React 19) · Convex · TypeScript · Zod · Tailwind v4 ·
Vitest. Deployed on Vercel + Convex.

## Local development

```bash
npm install
cp .env.example .env.local        # fill in NEXT_PUBLIC_CONVEX_URL after the next step
npx convex dev                    # provisions a dev deployment, writes convex/_generated, runs functions
npm run dev                       # Next.js on http://localhost:3000
```

Set server secrets on the Convex deployment (never in the client bundle):

```bash
npx convex env set SPOTIFY_CLIENT_ID xxxx
npx convex env set SPOTIFY_CLIENT_SECRET xxxx
npx convex env set APPLE_MUSIC_TEAM_ID xxxx
npx convex env set APPLE_MUSIC_KEY_ID xxxx
npx convex env set APPLE_MUSIC_PRIVATE_KEY "$(cat AuthKey_XXXX.p8)"
npx convex env set SCRAPING_PROXY_URL xxxx     # optional but recommended
npx convex env set SCRAPING_PROXY_KEY xxxx
```

OpenShare degrades gracefully: any adapter whose credentials are absent is
simply skipped. Deezer needs no keys at all.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm test` | Vitest unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next core‑web‑vitals + TS) |
| `npm run convex:dev` | Convex dev server / codegen |

## Deploy

The repo is configured for the standard Vercel + Convex flow. `vercel.json`
sets the build command to `npx convex deploy --cmd 'npm run build'`, which
pushes Convex functions and then builds the Next.js app in one step.

1. Import the repo into **your own** Vercel project.
2. Add `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`,
   `NEXT_PUBLIC_SITE_URL`, and `CONVEX_DEPLOY_KEY` as Vercel env vars. The deploy
   key comes from *your* Convex project and is the only thing that grants write
   access to a deployment — keep it out of the repo.
3. Set the server secrets above on your production Convex deployment.

Because none of these values live in the repo, your fork is a completely
independent instance.

## Abuse & cost controls

- Per‑IP rate limiting on the share/import HTTP endpoints.
- PII‑free event counters (`shareEvents`) for cost visibility.
- A daily cron prunes playlists past the retention window.

## Sharing from your phone

See [`/install`](app/install/page.tsx) in the running app for the iOS Shortcut
recipe and Android PWA install / share‑sheet steps.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the dev
setup, the frozen‑contract rule, coding conventions, and the one‑command verify
gate (`npm run typecheck && npm test && npm run lint && npm run build`). Report
security issues privately per [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The matching engine design is adapted from the open‑source
[`playlistor`](https://github.com/akornor/playlistor) and
[`unitunes`](https://github.com/platelminto/unitunes) projects; OpenShare
reimplements the ideas rather than vendoring their code.
