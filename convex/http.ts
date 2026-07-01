import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const SHARE_RATE_LIMIT = 20;
const SHARE_WINDOW_MS = 60_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

const preflight = httpAction(async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
});

/** POST /share { url } → { shortId, url, deduped }. Used by the iOS Shortcut + PWA. */
const shareHandler = httpAction(async (ctx, request) => {
  const limit = await ctx.runMutation(internal.events.checkIpRateLimit, {
    ip: clientIp(request),
    limit: SHARE_RATE_LIMIT,
    windowMs: SHARE_WINDOW_MS,
  });
  if (!limit.allowed) {
    return json({ error: "Rate limit exceeded. Please try again shortly." }, 429);
  }

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!body?.url) return json({ error: "Missing 'url' in request body." }, 400);

  try {
    const result = await ctx.runAction(api.share.createShare, { url: body.url });
    return json(result, 200);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      400,
    );
  }
});

/** POST /import (OpenShare JSON doc) → { shortId, url, deduped }. */
const importHandler = httpAction(async (ctx, request) => {
  const limit = await ctx.runMutation(internal.events.checkIpRateLimit, {
    ip: clientIp(request),
    limit: SHARE_RATE_LIMIT,
    windowMs: SHARE_WINDOW_MS,
  });
  if (!limit.allowed) {
    return json({ error: "Rate limit exceeded. Please try again shortly." }, 429);
  }

  let doc: unknown;
  try {
    doc = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  try {
    const result = await ctx.runAction(api.share.importShare, { doc });
    return json(result, 200);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      400,
    );
  }
});

const health = httpAction(async () => json({ ok: true }, 200));

const http = httpRouter();
http.route({ path: "/share", method: "POST", handler: shareHandler });
http.route({ path: "/share", method: "OPTIONS", handler: preflight });
http.route({ path: "/import", method: "POST", handler: importHandler });
http.route({ path: "/import", method: "OPTIONS", handler: preflight });
http.route({ path: "/health", method: "GET", handler: health });

export default http;
