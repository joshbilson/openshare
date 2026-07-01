# Security Policy

## Reporting a vulnerability

Please report security issues **privately**. Do not open a public GitHub issue
for anything exploitable.

- Preferred: open a [private security advisory](https://github.com/joshbilson/openshare/security/advisories/new)
  on this repository (GitHub → **Security** → **Report a vulnerability**).
- Include a description, reproduction steps, and impact. We'll acknowledge and
  work with you on a fix and disclosure timeline.

## What's in scope

OpenShare is zero‑login and stores no user accounts, so the surface is small.
Relevant areas:

- The public HTTP actions (`/share`, `/import`) and the `/api/yt` route —
  input validation, SSRF, and abuse/rate‑limit bypass.
- The scraping/adapter layer — anything that lets a crafted source URL cause
  unexpected server behaviour.
- Denial‑of‑service / cost‑amplification against the hosted instance.

## Secrets & credentials

- **No secrets live in this repository.** Platform credentials (Spotify, Apple
  MusicKit, scraping proxy, YouTube Data API) are stored only in **Convex
  environment variables** and are never shipped to the client bundle.
- The only key checked into the source, the InnerTube web key in
  `lib/adapters/youtube.ts`, is **not** a secret: it is the public constant
  shipped in YouTube Music's own JavaScript and is identical for every visitor.
- `.gitignore` blocks `.env*` (except `.env.example`), `.vercel`, `.convex/`,
  and other local state. If you ever find a credential committed, treat it as
  compromised: rotate it and report it via the advisory link above.

## Deployment isolation

A public clone or fork **cannot** affect the canonical live deployment:

- No `.vercel` project linking, deploy token, or `CONVEX_DEPLOY_KEY` is
  committed. Write access to a Convex deployment requires that key, which lives
  only in the deploying party's environment.
- The client connects only to the `NEXT_PUBLIC_CONVEX_URL` it is built with, so
  a fork is a fully independent instance.

## Supported versions

This is a single, continuously‑deployed app; only the latest `master` is
supported. Fixes land on `master`.
