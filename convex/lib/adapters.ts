/**
 * Builds the live adapter bundles for the resolution action from Convex env.
 *
 * Wraps the HTTP client with a per-host throttle (the "rate limiter per upstream
 * host" from the spec). When a scraping proxy is configured it is used for the
 * Spotify embed read and InnerTube egress; otherwise direct fetch is used.
 */

import { createHttpClient, type FetchLike, type HttpClient } from "../../lib/adapters/http";
import { createHostThrottle } from "../../lib/util/concurrency";
import type { AdapterBundle } from "../../lib/adapters/types";
import { createDeezerAdapter } from "../../lib/adapters/deezer";
import {
  createSpotifyAdapter,
  createSpotifyTokenProvider,
} from "../../lib/adapters/spotify";
import {
  createAppleAdapter,
  createAppleTokenProvider,
} from "../../lib/adapters/apple";
import { createYouTubeAdapter } from "../../lib/adapters/youtube";
import type { DestinationSearch } from "../../lib/contract/adapter";
import {
  appleCreds,
  firecrawlKey,
  proxyConfig,
  spotifyCreds,
  youtubeDataKey,
} from "./env";

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape";

/** Fetch a page's raw HTML via Firecrawl (bypasses datacenter-IP blocks). */
async function firecrawlGetText(key: string, url: string): Promise<string> {
  const response = await fetch(FIRECRAWL_SCRAPE_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["rawHtml"], onlyMainContent: false }),
  });
  if (!response.ok) {
    throw new Error(`Firecrawl scrape failed: ${response.status}`);
  }
  const json = (await response.json()) as {
    success?: boolean;
    data?: { rawHtml?: string; html?: string };
  };
  const html = json.data?.rawHtml ?? json.data?.html;
  if (!html) throw new Error("Firecrawl scrape returned no HTML");
  return html;
}

/**
 * Wrap an embed HTTP client so the Spotify scrape transparently falls back to
 * Firecrawl when a direct fetch fails or returns a page without `__NEXT_DATA__`.
 */
function withFirecrawlFallback(base: HttpClient, key: string | undefined): HttpClient {
  if (!key) return base;
  return {
    ...base,
    getText: async (url, init) => {
      try {
        const html = await base.getText(url, init);
        if (html.includes("__NEXT_DATA__")) return html;
      } catch {
        // fall through to Firecrawl
      }
      return firecrawlGetText(key, url);
    },
  };
}

/** A destination that never matches — used when a platform's API creds are absent. */
function noopDestination(platform: AdapterBundle["platform"]): DestinationSearch {
  return {
    platform,
    lookupByIsrc: async () => [],
    search: async () => [],
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** A throttled HTTP client: at most one request per host per `minIntervalMs`. */
function rateLimitedClient(opts: {
  fetch?: FetchLike;
  headers?: Record<string, string>;
  minIntervalMs?: number;
}): HttpClient {
  const throttle = createHostThrottle({ minIntervalMs: opts.minIntervalMs ?? 120 });
  const base = createHttpClient({ fetch: opts.fetch, headers: opts.headers });
  return {
    getJson: (url, init) => throttle(hostOf(url), () => base.getJson(url, init)),
    getText: (url, init) => throttle(hostOf(url), () => base.getText(url, init)),
    postJson: (url, body, init) =>
      throttle(hostOf(url), () => base.postJson(url, body, init)),
  };
}

/** A FetchLike that routes the target URL through a generic GET-forwarding proxy. */
function proxyFetch(url: string, key?: string): FetchLike {
  return (target, init) => {
    const proxied = `${url}${url.includes("?") ? "&" : "?"}url=${encodeURIComponent(target)}`;
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string>),
    };
    if (key) headers["x-api-key"] = key;
    return fetch(proxied, { ...init, headers });
  };
}

export function buildBundles(): AdapterBundle[] {
  const bundles: AdapterBundle[] = [];
  const proxy = proxyConfig();
  const direct = rateLimitedClient({});
  const proxied = proxy
    ? rateLimitedClient({ fetch: proxyFetch(proxy.url, proxy.key) })
    : direct;

  // Deezer — fully keyless.
  bundles.push(createDeezerAdapter(direct));

  // Spotify — the embed-scrape SOURCE reader is keyless and always available;
  // ISRC enrichment + the destination search need client-credentials. When creds
  // are absent we keep the reader and neutralize the destination so a Spotify
  // playlist can still be shared (matched to other platforms via metadata).
  const spotify = spotifyCreds();
  const spotifyBundle = createSpotifyAdapter({
    http: direct,
    getAccessToken: spotify
      ? createSpotifyTokenProvider(spotify)
      : async () => {
          throw new Error("Spotify credentials not configured");
        },
    embedHttp: withFirecrawlFallback(proxied, firecrawlKey()),
  });
  bundles.push(
    spotify
      ? spotifyBundle
      : {
          platform: "spotify",
          source: spotifyBundle.source,
          destination: noopDestination("spotify"),
        },
  );

  // Apple Music — developer-token catalog reads + ISRC search.
  const apple = appleCreds();
  if (apple) {
    bundles.push(
      createAppleAdapter({
        http: direct,
        getDeveloperToken: createAppleTokenProvider(apple),
      }),
    );
  }

  // YouTube Music — InnerTube (proxied egress when present), with the official
  // Data API as a quota-safe fallback when a key is configured.
  bundles.push(
    createYouTubeAdapter({ http: proxied, dataApiKey: youtubeDataKey() }),
  );

  return bundles;
}
