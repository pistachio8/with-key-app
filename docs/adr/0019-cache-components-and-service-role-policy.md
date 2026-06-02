# ADR-0019: Cache Components wrapper and service-role cache policy

**Date**: 2026-05-26
**Status**: proposed
**Deciders**: pistachio8

## Context

`docs/superpowers/plans/2026-05-26-sns-cache-strategy-blueprint.md` defines the SNS cache strategy for kudos, emoji, feed, and dashboard surfaces. The plan adopts Next.js 16 Cache Components so viewer-specific reads can keep read-your-writes behavior while non-owner state converges with stale-while-revalidate.

The relevant Next.js 16 docs in `node_modules/next/dist/docs/` say:

- `'use cache: private'` can cache request-aware functions in browser memory, but requires `cacheComponents: true`.
- `cacheTag()` and `cacheLife()` must run inside a cached function.
- `cacheComponents: true` changes App Router prerendering and client navigation behavior globally.

Service-role Supabase reads bypass RLS and can include cross-user data. Caching those results under viewer-facing tags would make stale or over-broad data reuse harder to detect and could weaken the repository's RLS-first security model.

## Decision

Adopt a Phase 1a foundation that introduces the cache wrapper and policy without enabling global Cache Components behavior.

- Add `src/lib/cache/private.ts` as the single wrapper for viewer-specific private cached reads.
- The wrapper applies `'use cache: private'`, `cacheTag()`, and `cacheLife()` together so future read functions use one convention.
- Viewer-specific cached reads must use explicit tags. User-specific entries must include the viewer id in the tag, for example `user-${uid}-kudos-${actionLogId}`.
- Service-role or `adminClient` results must not be cached in user-facing reads. The only acceptable exception is a separate worker/cron path that returns public, non-user-specific data and has its own ADR or spec.
- Do not enable `cacheComponents: true` in Phase 1a. That global behavior change belongs to a separate Phase 1b PR with Preview route smoke testing.
- Pin `next` and `eslint-config-next` to the current `16.2.x` minor line. Before any Next.js minor bump, read the local `node_modules/next/dist/docs/` cache docs and the upstream changelog for `cacheComponents`, `'use cache: private'`, `cacheTag()`, and `cacheLife()` changes.

## Alternatives Considered

### 1. Call `cacheTag()` and `cacheLife()` directly in every read function

- **Pros**: No wrapper abstraction.
- **Cons**: Tag naming, cache life, and private-cache rules can drift across feed and kudos reads. API changes in experimental private cache behavior would require many edits.
- **Why not**: The cache strategy depends on consistent invalidation semantics. A single wrapper keeps the unstable API surface narrow.

### 2. Enable `cacheComponents: true` in the same PR

- **Pros**: Future cached reads could be exercised immediately.
- **Cons**: `cacheComponents` changes prerendering and client navigation behavior globally, including React `<Activity>` route preservation. That requires Preview smoke testing across app routes.
- **Why not**: Phase 1a is intentionally production-impact-free. Global activation is Phase 1b.

### 3. Allow service-role cache entries with strict tags

- **Pros**: Could reduce read cost for admin-backed aggregation.
- **Cons**: Service-role reads bypass RLS, so a tag mistake can reuse data outside the viewer boundary. The blast radius is larger than anon/authenticated RLS-protected reads.
- **Why not**: The repository's security model relies on RLS and narrow server write paths. Service-role caching needs a separate, explicit decision if it ever becomes necessary.

## Consequences

### 긍정적

- Future kudos/feed cache work has one convention for private cache tags and lifetimes.
- Next.js private-cache API churn is isolated to `src/lib/cache/private.ts`.
- Phase 1a has no production behavior change because the wrapper has no callers and `cacheComponents` remains disabled.

### 부정적 / 비용

- `viewerCached` is dead code until Phase 1b and Phase 3 introduce callers.
- The project is pinned to the Next.js `16.2.x` minor line, so later fixes in newer minors require an explicit review step.
- The wrapper cannot protect against a caller choosing an under-scoped tag; reviews still need to check tag shape.

### 후속 영향

- Phase 1b may enable `cacheComponents: true` in `next.config.ts` only after this foundation is merged.
- Phase 3 should use `viewerCached` for viewer kudos reads and keep service-role/admin reads uncached.
- A future Next.js minor bump must update this ADR or add a superseding ADR if private cache behavior changes.
