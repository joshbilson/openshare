/**
 * Server-side env access for Convex actions. Secrets live in Convex env
 * (`npx convex env set NAME value`) and are read here, never shipped to clients.
 */

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function siteUrl(): string {
  return (
    optionalEnv("NEXT_PUBLIC_SITE_URL") ??
    optionalEnv("SITE_URL") ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export interface SpotifyCreds {
  clientId: string;
  clientSecret: string;
}
export function spotifyCreds(): SpotifyCreds | null {
  const clientId = optionalEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = optionalEnv("SPOTIFY_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export interface AppleCreds {
  teamId: string;
  keyId: string;
  privateKey: string;
}
export function appleCreds(): AppleCreds | null {
  const teamId = optionalEnv("APPLE_MUSIC_TEAM_ID");
  const keyId = optionalEnv("APPLE_MUSIC_KEY_ID");
  const privateKey = optionalEnv("APPLE_MUSIC_PRIVATE_KEY");
  return teamId && keyId && privateKey ? { teamId, keyId, privateKey } : null;
}

export interface ProxyConfig {
  url: string;
  key?: string;
}
export function proxyConfig(): ProxyConfig | null {
  const url = optionalEnv("SCRAPING_PROXY_URL");
  return url ? { url, key: optionalEnv("SCRAPING_PROXY_KEY") } : null;
}

/**
 * Firecrawl API key — used as a resilience fallback for the Spotify embed read
 * when a direct fetch from the server IP is blocked or returns no `__NEXT_DATA__`.
 */
export function firecrawlKey(): string | undefined {
  return optionalEnv("FIRECRAWL_API_KEY");
}

/**
 * Official YouTube Data API v3 key — a quota-safe fallback for YouTube search
 * when the unofficial InnerTube API is blocked. Read-only (no playlist writes).
 */
export function youtubeDataKey(): string | undefined {
  return optionalEnv("YOUTUBE_API_KEY");
}
