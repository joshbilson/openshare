import Link from "next/link";

export const metadata = {
  title: "Add OpenShare to your phone",
  description:
    "Install OpenShare as an app and add a one-tap iOS Shortcut to share playlists straight from Spotify, Apple Music, or YouTube Music.",
};

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-sm font-bold text-slate-950">
        {n}
      </span>
      <span className="text-[var(--muted)]">{children}</span>
    </li>
  );
}

export default function InstallPage() {
  const shareEndpoint = process.env.NEXT_PUBLIC_CONVEX_SITE_URL
    ? `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/share`
    : "https://<your-deployment>.convex.site/share";

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-[var(--accent)] hover:underline">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Add OpenShare to your phone</h1>
      <p className="mt-2 text-[var(--muted)]">
        Share a playlist straight from your music app&apos;s share sheet — no
        copy-pasting links.
      </p>

      <section className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="text-xl font-semibold">iPhone &amp; iPad (Shortcut)</h2>
        <ol className="mt-4 space-y-3">
          <Step n={1}>Open the Shortcuts app and create a new shortcut.</Step>
          <Step n={2}>
            Add <strong>Receive</strong> input, then set it to accept{" "}
            <strong>URLs</strong> and <strong>Text</strong> from the share sheet.
          </Step>
          <Step n={3}>
            Add a <strong>Get Contents of URL</strong> action. Set Method to{" "}
            <strong>POST</strong>, URL to{" "}
            <code className="rounded bg-[var(--bg)] px-1.5 py-0.5 text-[var(--accent)]">
              {shareEndpoint}
            </code>
            , Request Body to <strong>JSON</strong> with a single field{" "}
            <code className="rounded bg-[var(--bg)] px-1.5 py-0.5">url</code> set
            to the Shortcut Input.
          </Step>
          <Step n={4}>
            Add <strong>Get Dictionary Value</strong> for key{" "}
            <code className="rounded bg-[var(--bg)] px-1.5 py-0.5">url</code>,
            then <strong>Copy to Clipboard</strong> (and optionally{" "}
            <strong>Share</strong>).
          </Step>
          <Step n={5}>
            In the shortcut settings, enable{" "}
            <strong>Show in Share Sheet</strong>. Now &quot;OpenShare&quot;
            appears when you share a playlist from Spotify or Apple Music.
          </Step>
        </ol>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="text-xl font-semibold">Android (install + share)</h2>
        <ol className="mt-4 space-y-3">
          <Step n={1}>
            Open OpenShare in Chrome and tap <strong>Install app</strong> (or
            Menu → Add to Home screen).
          </Step>
          <Step n={2}>
            From your music app, tap <strong>Share</strong> and choose{" "}
            <strong>OpenShare</strong> — the link is created automatically.
          </Step>
        </ol>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="text-xl font-semibold">Any device (web)</h2>
        <p className="mt-2 text-[var(--muted)]">
          You can always paste a playlist link on the{" "}
          <Link href="/" className="text-[var(--accent)] hover:underline">
            home page
          </Link>
          . The share endpoint is also a plain HTTP API:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-[var(--bg)] p-3 text-sm text-[var(--accent)]">
          {`curl -X POST ${shareEndpoint} \\
  -H "content-type: application/json" \\
  -d '{"url":"https://open.spotify.com/playlist/…"}'`}
        </pre>
      </section>
    </main>
  );
}
