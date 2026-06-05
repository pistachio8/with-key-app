---
Task: EVAL-0012
Track: port
Kind: migration
Status: blocked
Blocked-by: EVAL-0011(Expo boot) complete + ADR — RN Kakao native auth(04 A6, 04 §9) accepted.
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/04-rn-architecture.md, docs/adr/0033-rn-target-architecture.md
---

# EVAL-0012: G3 Supabase RN auth PoC — Kakao/magic link + session restore + logout

> 00 §8 G3. Kakao native auth ADR이 없으므로 이 task는 blocked다. ADR 없이 네이티브 Kakao SDK, token exchange, Supabase provider 신뢰 구성을 임의 확정하지 않는다.

## Parent Links

- Parent PRD Feature: POC PRD §3.3 `AC-3` 로그인/가입 + RN delta [01 §5.A](../../docs/migration/01-rn-mvp-prd.md).
- Parent Test Scenario: `TS-rn-auth-1`~`TS-rn-auth-4`는 본 파일 Acceptance Criteria에 흡수(D10) — [docs/migration/05-rn-harness-decisions.md](../../docs/migration/05-rn-harness-decisions.md) §2.
- Parent Job Story: 그룹 초대/서약 전에 사용자가 신뢰 가능한 로그인 상태를 가져야 한다 — [docs/PRD.md](../../docs/PRD.md) §3.1.
- Parent Engineering Story: [04 §4 Auth A6](../../docs/migration/04-rn-architecture.md) + [00 §13.4 D-8](../../docs/migration/00-rn-conversion-plan.md).
- Parent Work Package: `feat/rn-auth-poc` (G3).

## Goal

dev build에서 Supabase RN auth가 실제로 성립함을 증명한다. 이 task가 끝나면 사용자는 Kakao native SSO 또는 magic link fallback으로 로그인할 수 있고, 앱 재시작 후 세션이 SecureStore 기반 storage adapter에서 복원되며, logout이 Supabase 세션과 로컬 민감 데이터를 모두 제거한다. PWA의 `@supabase/ssr` cookie callback 책임은 RN client/deep link flow로 재배치된다.

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

- `apps` — implement `apps/mobile` auth service, login screen, SecureStore adapter, and auth callback handling.
- `apps/web/src/lib/supabase` — only if shared/BFF auth verification needs additive Bearer helpers; preserve PWA cookie path.
- `docs/adr` — prerequisite ADR for RN Kakao native auth, if still absent.

## Requirements

- Use the accepted Kakao native auth ADR before choosing SDK/config details. Do not replace it with web OAuth assumptions.
- Support Kakao native SSO via `signInWithIdToken({ provider: "kakao" })` when the ADR permits it.
- Keep magic link fallback. The redirect target must be an https universal link or equivalent path that RN can receive.
- Store Supabase session in an encrypted SecureStore adapter; handle token size with chunking if required by the chosen implementation.
- Restore session after app restart without showing a logged-out screen flash beyond the designed loading state.
- Logout clears Supabase session and local sensitive storage.
- Mobile bundle may contain only public env (`EXPO_PUBLIC_SUPABASE_URL`, publishable key, Kakao native public key). No `sb_secret_*`, OpenAI, VAPID private, or server key.
- Keep PWA cookie flow working; this task ports auth, it does not break web login.

## Non-goals

- Invite token stash/accept orchestration — EVAL-0013.
- Full protected route skeleton and tabs — EVAL-0014.
- BFF Bearer rollout for every API route — later tasks decide per route.
- Push token registration after login — separate push task, not part of 00 §8 G3.
- Any Supabase migration unless the accepted ADR explicitly requires it.

## Acceptance Criteria

| 기준                    | 검증 방법                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Kakao or fallback login | dev build signs in with Kakao native SSO or magic link fallback per ADR                  |
| session restore         | force-close/relaunch keeps user authenticated                                            |
| logout                  | logout returns to auth route and removes SecureStore session chunks                      |
| env safety              | mobile public config excludes `sb_secret_*`, OpenAI, VAPID private, and legacy key names |
| PWA auth not regressed  | existing web login tests or smoke remain green                                           |
| ADR gate honored        | RN Kakao native auth ADR is linked in implementation summary before code ships           |
| harness traceability    | `pnpm harness:check` passes                                                              |

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

완료 보고는 사용한 ADR, Kakao/magic link 중 실제 검증한 경로, SecureStore session restore 결과, logout storage cleanup, web auth 회귀 여부, 남은 auth/deep-link 리스크를 한국어로 요약한다.

## Harness Impact Questions

1. Did this task introduce a new folder structure? Maybe — auth feature/capability folders under `apps/mobile`.
2. Did this task introduce a new naming convention? Maybe — auth service/session adapter naming.
3. Did this task introduce a new dependency? Yes — Kakao SDK/AuthSession/SecureStore dependencies as chosen by ADR.
4. Did this task change verification commands? Yes if mobile auth tests become part of `pnpm -r test`.
5. Did this task reveal that the current harness instructions are outdated? Maybe — if auth manual smoke must be standardized.
6. Should any `.agents/` document be updated? Only if implementation changes harness mechanics; product/auth ADR updates are not `.agents/` edits.

## Stop Condition

- Kakao native auth ADR exists and is cited.
- All Acceptance Criteria green, including manual dev build login/session/logout.
- pass@3 안에 green 못 만들면 Kakao native / magic link fallback / session storage로 split.
