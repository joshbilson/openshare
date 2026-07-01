import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenShare — share playlists across any music app",
  description:
    "Paste a Spotify, Apple Music, Deezer, or YouTube Music playlist and get one link that opens on every platform. No login, no account linking.",
  manifest: "/manifest.webmanifest",
  applicationName: "OpenShare",
  appleWebApp: { capable: true, title: "OpenShare", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "OpenShare",
    description: "One playlist link that opens on every music app. No login.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1120",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
