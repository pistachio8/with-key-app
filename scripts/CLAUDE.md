# scripts/

빌드 외부에서 직접 실행되는 유틸리티 모음. Next.js 번들에 포함되지 않음.

## Owns / 컨벤션

- `.mjs` — 런타임 헬퍼 (ESM, 번들러 없음). 실행: `node scripts/<name>.mjs`
- `.sh`  — CI/로컬 셸 글루. 실행: `bash scripts/<name>.sh`
- `.ts`  — 타입이 필요한 일회성 (현재 1건: `check-env.ts`). package.json wire-up 없음 — 직접 호출 전용

서브: `ci/` (CI 전용 셸 — 예: `apply-migrations.sh`).

## Patterns / 명명 규약

`<context>-<verb>.<ext>` 형태. 예: `dev-login-link.mjs` · `dev-seed-action-log.mjs` · `validate-doc-paths.mjs`.
Why: 같은 prefix(`dev-`, `seed-`, `validate-`)로 grouping돼 grep · 자동완성 친화.

## 현재 wired up (package.json)

```bash
pnpm validate:docs     # 컨텍스트 문서 path 참조 검증 (CI quick 잡에서도 실행)
pnpm login:link        # 로컬 magic link 생성
pnpm seed:action-log   # 테스트 데이터 시드
pnpm db:push           # supabase db push --linked
pnpm db:types          # src/types/supabase.ts 재생성
```

## Gotcha

- 시크릿은 환경 변수만. `OPENAI_API_KEY` · `SUPABASE_SECRET_KEY` · `VAPID_PRIVATE_KEY`를 코드에 박지 말 것 (서버 전용 키는 `NEXT_PUBLIC_` 접두 금지).
- `scripts/check-env.ts`는 wire-up 안 됨. CI/hook에서 부르려면 `pnpm validate:docs` 처럼 `package.json` `scripts`에 등록 필요.

## See also / Cross-module dependencies

- Supabase 키 네이밍 (depends on rule): [`../.claude/rules/common/supabase-keys.md`](../.claude/rules/common/supabase-keys.md)
- 보안 가드레일: [`../docs/QUALITY_GATE.md`](../docs/QUALITY_GATE.md)
- 키 체계 ADR: [`../docs/adr/0001-supabase-publishable-secret-keys.md`](../docs/adr/0001-supabase-publishable-secret-keys.md)
