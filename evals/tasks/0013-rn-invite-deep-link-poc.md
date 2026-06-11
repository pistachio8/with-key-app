---
Task: EVAL-0013
Track: port
Kind: migration
Status: blocked
Blocked-by: EVAL-0012(G3 auth PoC) complete. PO decision resolved 2026-06-11 — re-tap MVP accepted, friction mitigated via UX(웹 랜딩 재탭 안내, 04 A7).
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/04-rn-architecture.md, docs/migration/05-rn-harness-decisions.md
---

# EVAL-0013: G4 Invite deep link PoC — installed auto return + uninstalled re-tap path

> 00 §8 G4. 04 A7 "미설치 재탭" MVP는 PO 수용 확정(2026-06-11) — 마찰은 웹 랜딩 재탭 안내 UX로 완화. deferred 플랫폼(Branch 등) 임의 도입 금지는 유지.

## Parent Links

- PRD: §3 초대/서약 [00 §8 G4](../../docs/migration/00-rn-conversion-plan.md).
- Test Scenario: `TS-rn-invite-1`~`5` → AC 흡수(D10) — [05-rn-harness-decisions.md](../../docs/migration/05-rn-harness-decisions.md) §2.
- Job Story: 초대 → 설치/로그인 → 맥락 복귀 — [docs/PRD.md](../../docs/PRD.md) §3.2.
- Engineering Story: [04 §4 A7](../../docs/migration/04-rn-architecture.md) + [00 §13.4 D-8](../../docs/migration/00-rn-conversion-plan.md).
- Work Package: `feat/rn-invite-deep-link`.

## Goal

초대 URL → RN → 수락 흐름 dev build 증명. 설치: universal link/`fromwith://invite/<token>` 오픈, 미인증 token stash → 로그인 → `accept_invite`. 미설치 MVP는 PO 승인 후 웹 → 스토어 → 재탭 → 수락.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `apps/web/src/app/(auth)/invite/[token]`
- `apps/web/src/lib/db/reads/invite.ts`
- `apps/web/src/lib/invite`
- `supabase/migrations/0028_pending_invite_start_flow.sql`

## Target Files

- `apps` — mobile invite route, deep-link, token stash, accept flow.
- `apps/web/src/app` — well-known/web fallback 필요 시만.
- `apps/web/src/lib/invite` — URL/token 재사용. semantics 변경 금지.

## Requirements

- https invite URL 보존(Kakao/OG).
- 설치: universal link/`fromwith://invite/<token>` RN route 오픈.
- 미인증: token stash → 로그인 → `accept_invite`.
- 인증: `accept_invite` → pledge 이동.
- expired/full/already-joined: RPC semantics 준수.
- 미설치: 04 A7는 PO 수락 후에만. Branch/Firebase DL 금지.
- PRD §9.1 승인 events만 emit.

## Non-goals

- Kakao native auth — EVAL-0012.
- Full route skeleton — EVAL-0014.
- token format·expiry·`accept_invite` semantics 변경.
- Branch deferred linking(PO 승인 전).
- PWA invite fallback 제거.

## Acceptance Criteria

| 기준                          | 검증 방법                                   |
| ----------------------------- | ------------------------------------------- |
| installed deep link opens app | universal/app link 또는 scheme iOS/Android  |
| unauth token stash            | 미인증 → 로그인 → 동일 token 수락           |
| authenticated accept          | `accept_invite` 호출, challenge/pledge 이동 |
| invalid states preserved      | expired/full/already-joined RPC 준수        |
| uninstalled re-tap path       | PO 승인 flow 문서화/smoke 또는 blocked      |
| no deferred decision drift    | Branch/Firebase PO 없이 미추가              |
| harness traceability          | `pnpm harness:check` passes                 |

## Verification Commands

```bash
pnpm harness:context EVAL-0013
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/mobile test -- invite
pnpm harness:check
pnpm validate:docs
# manual/dev-build: installed invite link, unauth stash, auth accept, re-tap fallback if PO-approved
```

## Expected Output Summary

한국어 요약: 딥링크 결과, token stash/accept, re-tap PO 결정, fallback, 실패 상태, 인증서/도메인.

## Harness Impact Questions

1. New folder structure? Maybe — invite or `capabilities/deep-linking`.
2. New naming convention? Maybe — deep-link route helpers.
3. New dependency? No unless PO chooses Branch/app-link helper.
4. Verification commands changed? Yes if invite tests or Maestro added.
5. Harness outdated? Maybe — app-link 표준화 시.
6. `.agents/` update? Only for harness mechanics.

## Stop Condition

- PO re-tap vs Branch 결정이 Blocked-by 해제에 반영.
- AC 전부 green(dev build).
- pass@3 실패 시 deep link / unauth stash / uninstalled fallback split.
