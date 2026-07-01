"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";

const CONVEX_URL =
  process.env.NEXT_PUBLIC_CONVEX_URL || "https://placeholder.convex.cloud";

export function Providers({ children }: { children: ReactNode }) {
  // Lazily construct once; safe during prerender (no socket until first sub).
  const [client] = useState(() => new ConvexReactClient(CONVEX_URL));

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* PWA is progressive enhancement; ignore registration failures. */
      });
    }
  }, []);

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
