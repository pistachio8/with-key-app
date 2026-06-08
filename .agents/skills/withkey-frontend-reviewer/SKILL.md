---
name: withkey-frontend-reviewer
description: >-
  Review with-key frontend, App Router, RSC/client-boundary, UI, and cache-read
  changes. Use when a diff touches apps/web/src/app/**, route _components,
  src/components/ui/**, src/lib/db/reads/**, or use server/use client
  boundaries. Reports findings only. Checks Next.js 16 guardrails, Server
  Action write paths, route colocation, serializable boundaries, Cache
  Components private cache rules, secrets-in-client risk, zod/type hygiene, and
  mobile PWA UX states.
metadata:
  short-description: Review with-key frontend code
---

# withkey-frontend-reviewer

Review frontend and RSC/client-boundary changes in with-key. Report findings
only.

This repo uses Next.js 16 with breaking changes from older Next.js versions.
When a finding depends on framework behavior, verify against
`node_modules/next/dist/docs/` before reporting it.

## Scope

Review only:

- `apps/web/src/app/**` routes, `_components/`, layout/page/loading/error UI
- `src/components/ui/**`
- `src/lib/db/reads/**`
- changed `'use server'` / `'use client'` boundaries

Ignore migration internals and pure server-library logic unless they directly
affect component boundaries.

## Process

Use the current branch merge-base unless the user supplied a diff or named
files. Read full surrounding components. Check mobile portrait implications for
new user-facing flows.

## Rules

Blocker:

- Client-to-server writes bypass route `_actions.ts` Server Actions.
- `useEffect` + `fetch` creates a write path, or new SWR/React Query is added.
- `src/app/api/*` is used for general writes instead of external callbacks.
- Server-only secrets become reachable from client components.
- Cache read leaks data across viewers: viewer-specific reads lack inline
  `"use cache: private"`, `cacheTag`, and `cacheLife`, or service-role hydrate
  reads are imported without the Layer-1 visibility gate.
- The change does not meet its stated goal.

Major:

- Feature code is not route-colocated in `_components/` / `_actions.ts`, or a
  new `src/features/` is introduced.
- `'use client'` is broader than needed or pulls server-only imports into the
  client bundle.
- Server Action args/returns or props crossing the RSC boundary are not
  serializable.
- New user-facing flow lacks loading, empty, or error states.
- Mobile portrait layout is likely broken for the changed flow.

Minor:

- `any`, overused `as` / `!`, or hand-rolled domain types where `z.infer<>`
  should be used.
- Reimplements `cn`, `src/components/ui/*`, `src/lib/keywords/*`, or local
  helpers without reuse justification.
- Style issues without current runtime impact.

## Output

Report in Korean:

```markdown
## frontend 리뷰

<1줄: UI/경계 변경 요약 + Blocker 유무>

### 🔴 Blocker

- `apps/web/src/app/.../file.tsx:NN` — [축] <문제>. <왜 중요>. <고칠 방법>

### 🟠 Major

- ...

### 🟡 Minor

- ...

### 영향 / 검증 권고

- env/시크릿 노출 여부
- 모바일 viewport 수동 확인 필요 여부
- 필요한 `pnpm typecheck` / `pnpm lint` / E2E smoke
```

If there are no Blockers or Majors, say that plainly.
