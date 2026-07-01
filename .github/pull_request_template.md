<!-- Thanks for contributing to OpenShare! See CONTRIBUTING.md. -->

## What & why

<!-- What does this change and why? Link any issue. -->

## Checklist

- [ ] Verify gate passes: `npm run typecheck && npm test && npm run lint && npm run build`
- [ ] Tests added/updated for behaviour changes (unit tests run offline via injected I/O)
- [ ] No secrets added to the client bundle or committed files (server secrets go in Convex env)
- [ ] Frozen contract (`lib/contract/`, `convex/schema.ts`) imported, not forked
- [ ] Conventions followed: top‑level imports, exhaustive `switch` with `never` default

## Validation

<!-- How did you verify this? For adapters/matching, note fixtures or real‑endpoint checks. -->
