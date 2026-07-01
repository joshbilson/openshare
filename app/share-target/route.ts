import { NextResponse, type NextRequest } from "next/server";

/**
 * Android Web Share Target endpoint. The PWA manifest registers this URL so the
 * OS share sheet can hand us a shared playlist link, which we forward to the
 * home page for one-tap link creation.
 */
export function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const shared =
    sp.get("url") || sp.get("text") || sp.get("title") || "";
  const dest = new URL("/", request.nextUrl.origin);
  if (shared) dest.searchParams.set("url", shared);
  return NextResponse.redirect(dest);
}
