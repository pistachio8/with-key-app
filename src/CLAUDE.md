# src/

with-key 앱 코드의 주 무대. Next.js 16 App Router · React 19 · TypeScript.

## Owns / 레이아웃

- `app/` — Next.js 라우트 (`(app)` · `(auth)` 그룹) · `api/` (외부 콜백 전용) · 전역 `layout.tsx`
- `components/` — shadcn primitive (`ui/`) + 앱 셸 (`app-shell/`) + 글로벌 컴포넌트
- `lib/` — 도메인 SoT (`validators/` `ai/` `push/` `supabase/` `analytics/` `auth/` `db/` 등)
- `types/` — Supabase 자동 생성 타입 (`supabase.ts`). **직접 수정 금지**

## Patterns / 가드레일

- **Server Action 우선**: 클라이언트 → 서버 쓰기는 라우트 콜로케이트 `_actions.ts`. Why: route handler(`app/api/*`)는 외부 콜백만 두어 보안 표면 감축.
- **RSC + server fetch 기본**: `useEffect + fetch` 쓰기 경로 / SWR / React Query 금지. Why: POC 범위 초과이고 쓰기는 Server Action으로 일원화.
- **`src/features/` 신설 금지**: 화면 30개 초과 시 별도 결정. Why: 라우트 콜로케이션이 깨진다.
- **zod = 타입 SoT**: `lib/validators/*.ts` 스키마 → `z.infer<>`로 타입 도출. `any` 금지.

## Quick commands

```bash
pnpm dev               # 로컬 dev (Turbopack)
pnpm typecheck         # tsc --noEmit
pnpm lint
pnpm test              # vitest unit
pnpm db:types          # src/types/supabase.ts 재생성
```

## See also / Cross-module dependencies

- 절대 원칙: [`../CLAUDE.md`](../CLAUDE.md) → [`../.claude/AGENTS.md`](../.claude/AGENTS.md)
- 품질 게이트: [`../docs/QUALITY_GATE.md`](../docs/QUALITY_GATE.md)
- 데이터 · RLS (depends on supabase): [`../docs/BE_SCHEMA.md`](../docs/BE_SCHEMA.md)
- 키 체계 ADR: [`../docs/adr/0001-supabase-publishable-secret-keys.md`](../docs/adr/0001-supabase-publishable-secret-keys.md)
