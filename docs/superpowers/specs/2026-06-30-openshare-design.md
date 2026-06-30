# OpenShare — Design Spec

- **Status:** Approved for planning
- **Date:** 2026-06-30
- **Owner:** Joshua
- **License intent:** Free and open source

## 1. Problem & Goal

People on different music streaming services can't easily share playlists. A Spotify
playlist link doesn't open for a YouTube Music user, and vice versa. Existing
converters require the user to log in and link their streaming accounts, and the
dominant link aggregator (Odesli/Songlink) is **sunsetting its public API at the end of
July 2026**.

**Goal:** A free, open-source, zero-login, cross-platform playlist sharer. A sharer taps
"share" on a playlist and gets one universal **OpenShare link** in ~1 second. Anyone who
opens that link sees a beautiful playlist page that works on any platform, and on
YouTube Music can save a real native playlist — all with **no logins or account linking
for anyone**.

### Success criteria (v1)

- Given a public Spotify, Apple Music, or YouTube Music playlist URL, OpenShare returns
  a shareable `openshare.link/p/{id}` link in ~1 second.
- The recipient page renders the full tracklist immediately and fills in cross-platform
  matches live as background resolution completes.
- A YouTube Music recipient can open and **Save** a native playlist with no login
  (chunked into ~50-track batches as needed).
- Spotify / Apple / other recipients get one-tap deep links per track plus previews.
- No login or account linking is required from the sharer or the recipient.
- Portable JSON export and import/re-share are available.

### Non-goals (v1) — YAGNI

No user accounts, no platform OAuth/linking, no native app-store apps, no playlist
editing, no two-way sync, no analytics dashboards, no monetization. (Last.fm "taste
overlap" enrichment and a playlist-vs-playlist Jaccard similarity stat are explicitly
parked as future extras.)

## 2. Constraints discovered during research

These shape the entire design and are load-bearing.

- **Spotify playlist reading is locked down (Feb 2026).** `GET /playlists/{id}/items`
  returns 403 for any playlist the caller doesn't own; client-credentials access to
  other users' playlists is gone. Full access is restricted to commercial partners with
  25k+ MAU. **Implication:** reading a Spotify playlist with no login requires scraping
  the public playlist/embed page. This is risk R1.
- **Spotify search still works app-only.** `GET /search?q=isrc:...&type=track&market=US`
  works with client-credentials. The track/album `external_ids` (ISRC) field was briefly
  removed in Feb 2026 but **reverted in March 2026**, so ISRC is available. Caveats:
  `limit` max is now 10 (paginate), `market` is required for client-credentials, and the
  app owner needs Spotify Premium.
- **Apple Music is no-login readable for catalog content.** `GET
  /v1/catalog/{storefront}/playlists/{id}` and `GET
  /v1/catalog/{storefront}/songs?filter[isrc]=...` work with only a **developer token**
  (ES256 JWT signed with a MusicKit p8 key; no user token). Reading publicly-shared
  *user* playlists (`pl.u-...`) still needs validation — risk R3.
- **Writing playlists into Spotify/Apple requires the recipient to log in.** There is no
  no-login way to create a playlist on a recipient's Spotify or Apple account. This is
  why the universal recipient experience is the OpenShare web page, not an
  auto-created native playlist on those platforms.
- **YouTube Music supports a no-login playlist trick.**
  `music.youtube.com/watch_videos?video_ids=ID1,ID2,...` creates a temporary playlist
  with a Save button, no account required. Guest cap is ~50 videos; larger playlists are
  chunked. Undocumented — risk R2.
- **YouTube can be searched without an API key/quota** via the InnerTube API (using a
  maintained client such as `youtubei.js`), avoiding the 100-searches/day Data API quota.
  YouTube tracks have no ISRC, so matching is text-based and scored. InnerTube is
  unofficial — risk R4b.
- **We own matching; no third-party aggregator.** Every destination platform exposes
  ISRC lookup (Spotify, Apple, Deezer) or keyless search (YouTube InnerTube; Deezer is
  fully keyless). The ISRC→platform mapping cache becomes our own asset and gets faster
  and cheaper as it grows.

## 3. Prior art leveraged

