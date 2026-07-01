# Contributing to OpenShare

Thanks for your interest! OpenShare is a free, zero‑login, cross‑platform
playlist sharer. This guide covers how to get set up, the conventions the code
holds itself to, and how to get a change merged.

If you use an AI coding agent, point it at [`CLAUDE.md`](CLAUDE.md) (stack,
frozen contract, conventions) and [`AGENTS.md`](AGENTS.md) (learned context)
first — they encode most of what's below in a machine‑friendly form.

## Getting set up

```bash
npm install
cp .env.example .env.local     # fill in NEXT_PUBLIC_CONVEX_URL after `convex dev`
npx convex dev                 # provisions YOUR dev deployment + writes convex/_generated
npm run dev                    # http://localhost:3000
```

`npx convex dev` creates a **personal** dev deployment under your own Convex
account — it never touches the hosted production instance. Adapter credentials
(Spotify, Apple, proxy, YouTube Data API) are optional: any adapter whose
secrets are absent is skipped, and Deezer needs no keys, so you can develop the
whole flow with zero credentials.

Server secrets go on the Convex deployment, **never** in the client bundle or a
committed file:

```bash
npx convex env set SPOTIFY_CLIENT_ID xxxx
npx convex env set SPOTIFY_CLIENT_SECRET xxxx
# …see .env.example for the full list
```

## The verify gate

Every change must pass, in one line:

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Please run this before opening a PR. There's nothing exotic here — just fast
feedback. Unit tests use Vitest and must run **offline**: pure logic (matching
engine, JSON, URL detection, `watch_videos` builder) takes an injected
`fetch`‑like function so it can be tested against fixtures with no network.

## Conventions

These are enforced by review (and some by lint/types):

- **Import the frozen contract, don't fork it.** `lib/contract/` holds the
  canonical `Track`/`Playlist` types, the Zod JSON‑format schema, the
  source/destination adapter interfaces, and URL detection. `convex/schema.ts`
  is the data model. Everything codes *against* these. If you think the contract
  is wrong, open an issue to discuss it — don't quietly diverge in your slice.
- **Imports at the top of the module.** No inline `import()` / `require()` in
  function bodies unless there's a documented circular‑dependency reason.
- **Exhaustive `switch`.** When switching over a union or enum, add a `never`
  check in the `default` case so a new variant fails to compile until handled.
- **Injected I/O for pure logic.** Keep network/time/randomness out of the
  matching engine and other pure modules; pass them in so tests stay offline.
- **Secrets stay server‑side (Convex env).** The client bundle must never hold
  platform credentials. This is an explicit anti‑pattern we avoid.
- **No `createPlaylist`.** Writing to Spotify/Apple requires login, which the
  product forbids. Destination output is recipient assembly: a web page of deep
  links, the YouTube `watch_videos` save flow, or JSON export.

## Project layout

- `lib/contract/` — frozen shared contract (types, JSON schema, adapter
  interfaces, URL detection).
- `lib/matching/` — the scorer + 4‑step fallback ladder (pure, fully tested).
- `lib/adapters/` — Spotify / Apple Music / Deezer / YouTube adapters + the
  `watch_videos` builder, behind the frozen interfaces.
- `lib/resolve/` — per‑track resolution orchestration (bounded concurrency,
  ISRC cache).
- `convex/` — reactive backend (storage, background resolution, HTTP actions,
  abuse counters, cleanup cron).
- `app/` + `components/` — Next.js App Router UI, the Web Share Target, and the
  server‑side `/api/yt` "Save to YouTube Music" resolver.

`reference repos/` (local prior art) is git‑ignored and must **not** be built
into the app.

## Pull requests

1. Branch from `master`.
2. Keep PRs focused; write a clear description of the *why*.
3. Make sure the verify gate passes and add/adjust tests for behaviour changes.
4. If you touch adapters or the matching engine, note how you validated it
   (fixtures, and — for the fragile scraping paths — a real‑endpoint check).

## Reporting bugs & security issues

- Functional bugs: open a GitHub issue with steps to reproduce and the source
  playlist URL/platform involved.
- Security vulnerabilities: **do not** open a public issue — follow
  [SECURITY.md](SECURITY.md).
