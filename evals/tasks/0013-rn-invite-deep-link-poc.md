---
Task: EVAL-0013
Track: port
Kind: migration
Status: blocked
Blocked-by: EVAL-0012(G3 auth PoC) complete + PO decision — MVP re-tap deferred invite UX accepted vs Branch moved earlier(04 A7, 04 §9).
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/04-rn-architecture.md, docs/migration/05-rn-harness-decisions.md
---

# EVAL-0013: G4 Invite deep link PoC — installed auto return + uninstalled re-tap path

> 00 §8 G4. 04 A7의 deferred 복구는 "미설치 후 재탭" MVP안이며 PO 확정이 남아 있다. Branch 등 자동 deferred 플랫폼 도입 여부를 이 task에서 임의 결정하지 않는다.

## Parent Links

- Parent PRD Feature: POC PRD §3 초대 링크/서약 + RN delta [00 §8 G4](../../docs/migration/00-rn-conversion-plan.md).
- Parent Test Scenario: `TS-rn-invite-1`~`TS-rn-invite-5`는 본 파일 Acceptance Criteria에 흡수(D10) — [docs/migration/05-rn-harness-decisions.md](../../docs/migration/05-rn-harness-decisions.md) §2.
- Parent Job Story: "초대 링크를 받아 설치/로그인 뒤 같은 초대 맥락으로 돌아와 수락한다" — [docs/PRD.md](../../docs/PRD.md) §3.2.
- Parent Engineering Story: [04 §4 A7 딥링크](../../docs/migration/04-rn-architecture.md) + [00 §13.4 D-8](../../docs/migration/00-rn-conversion-plan.md).
- Parent Work Package: `feat/rn-invite-deep-link` (G4).

## Goal

초대 URL이 RN 앱 진입과 초대 수락까지 이어지는지 실기기 dev build에서 증명한다. 설치된 앱은 universal/app link 또는 `fromwith://invite/<token>`로 열리고, 미인증 사용자는 token을 안전하게 stash한 뒤 로그인 성공 후 같은 token으로 `accept_invite` RPC를 호출해 자동 복귀한다. 미설치 사용자는 웹 랜딩에서 스토어로 이동하고, 설치 후 같은 링크를 재탭해 수락하는 MVP 경로가 PO 승인 범위 안에서 동작한다.

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

- `apps` — implement mobile invite route, deep-link capability, token stash, and post-login accept flow.
- `apps/web/src/app` — host/adjust well-known app link files or web fallback only as required.
- `apps/web/src/lib/invite` — reuse URL/token rules without changing token semantics.

## Requirements

- Preserve existing https invite URL format for Kakao share/OG fallback.
- Installed app path: universal/app link or `fromwith://invite/<token>` opens the RN invite route.
- If unauthenticated, stash `<token>` in secure local storage, route to login, then call `accept_invite` after session establishment.
- If authenticated, call `accept_invite` directly and navigate to the accepted challenge/pledge target.
- Handle expired/full/already-joined invite states using the existing preview/RPC semantics.
- Uninstalled MVP path follows 04 A7 only after PO acceptance: web landing -> store -> install -> same link re-tap -> app open -> accept. Do not add Branch/Firebase Dynamic Links unless PO decision changes.
- Emit only existing approved analytics events unless a PRD §9.1/spec update has already approved new ones.

## Non-goals

- Kakao native auth implementation — EVAL-0012.
- Full route skeleton/tabs beyond invite/login route — EVAL-0014.
- Changing invite token format, expiry, or `accept_invite` RPC semantics.
- Implementing automatic deferred deep linking with Branch before PO approval.
- PWA invite fallback removal.

## Acceptance Criteria

| 기준                          | 검증 방법                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| installed deep link opens app | test universal/app link and/or scheme on iOS/Android dev build                               |
| unauth token stash            | unauth invite open -> login -> same token accepted without manual token entry                |
| authenticated accept          | authenticated invite open calls `accept_invite` and lands on correct challenge/pledge screen |
| invalid states preserved      | expired/full/already-joined states match existing web/RPC behavior                           |
| uninstalled re-tap path       | PO-approved re-tap flow documented and manually smoke-tested, or remains blocked             |
| no deferred decision drift    | no Branch/Firebase replacement appears without PO decision                                   |
| harness traceability          | `pnpm harness:check` passes                                                                  |

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

완료 보고는 설치 앱 딥링크 결과, token stash와 로그인 후 accept 흐름, 미설치 re-tap PO 결정 상태, 기존 웹 invite fallback 영향, 실패 상태 처리, 남은 앱링크 인증서/도메인 작업을 한국어로 요약한다.

## Harness Impact Questions

1. Did this task introduce a new folder structure? Maybe — `capabilities/deep-linking` or invite feature folder.
2. Did this task introduce a new naming convention? Maybe — deep-link route mapping helpers.
3. Did this task introduce a new dependency? No unless PO chooses Branch or an app-link helper package.
4. Did this task change verification commands? Yes if mobile invite tests or Maestro smoke are added.
5. Did this task reveal that the current harness instructions are outdated? Maybe — if manual app-link verification needs standardization.
6. Should any `.agents/` document be updated? Only for harness verification mechanics; PO/product decision docs are separate.

## Stop Condition

- PO decision on re-tap vs Branch is explicit and reflected in Blocked-by removal.
- All Acceptance Criteria green on dev build.
- pass@3 안에 green 못 만들면 installed deep link / unauth stash / uninstalled fallback으로 split.
