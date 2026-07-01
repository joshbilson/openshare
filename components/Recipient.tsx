"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  PLATFORM_LABELS,
  type Platform,
  type PlatformLinks,
} from "@/lib/contract/types";
import { PLATFORM_ORDER, PLATFORM_UI, searchUrl } from "@/lib/client/platforms";
import { YT_GUEST_CAP } from "@/lib/adapters/watch-videos";
import { buildOpenShareDoc, exportFilename } from "@/lib/json/export";

type ResolutionStatus = "pending" | "resolved" | "missed";

interface TrackDoc {
  _id: string;
  position: number;
  title: string;
  artists: string[];
  album?: string;
  isrc?: string;
  durationMs?: number;
}

interface ResolutionDoc {
  position: number;
  status: ResolutionStatus;
  links: PlatformLinks;
  ytVideoId?: string;
  previewUrl?: string;
  confidence?: number;
}

interface PlaylistDoc {
  shortId: string;
  sourcePlatform: Platform;
  sourceUrl: string;
  title: string;
  ownerName?: string;
  coverUrl?: string;
  trackCount: number;
  status: "reading" | "resolving" | "ready" | "error";
  error?: string;
}

interface RecipientView {
  playlist: PlaylistDoc;
  tracks: TrackDoc[];
  resolutions: ResolutionDoc[];
  progress: { resolved: number; total: number; missedCount: number } | null;
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

function LinkChip({ platform, href }: { platform: Platform; href: string }) {
  const ui = PLATFORM_UI[platform];
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:bg-white/5"
      style={{ borderColor: `${ui.color}66`, color: ui.color }}
    >
      <span
        className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold text-slate-950"
        style={{ backgroundColor: ui.color }}
      >
        {ui.glyph}
      </span>
      {ui.short}
    </a>
  );
}

