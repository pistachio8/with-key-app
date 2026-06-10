---
Task: EVAL-0012
Track: port
Kind: migration
Status: todo
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/04-rn-architecture.md, docs/adr/0033-rn-target-architecture.md, docs/adr/0034-rn-kakao-native-auth.md
---

# EVAL-0012: G3 Supabase RN auth PoC — Kakao/magic link + session restore + logout

> 00 §8 G3. 차단 해제(2026-06-10): EVAL-0011 done + [ADR-0034](../../docs/adr/0034-rn-kakao-native-auth.md) accepted — 네이티브 Kakao SDK + `signInWithIdToken` + SecureStore 세션 결정 박제.

## Parent Links

- PRD: §3.3 `AC-3` 로그인/가입 + RN delta [01 §5.A](../../docs/migration/01-rn-mvp-prd.md).
- Test Scenario: `TS-rn-auth-1`~`TS-rn-auth-4` → AC 흡수(D10) — [05-rn-harness-decisions.md](../../docs/migration/05-rn-harness-decisions.md) §2.
- Job Story: 초대/서약 전 로그인 — [docs/PRD.md](../../docs/PRD.md) §3.1.
- Engineering Story: [04 §4 Auth A6](../../docs/migration/04-rn-architecture.md) + [00 §13.4 D-8](../../docs/migration/00-rn-conversion-plan.md).
- Work Package: `feat/rn-auth-poc` (G3).

## Goal

dev build에서 Supabase RN auth 성립 증명. Kakao SSO/magic link 로그인, 재시작 후 SecureStore 세션 복원, logout 시 데이터 제거. PWA cookie 책임은 RN flow로 재배치.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `docs/adr/0007-supabase-env-fail-fast.md`
- `docs/adr/0008-kakao-oauth-introduction.md`
- `apps/web/src/lib/supabase`
- `apps/web/src/app/(auth)/login`
- `apps/web/src/app/auth/callback`

## Target Files

- `apps` — mobile auth service, login screen, SecureStore adapter, callback.
- `apps/web/src/lib/supabase` — BFF Bearer helper 필요 시만. PWA cookie 유지.
- `docs/adr` — Kakao native auth ADR 부재 시 선행 작성.

## Requirements

- ADR 확인 후 SDK/config 결정. web OAuth 가정 대체 금지.
- ADR 허용 시 `signInWithIdToken({ provider: "kakao" })` SSO.
- magic link fallback, redirect는 RN universal link.
- 세션 encrypted SecureStore 저장(chunking 처리). 재시작 복원(flash 금지).
- logout: 세션·민감 스토리지 제거.
- mobile public env만(`EXPO_PUBLIC_SUPABASE_URL`, publishable key, Kakao key). `sb_secret_*`·VAPID 금지.
- PWA cookie flow 유지.

## Non-goals

- Invite token stash/accept — EVAL-0013.
- Protected route skeleton — EVAL-0014.
- BFF Bearer rollout, Push token 등록 — 후속 task.
- Supabase migration — ADR 명시 요구 시만.

## Acceptance Criteria

| 기준                    | 검증 방법                                         |
| ----------------------- | ------------------------------------------------- |
| Kakao or fallback login | Kakao SSO 또는 magic link 로그인(ADR 기준)        |
| session restore         | force-close/relaunch 후 인증 유지                 |
| logout                  | auth route 복귀, SecureStore chunks 삭제          |
| env safety              | mobile에 `sb_secret_*`/OpenAI/VAPID/레거시 미포함 |
| PWA auth not regressed  | web login tests/smoke green                       |
| ADR gate honored        | Kakao auth ADR 링크 후 코드 ship                  |
| harness traceability    | `pnpm harness:check` passes                       |

## Verification Commands

```bash
pnpm harness:context EVAL-0012
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/mobile test -- auth
pnpm harness:check
pnpm validate:docs
# manual/dev-build: Kakao or magic link login -> app restart -> logout
```

## Expected Output Summary

한국어 요약: 사용 ADR, Kakao/magic link 결과, SecureStore restore, logout, web 회귀, 리스크.

## Harness Impact Questions

1. New folder structure? Maybe — `apps/mobile` auth folders.
2. New naming convention? Maybe — auth service/adapter.
3. New dependency? Yes — Kakao SDK/AuthSession/SecureStore per ADR.
4. Verification commands changed? Yes if auth tests join `pnpm -r test`.
5. Harness outdated? Maybe — manual smoke 표준화 시.
6. `.agents/` update? Only if harness mechanics change.

## Stop Condition

- Kakao auth ADR 존재 및 인용.
- AC 전부 green(수동 dev build login/session/logout 확인).
- pass@3 실패 시 Kakao / magic link / session storage로 split.