- **`akornor/playlistor`** (Python/Django/Celery, ~669★, playlistor.io) — Spotify ↔ Apple
  Music converter. We port its **matching engine** (scorer + search fallback ladder) and
  its **unified Track/adapter model**. It confirms our no-login constraints: it reads
  Spotify only via a logged-in user's OAuth token, reads Apple catalog with just a
  developer token, and requires login to create playlists on either side. Its scorer is
  adapted from `platers/unitunes`, which also handles YouTube Music.
- **`universal-playlist-generator`** (Next.js 16 / React 19 / Tailwind v4) — source of the
  **portable JSON interchange format** (export + import) and the share-panel UX. Its
  anti-pattern (shipping API secrets to the client bundle) is explicitly avoided.
- **`Crossfade`** (FastAPI/Last.fm) — parked ideas: Last.fm no-login enrichment and
  Jaccard set-overlap for a future "how much do your tastes match?" stat. Jaccard is not
  used for track-to-track matching.

## 4. Architecture overview

```
Clients                         Edge/App (Vercel)              Backend (Convex)            External
─────────────────────────────────────────────────────────────────────────────────────────────────
Web app / PWA  ───────────────▶ Next.js App Router    ──────▶ queries/mutations/actions ─▶ Spotify API (search/ISRC)
iOS Shortcut (share sheet) ───▶  - recipient pages     HTTP    - playlists / tracks DB     Apple Music API (catalog/ISRC)
Android Web Share Target ─────▶  - share UI            actions - trackLinks cache (asset)  Deezer API (keyless ISRC)
                                 - PWA manifest/SW              - Workflow (matching)       YouTube InnerTube (search)
                                 - JSON export/import           - Rate Limiter (per host)   YouTube watch_videos (recipient)
                                                                - cron (cache cleanup)      Scraping proxy (Spotify read, egress IP)
```

- **Vercel / Next.js (App Router, RSC-first):** recipient playlist pages, share UI, PWA
  (manifest + service worker + Web Share Target), JSON export/import endpoints.
- **Convex:** reactive DB, serverless functions, the matching **Workflow**
  (`@convex-dev/workflow`), the **Rate Limiter** (`@convex-dev/rate-limiter`, configured
  per upstream host), cron for cache cleanup, and **HTTP actions** (the endpoint the iOS
  Shortcut and PWA share target POST to).
- **External:** first-party platform adapters (Spotify, Apple, Deezer, YouTube), the
  YouTube `watch_videos` recipient flow, and a scraping proxy used both to read Spotify
  public pages and to provide a stable egress IP for InnerTube.

### Design for isolation

- **Platform adapters** are independent units behind one interface (§7). Each can be
  built and tested alone; adding Tidal/Amazon later means adding an adapter, not touching
  the engine.
- **Matching engine** (normalize → resolve → score) is pure and independently testable
  against fixtures; it has no I/O.
- **Resolution workflow** orchestrates adapters + engine + cache; it owns concurrency,
  retries, and rate limiting.
- **Recipient assembly** (web page, `watch_videos` URL builder, JSON exporter) consumes
  the resolved data and has no knowledge of how matching happened.

## 5. Share flow (data flow)

1. Sharer provides a playlist URL — pasted on web, sent via the iOS Shortcut from a
   platform's share sheet, or via the Android Web Share Target.
2. A Convex HTTP action detects the source platform from the URL and reads the playlist
   into a snapshot:
   - **Spotify** → scraping proxy fetches the public playlist/embed page → parse tracks
     (title, artists, album, ISRC when present, duration, source id).
   - **Apple Music** → developer-token catalog API (`/catalog/{sf}/playlists/{id}`, with
     `tracks.next` pagination); scraping fallback for user playlists.
   - **YouTube Music** → InnerTube playlist read → video ids + titles + channel.
3. Store `playlists` + `tracks` docs, mint a short id, and **return
   `openshare.link/p/{id}` immediately (~1s).**
4. Kick off the matching **Workflow** in the background (§6). Progress is observable via a
   reactive query, so the recipient page updates live.
5. Deduplicate: the same normalized source URL maps to the existing share.

## 6. Matching engine (ported from playlistor / unitunes)

