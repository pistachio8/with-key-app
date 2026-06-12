---
Task: EVAL-0017
Track: port
Kind: migration
Status: done
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/03-rn-migration-rules.md, docs/migration/04-rn-architecture.md, docs/adr/0037-rn-read-model-contract.md
---

# EVAL-0017: G8 Home + challenge read-only screens — real Supabase data

> 00 §8 G8. route shell·read contract 준비 후 read-only 사용자 가치 포팅. **blocked 해제(2026-06-12)**: 선행 EVAL-0014(G5)·EVAL-0016(G7) done — drift 해제 후보 advisory 검토 후 todo flip(선행이 develop 에 머지되어 base 는 develop, read contract 는 ADR-0037).

## Parent Links

- PRD Feature: home/challenge feed·dashboard·info read parity — [docs/PRD.md](../../docs/PRD.md) §4, §7, §10.
- Test Scenario: [TS-3.1~3.6, TS-4.1~4.3](../../docs/stories/2026-06-02-photo-verification-test-scenarios.md).
- Job Story: [docs/stories/2026-06-02-photo-verification-job-stories.md](../../docs/stories/2026-06-02-photo-verification-job-stories.md) S3~S4.
- Engineering Story: [00 §7](../../docs/migration/00-rn-conversion-plan.md) + [04 §5](../../docs/migration/04-rn-architecture.md).
- Work Package: `feat/rn-read-only-screens` (G8).

## Goal

홈·챌린지 read-only 화면이 실 Supabase 데이터로 렌더된다. 홈은 진행/미서명/종료 대기를 표시하고, 챌린지 상세는 PWA 동일 상태를 보인다. RLS 안에서 web 데이터가 RN에서 읽힌다.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `docs/stories/2026-06-02-photo-verification-job-stories.md`
- `docs/stories/2026-06-02-photo-verification-test-scenarios.md`
- `apps/web/src/app/(app)/home`
- `apps/web/src/app/(app)/challenge/[id]`
- `apps/web/src/lib/db/reads`

## Target Files

- `apps` — mobile home·challenge read-only screens/components/hooks.
- `packages/domain` — 공유 타입 소비; 재구현 금지.
- `apps/web/src/lib/db/reads` — parity 참조 전용.

## Requirements

- Home: EVAL-0016 계약으로 current/pending/closed 요약 렌더.
- feed 카드: author/photo/keywords/AI diary/시간/empty state/image 실패/접근 경계.
- dashboard/info: goalCount/doneCount/기간/참가자/penalty POC read-only.
- RLS 보존; 비멤버 feed/photo 불가.
- signed photo URL·cache 계약 준수; 범위 외 private URL 노출 금지.
- mobile-native 컴포넌트·safe-area/scroll; DOM/Tailwind 복사 금지.
- PRD §9.1 승인 이벤트 외 write 금지.

## Non-goals

- challenge create/invite/pledge/start(EVAL-0018), action log 제출(EVAL-0019).
- Push 알림·notification center·recap/share, EVAL-0016 계약 변경.
- P1/P2 settlement·auto-verification 화면.

## Acceptance Criteria

| 기준                     | 검증 방법                             |
| ------------------------ | ------------------------------------- |
| home real data           | current/pending/closed 요약 렌더      |
| feed real data           | logs + photo + metadata 렌더          |
| dashboard/info real data | doneCount/goalCount/기간/penalty 일치 |
| RLS boundary             | 비멤버 feed/photo 미노출              |
| empty/error states       | empty·image 실패 표시, 비크래시       |
| mobile layout smoke      | iOS/Android blocking overlap 없음     |
| harness traceability     | `pnpm harness:check` passes           |

## Verification Commands

```bash
pnpm harness:context EVAL-0017
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/mobile test -- read-only
pnpm harness:check
pnpm validate:docs
# manual/dev-build: login -> home -> challenge feed/dashboard/info with seeded Supabase data
```

## Expected Output Summary

소비 contract, 실데이터 smoke, PWA read parity, RLS/photo boundary, mutation/action-log 후속을 한국어로 요약.

## Harness Impact Questions

1. New folder structure? Maybe — home/challenge components/hooks.
2. New naming convention? Maybe — query key from EVAL-0016.
3. New dependency? No unless accepted by spec.
4. Verification commands changed? Maybe — read-only tests or Maestro smoke.
5. Harness outdated? Maybe — if mobile smoke becomes mandatory.
6. `.agents/` update? Only if verification workflow changes.

## Stop Condition

- Home·challenge feed/dashboard/info 인증 사용자에게 실데이터 렌더.
- RLS negative·empty/error state 검증.
- pass@3 green 불가 → home/feed/dashboard-info split.
