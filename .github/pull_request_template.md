<!--
본 PR body는 한국어로 작성합니다(2026-05-01 이후 합의).
섹션 헤더는 영어 유지 가능. 본문(설명·bullet)은 한국어.
spec / 가드레일 매핑: ../AGENTS.md §3·§4 참조.
-->

## Summary

<!-- 무엇을 왜 바꿨는지 1~3 bullet. -->

## Spec / ADR

<!--
spec-required 경로 변경 시 같은 PR에 docs/superpowers/specs/...md 또는 docs/adr/...md 링크를 첨부합니다.
spec-required 경로 매핑은 AGENTS.md §4 참조 (supabase/migrations · src/lib/supabase · middleware.ts · src/lib/keywords/pool.ts · src/lib/validators · src/lib/analytics/track · src/lib/ai).
해당 없으면 "해당 없음".
-->

## with-key 가드레일 체크

- [ ] Supabase migration 추가 또는 RLS 변경 없음 — 또는 추가/변경 + spec/ADR 첨부 + 역할별(anon/authenticated) 접근 검증 완료
- [ ] `src/lib/{validators, analytics/track, keywords/pool}.ts` 미변경 — 또는 변경 + spec/ADR 첨부
- [ ] `middleware.ts` 미변경 — 또는 변경 + 로그인 → 보호 라우트 → 로그아웃 수동 검증
- [ ] 신규 env 변수 시 `.env.example` 동기화 + `NEXT_PUBLIC_` 접두 규칙 준수(서버 전용 키는 미접두)

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] (해당 시) `pnpm test:integration` · `pnpm test:e2e`
- [ ] (UI 변경 시) 모바일 viewport 수동 확인
- [ ] (EVAL task 완료 시) 해당 `evals/tasks/NNNN-*.md` `Status: done` 갱신을 **이 PR 에 포함** — 머지 후 별도 편집 금지(status drift 원천 차단). 누락 시 `pnpm harness:drift` 가 경고

## Rollback

<!-- 되돌리는 방법 1~2줄. 트리비얼하면 "1 commit revert". migration 변경이면 down 방법 또는 forward-fix 계획. -->

## (시각 PR만) 캡처 · 접근성

- [ ] 393×852 (iPhone 14 Pro) DevTools 모바일 캡처 첨부
- [ ] 360×740 (중급 안드로이드) DevTools 모바일 캡처 첨부
- [ ] 모킹업 해당 섹션과 나란히 비교 캡처
- [ ] 빈 상태·로딩·에러 상태 각각 캡처
- [ ] 키보드 포커스 링 확인 (Tab 한 번)
- [ ] axe-core 통과 또는 위반 + PO 결정 링크
