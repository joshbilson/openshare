"use client";

import { useAction } from "convex/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { detectSource } from "@/lib/contract/url-detect";
import { PLATFORM_LABELS } from "@/lib/contract/types";

interface ShareResult {
  shortId: string;
  url: string;
  deduped: boolean;
}

export function ShareForm({ initialUrl }: { initialUrl?: string }) {
  const createShare = useAction(api.share.createShare);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareResult | null>(null);
  const [copied, setCopied] = useState(false);
  const autoSubmitted = useRef(false);

  const detected = url ? detectSource(url) : null;

  const submit = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      setStatus("working");
      setError(null);
      setResult(null);
      try {
        const res = (await createShare({ url: value })) as ShareResult;
        setResult(res);
        setStatus("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setStatus("error");
      }
    },
    [createShare],
  );

  useEffect(() => {
    if (initialUrl && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void submit(initialUrl);
    }
  }, [initialUrl, submit]);

  const onCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; the link is visible regardless */
    }
  }, [result]);

  const onNativeShare = useCallback(async () => {
    if (!result || typeof navigator.share !== "function") return;
    try {
      await navigator.share({
        title: "OpenShare playlist",
        text: "Open this playlist on any music app:",
        url: result.url,
      });
    } catch {
      /* user dismissed the share sheet */
    }
  }, [result]);

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(url);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="playlist-url" className="text-sm font-medium text-[var(--muted)]">
          Playlist link
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="playlist-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://open.spotify.com/playlist/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-base outline-none ring-[var(--accent)] placeholder:text-slate-500 focus:ring-2"
          />
          <button
            type="submit"
            disabled={status === "working" || !url.trim()}
            className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "working" ? "Reading…" : "Create link"}
          </button>
        </div>
        <p className="min-h-5 text-sm text-[var(--muted)]">
          {detected
            ? `Detected ${PLATFORM_LABELS[detected.platform]} playlist.`
            : url
              ? "Paste a public Spotify, Apple Music, Deezer, or YouTube Music playlist."
              : "Works with Spotify, Apple Music, Deezer, and YouTube Music."}
        </p>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
          <p className="text-sm text-[var(--muted)]">
            {result.deduped
              ? "This playlist was already shared — here's the link:"
              : "Your universal link is ready:"}
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 truncate rounded-lg bg-[var(--bg)] px-3 py-2 text-sm text-[var(--accent)]">
              {result.url}
            </code>
            <div className="flex gap-2">
              <button
                onClick={onCopy}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-white/5"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={onNativeShare}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-white/5"
              >
                Share
              </button>
            </div>
          </div>
          <Link
            href={`/p/${result.shortId}`}
            className="mt-3 inline-block text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Open recipient page →
          </Link>
        </div>
      )}
    </div>
  );
}
