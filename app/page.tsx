import Link from "next/link";
import { ShareForm } from "@/components/ShareForm";

function firstUrl(text?: string): string | undefined {
  if (!text) return undefined;
  const match = text.match(/https?:\/\/\S+/);
  return match?.[0];
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; shared?: string; text?: string }>;
}) {
  const sp = await searchParams;
  const initialUrl = sp.url ?? sp.shared ?? firstUrl(sp.text);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-12 sm:py-20">
      <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-slate-950">
          ♫
        </span>
        OpenShare
      </div>

      <section className="mt-14 sm:mt-20">
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          One playlist link.
          <br />
          <span className="text-[var(--accent)]">Every music app.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
          Paste a Spotify, Apple Music, Deezer, or YouTube Music playlist and get
          a single link that opens on whatever your friends use. No login, no
          account linking, ever.
        </p>
      </section>

      <section className="mt-10">
        <ShareForm initialUrl={initialUrl} />
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "No logins",
            body: "Neither you nor your friend needs an account or to link anything.",
          },
          {
            title: "Instant link",
            body: "We return a share link right away and fill in matches live.",
          },
          {
            title: "Own your data",
            body: "Export any playlist as portable JSON and re-share it anywhere.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4"
          >
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto pt-16 text-sm text-[var(--muted)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/install" className="hover:text-[var(--text)]">
            Add to your phone / iOS Shortcut
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--text)]"
          >
            Free &amp; open source
          </a>
        </div>
      </footer>
    </main>
  );
}
