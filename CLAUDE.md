# OpenShare — agent context

Free, open-source, **zero-login** cross-platform playlist sharer. Paste a public
Spotify / Apple Music / YouTube Music playlist URL, get one universal
`openshare.link/p/{id}` link in ~1s. The recipient page works on any platform and can
Save a native YouTube Music playlist with no login.

Design spec (source of truth): `docs/superpowers/specs/2026-06-30-openshare-design.md`.

## Stack

- Next.js 16 (App Router, RSC-first) on Vercel
- Convex (reactive DB, actions, Workflow `@convex-dev/workflow`, Rate Limiter
  `@convex-dev/rate-limiter`, cron, HTTP actions)
- TypeScript end-to-end · Zod v4 validation · Vitest · Tailwind v4 · ESLint flat config

## Frozen contract (do not fork these — import them)

- `lib/contract/types.ts` — canonical `Track` / `Playlist`, `Platform`, `ResolvedLink`.
- `lib/contract/json-format.ts` — Zod schema for the portable JSON interchange format.
- `lib/contract/adapter.ts` — `SourceAdapter` / `DestinationAdapter` interfaces.
- `lib/contract/url-detect.ts` — source platform detection + id extraction.
- `convex/schema.ts` — Convex data model.

Everything codes **against** these. If you believe the contract is wrong, stop and flag
it rather than editing it in your slice.

## Conventions

- No inline imports — imports go at the top of the module.
- Exhaustive `switch` over unions/enums with a `never` default.
- Pure logic (matching engine, JSON, url-detect, watch_videos builder) takes **injected**
  I/O (a `fetch`-like fn) so it is unit-testable offline with fixtures. No network in unit
  tests.
- **Secrets stay server-side in Convex env** (`npx convex env set ...`). The client bundle
  never holds platform credentials — this is an explicit anti-pattern we avoid.
- There is deliberately **no `createPlaylist`**: writing to Spotify/Apple needs login.
  Destination output is recipient assembly (web page, `watch_videos` URL, JSON export).

## Repo notes

- `reference repos/` is read-only prior art (playlistor, universal-playlist-generator).
  Do not build into it; it is ignored at `reference repos/_extracted/`.
- Verify with: `npm run typecheck && npm test && npm run lint && npm run build`.