Pure scoring logic, ported to TypeScript. Starting constants are adopted verbatim and
tuned later against fixtures.

**Canonical track:** `{ isrc?, title, artists[], album?, durationMs?, position }`.

**Normalization:** strip `(feat. …)/(ft. …)/(with …)` into separate featured artists;
lowercase; trim. (Regex ported from playlistor `parse_track_name`.)

**Scorer (weighted average over available fields):**

- Weights: `name 50 · artists 30 · album 20 · length 20`.
- String similarity: Jaro–Winkler on lowercased strings.
- **Special-term guard:** if any of `instrumental, remix, cover, live, version, edit,
  nightcore` appears in one title but not the other, score 0 (blocks studio↔live/remix
  mismatches).
- Artist similarity: pairwise max across artist lists; 0.5 when either side is empty.
- Length similarity: linear within ±5s, else 0.
- **Accept threshold: similarity ≥ 0.70 ⇒ "same track".**

**Search fallback ladder (per destination platform):**

1. **ISRC** lookup (Spotify `q=isrc:`, Apple `filter[isrc]`, Deezer `/track/isrc:`),
   cached by ISRC.
2. **Full metadata:** `track:{cleanName} artist:{artist}`.
3. **Primary artist:** `{cleanName} {firstArtist}`.
4. **Fuzzy name:** `{cleanName}` only.

Each step searches, picks the max-similarity candidate, accepts if ≥ 0.70, else falls
through. YouTube always uses text search (no ISRC) with the same scorer, preferring
"song" results. Tracks that fail all four are recorded in a `missedTracks` list with a
manual-search deep link; the playlist still works.

**Orchestration:** the Convex Workflow fans out per-track resolution with bounded
parallelism (`maxParallelism`), per-step retry with exponential backoff, and
exactly-once execution. The Rate Limiter is configured **per upstream host** (Spotify,
Apple, Deezer, InnerTube) rather than one global limit, so cold resolution is fast.
ISRC cache hits skip upstream calls entirely.

## 7. Platform adapter interface

```ts
interface SourceAdapter {
  matchesUrl(url: string): boolean;
  readPlaylist(url: string): Promise<CanonicalPlaylist>; // title, owner, cover, tracks[]
}

interface DestinationAdapter {
  platform: Platform;
  findTrack(track: CanonicalTrack): Promise<ResolvedLink | null>; // ISRC→fallback ladder + scorer
}
```

Note the deliberate difference from playlistor: there is **no `createPlaylist`** (that
requires login). Destination output is produced by **recipient assembly** instead:

- **Web page** — every track with one-tap deep links + preview where available
  (universal baseline).
- **YouTube Music** — build `music.youtube.com/watch_videos?video_ids=...`, chunked into
  ~50-track batches; recipient taps Save.
- **JSON** — portable export (§9).

## 8. Convex data model

- `playlists`: `shortId, sourcePlatform, sourceUrl, normalizedUrl, title, ownerName,
  coverUrl, trackCount, status, createdAt`.
- `tracks`: `playlistId, position, title, artists[], album?, isrc?, durationMs?,
  sourcePlatform, sourceId, sourceUrl`.
- `trackLinks` (global, owned asset): `key (isrc or "platform:id"), byPlatform { spotify,
  appleMusic, youtubeMusic, deezer, ... }, ytVideoId?, previewUrl?, confidence,
  resolvedAt`.
- `resolutionProgress`: per-playlist `{ resolved, total, missedCount }` (drives live UI;
  may be derived from a workflow status query).
- `shareEvents` (optional, lightweight): counters for cost/abuse visibility. No PII.

## 9. Portable JSON interchange format

Doubles as stored artifact, API response shape, export download, and import/re-share
input. Versioned for forward compatibility.

```json
{
  "openshareVersion": 1,
  "name": "late night drive",
  "createdAt": "2026-06-30T05:50:00Z",
  "source": { "platform": "spotify", "url": "https://open.spotify.com/playlist/..." },
  "tracks": [
    {
      "title": "Redbone",
      "artists": ["Childish Gambino"],
      "album": "Awaken, My Love!",
      "durationMs": 326933,
      "isrc": "USQX91601263",
      "links": {
        "spotify": "https://open.spotify.com/track/...",
        "appleMusic": "https://music.apple.com/...",
        "youtubeMusic": "https://music.youtube.com/watch?v=...",
        "deezer": "https://www.deezer.com/track/..."
      }
    }
  ]
}
```