export function Recipient({ shortId }: { shortId: string }) {
  const data = useQuery(api.resolutions.recipientView, { shortId }) as
    | RecipientView
    | null
    | undefined;
  const [playing, setPlaying] = useState<string | null>(null);

  // React Compiler memoizes these derived values automatically.
  const byPosition = new Map<number, ResolutionDoc>();
  if (data?.resolutions) {
    for (const r of data.resolutions) byPosition.set(r.position, r);
  }

  // Count of tracks that resolved to a YouTube video — the one-tap "Save to
  // YouTube Music" flow builds a real playlist from these via /api/yt.
  const ytCount = data
    ? data.resolutions.filter((r) => Boolean(r.ytVideoId)).length
    : 0;
  const ytBatches = Math.ceil(ytCount / YT_GUEST_CAP);
  const ytSaveUrl = (batch: number) =>
    `/api/yt?p=${encodeURIComponent(shortId)}&b=${batch}`;

  if (data === undefined) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-[var(--panel)]" />
        <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-[var(--panel)]" />
        <div className="mt-8 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl bg-[var(--panel)]"
            />
          ))}
        </div>
      </main>
    );
  }

  if (data === null) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Playlist not found</h1>
        <p className="mt-2 text-[var(--muted)]">
          This link may have expired or never existed.
        </p>
        <Link href="/" className="mt-6 inline-block text-[var(--accent)] hover:underline">
          Share a new playlist →
        </Link>
      </main>
    );
  }

  const { playlist, tracks, progress } = data;
  const total = progress?.total ?? playlist.trackCount;
  const resolved = progress?.resolved ?? 0;
  const missed = progress?.missedCount ?? 0;
  const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const done = playlist.status === "ready" || resolved >= total;

  const handleExport = () => {
    const doc = buildOpenShareDoc({
      name: playlist.title,
      sourcePlatform: playlist.sourcePlatform,
      sourceUrl: playlist.sourceUrl,
      tracks: [...tracks]
        .sort((a, b) => a.position - b.position)
        .map((t) => ({
          title: t.title,
          artists: t.artists,
          album: t.album,
          durationMs: t.durationMs,
          isrc: t.isrc,
          links: byPosition.get(t.position)?.links,
        })),
    });
    downloadJson(exportFilename(playlist.title), doc);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="flex items-start gap-4">
        {playlist.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={playlist.coverUrl}
            alt=""
            className="h-20 w-20 rounded-xl object-cover sm:h-24 sm:w-24"
          />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-xl bg-[var(--panel)] text-2xl sm:h-24 sm:w-24">
            ♪
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            From {PLATFORM_LABELS[playlist.sourcePlatform]}
          </p>
          <h1 className="truncate text-2xl font-bold sm:text-3xl">
            {playlist.title}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {playlist.ownerName ? `${playlist.ownerName} · ` : ""}
            {total} {total === 1 ? "track" : "tracks"}
          </p>
        </div>
      </header>

      <section className="mt-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--muted)]">
            {done
              ? missed > 0
                ? `Matched ${resolved - missed} of ${total} · ${missed} not found`
                : "All tracks matched"
              : `Matching tracks… ${resolved}/${total}`}
          </span>
          <span className="tabular-nums text-[var(--muted)]">{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--panel)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {playlist.status === "error" && (
          <p className="mt-2 text-sm text-red-300">
            We hit an error reading this playlist. Some matches may be missing.
          </p>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        {ytBatches === 1 && (
          <a
            href={ytSaveUrl(1)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110"
          >
            Save all to YouTube Music
          </a>
        )}
        {ytBatches > 1 &&
          Array.from({ length: ytBatches }, (_, i) => i + 1).map((batch) => (
            <a
              key={batch}
              href={ytSaveUrl(batch)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110"
            >
              Save to YT Music ({batch}/{ytBatches})
            </a>
          ))}
        <button
          onClick={handleExport}
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-white/5"
        >
          Download .json
        </button>
        <a
          href={playlist.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-white/5"
        >
          Open original
        </a>
      </div>

      <ol className="mt-8 space-y-1.5">
        {[...tracks]
          .sort((a, b) => a.position - b.position)
          .map((track, idx) => {
            const res = byPosition.get(track.position);
            const statusValue: ResolutionStatus = res?.status ?? "pending";
            const links = res?.links ?? {};
            const available = PLATFORM_ORDER.filter((p) => Boolean(links[p]));
            const query = `${track.title} ${track.artists.join(" ")}`.trim();
            const audioId = track._id;
            return (
              <li
                key={track._id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
              >
                <span className="w-6 shrink-0 text-right text-sm tabular-nums text-[var(--muted)]">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{track.title}</p>
                  <p className="truncate text-sm text-[var(--muted)]">
                    {track.artists.join(", ")}
                    {track.durationMs ? ` · ${formatDuration(track.durationMs)}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {statusValue === "pending" && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
                        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                        Matching…
                      </span>
                    )}
                    {statusValue === "missed" && available.length === 0 && (
                      <span className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                        No exact match
                        <a
                          href={searchUrl("youtubeMusic", query)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-[var(--text)]"
                        >
                          search
                        </a>
                      </span>
                    )}
                    {available.map((p) => (
                      <LinkChip key={p} platform={p} href={links[p] as string} />
                    ))}
                  </div>
                </div>
                {res?.previewUrl && (
                  <button
                    onClick={() =>
                      setPlaying((cur) => (cur === audioId ? null : audioId))
                    }
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border)] hover:bg-white/5"
                    aria-label={playing === audioId ? "Pause preview" : "Play preview"}
                  >
                    {playing === audioId ? "❚❚" : "►"}
                  </button>
                )}
                {res?.previewUrl && playing === audioId && (
                  <audio
                    src={res.previewUrl}
                    autoPlay
                    onEnded={() => setPlaying(null)}
                    className="hidden"
                  />
                )}
              </li>
            );
          })}
      </ol>

      <footer className="mt-10 border-t border-[var(--border)] pt-6 text-center text-sm text-[var(--muted)]">
        <Link href="/" className="text-[var(--accent)] hover:underline">
          Share your own playlist with OpenShare
        </Link>
      </footer>
    </main>
  );
}