- **Export:** download current resolved playlist as `.json` (client `file-saver`-style).
- **Import / re-share:** upload an OpenShare JSON to create a new share (validated with a
  Zod schema; unknown fields ignored; `openshareVersion` checked).
- All platform credentials stay server-side in Convex actions; the client never holds
  secrets (explicit anti-pattern avoidance from `universal-playlist-generator`).

## 10. Entry points / clients

- **Web app:** paste or auto-detect a playlist link → instant OpenShare link → native
  Web Share. Hosts recipient pages and JSON export/import.
- **PWA:** installable; registers as an Android **Web Share Target** so OpenShare appears
  in the system share sheet; receives a shared URL and POSTs it to the Convex HTTP action.
- **iOS Shortcut:** a published shortcut that accepts a URL from the share sheet, POSTs to
  the Convex HTTP action, receives the OpenShare link, and re-presents the share sheet to
  send to a friend. A one-tap install page is hosted on the web app.

## 11. Error handling

- Unsupported / private / region-locked source → clear message + paste fallback.
- Scrape/proxy block → proxy rotation + retry, then graceful failure with guidance.
- Unmatched tracks → "no confident match on {platform}" + manual-search deep link;
  playlist still usable.
- YouTube >50 guest cap → chunk into multiple saveable batches.
- Upstream outage / rate limit → queued retries; page shows "still matching".
- Duplicate source URL → deduped to the existing share.
- InnerTube breakage → degrade gracefully (web page + other platforms still work).

## 12. Testing strategy

- **Matching engine:** unit tests against fixtures (including the playlistor
  `playlist_data.json` style fixture) — special-term guard, threshold boundaries,
  feat-parsing, length tolerance.
- **Adapters:** contract tests per adapter with recorded fixtures for read + search;
  isolate network via the proxy boundary.
- **JSON format:** round-trip export → import equivalence; schema validation; version
  handling.
- **Recipient assembly:** `watch_videos` URL builder (chunking at 50), deep-link
  construction, missing-preview handling.
- **E2E smoke:** Spotify URL → link in ~1s → recipient page → live fill-in → YT Music
  save link.

## 13. Cost & abuse (kept light for v1; abuse handled post-launch by owner)

- Per-IP rate limiting on share creation; aggressive ISRC caching to minimize upstream
  calls; no PII, no logins → minimal privacy/compliance surface (public playlists only).
- Recurring costs (owner-funded): Vercel (free/low), Convex (free tier), scraping proxy
  (pay-per-use, also shields InnerTube), Apple Developer membership (~$99/yr), Spotify
  Premium for the app owner (~$12/mo). No Google API quota cost (InnerTube). No Odesli.

## 14. Open risks (validate with early spikes before deep build)

- **R1 (highest):** Spotify public-page/embed scraping reliably returns the full
  tracklist, including large playlists. Underpins the no-login premise.
- **R2:** `watch_videos` → `music.youtube.com` Save flow still works; confirm >50
  chunking behavior.
- **R3:** Best read path for publicly-shared Apple Music *user* playlists (`pl.u-...`)
  vs. catalog playlists.
- **R4a:** Matching quality of our ported scorer on real cross-platform data (tune
  threshold; rely on ISRC-first + manual-search escape hatch).
- **R4b:** InnerTube fragility (mitigate with `youtubei.js`, caching, proxy, graceful
  degradation).

**Recommended first implementation step:** spike R1 and R2 to de-risk the two genuinely
novel pieces before building the full pipeline.

## 15. Stack summary

Next.js (App Router) on Vercel · Convex (DB, realtime, Workflow, Rate Limiter, cron, HTTP
actions) · TypeScript end-to-end · Zod validation · scraping proxy · first-party adapters
for Spotify / Apple Music / Deezer / YouTube (InnerTube) · YouTube `watch_videos`
recipient flow. No Odesli; matching is owned in-house.
