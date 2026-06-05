---
Task: EVAL-0022
Track: greenfield
Kind: migration
Status: todo
Depends-on: EVAL-0020(컬럼)·EVAL-0021(신호 골격) 구현 — intra-feature 순서(게이트 아님, EVAL-0006 선례). G1-θ는 잠정확정·주입됨(2026-06-05, spec `docs/superpowers/specs/2026-06-05-false-flag-threshold-theta.md`; 실측 PoC open).
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0022: θ 임계 자동검증 판정 — 결정론 신호 → status 결정 (기본 passed · 명백 부정만 failed)

> Work Package WP2b (`feat/rn-verify-judge`, WP2의 게이트 슬라이스). **G1-θ 해제** — false-flag 임계 θ가 잠정확정·주입됨(2026-06-05, conservative, [spec](../../docs/superpowers/specs/2026-06-05-false-flag-threshold-theta.md); 실측 PoC open이라 `false_flag_rate.active=false` 유지). 신호 계산 골격·불변식은 EVAL-0021에서 선행, 컬럼은 EVAL-0020. 본 task는 **주입된 θ**로 신호 → status를 매핑하는 *판정 로직*만 채운다(θ 하드코딩 금지 — config/env 주입).

## Parent Links

- Parent PRD Feature: `AC-auto-verify-1`(기본 `passed` 즉시 `doneCount` 인정) · `AC-auto-verify-2`(명백 부정만 `failed`, 피드엔 남음) · `AC-auto-verify-3`(경계만 드물게 `manual_review`) · `AC-cheat-detect-2`(동일/유사 해시 재사용 `failed` or `manual_review`) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- Parent Test Scenario: 별도 TS SoT 없음 — AT eval 수용기준으로 흡수(05 §2 D10). raw: [.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md)
- Parent Job Story: `JS-verify-1`(승인 없이 바로 카운트, 가짜만 걸러짐) · `JS-verify-3`(재탕·캡처 차단) — [docs/stories/2026-06-05-p2-verification-job-stories.md](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Parent Engineering Story: [2026-06-05-photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP2 (judgment 슬라이스)
- Parent Work Package: `feat/rn-verify-judge` (WP2)

## Goal

θ 임계가 확정되면 EVAL-0021의 결정론 신호를 status 결정으로 옮긴다. 이 task가 끝나면 제출 즉시(동기) 신호 벡터를 받아 **기본 `passed`**(친구 신뢰 — false-reject 비용 높음), θ를 넘는 **명백한 부정만 `failed`**, 확신 못 하는 경계만 드물게 `manual_review`로 두는 판정 RPC/서버 로직이 존재하고, 동일/유사 phash 재사용은 `failed`(or `manual_review`)로 떨어지며, 결정 결과·`model_version`이 EVAL-0020 컬럼에 서버 write로 기록된다. θ는 외부 주입 파라미터로 받아 코드 하드코딩하지 않는다.

## Source Files to Inspect

- `docs/migration/01-rn-mvp-prd.md` §7 Q1 (G1 θ 잠정확정·주입)
- `docs/superpowers/specs/2026-06-05-false-flag-threshold-theta.md` (θ SoT — 주입값·판정 매핑 규칙)
- `.agents/harness/config/harness.config.example.json` (`gates.false_flag_rate.judge` — θ 런타임 미러)
- `docs/adr/0032-settlement-verification-data-model.md` (§4 status 결정 경계)
- `evals/tasks/0021-verify-deterministic-signals-skeleton.md` (EVAL-0021 신호 모듈 — 의존; 구현 후 `apps/web/src/lib/verify/`)
- `evals/tasks/0020-verify-data-columns-migration.md` (EVAL-0020 컬럼 — 의존; 구현 후 `supabase/migrations/0044_*`)
- `apps/web/src/app/(app)/challenge/[id]/action/_actions.ts`

## Target Files

- `supabase/migrations/` 또는 `apps/web/src/lib/` — 신규 `verify/judge.ts` 신호 → status 판정 (SECURITY DEFINER RPC 또는 서버 전용 함수; status write는 service_role 경로)
- `apps/web/src/lib/` — 판정 단위 테스트 `verify/judge.spec.ts`

## Requirements

> θ 매핑·shadow·scope·런타임 주입 규칙의 SoT는 [spec `2026-06-05-false-flag-threshold-theta`](../../docs/superpowers/specs/2026-06-05-false-flag-threshold-theta.md)(grill 검증 반영). 아래는 그 요약.

- 입력 = EVAL-0021 신호 벡터 + 외부 주입 θ. 출력 = `passed | failed | manual_review`. **θ 하드코딩 금지** — **server-only env**(`VERIFY_PHASH_FAIL_MAX`·`VERIFY_PHASH_REVIEW_MAX`·`VERIFY_ENFORCE` 등)를 `apps/web/src/lib/verify/config.ts`가 zod 검증해 읽는다(`NEXT_PUBLIC_` 금지). harness config·spec은 문서 SoT 미러(런타임 아님).
- 기본 `passed`(`AC-auto-verify-1`), 명백 부정만 `failed`(`AC-auto-verify-2`), 경계만 드물게 `manual_review`(`AC-auto-verify-3`).
- **phash scope 차등**(`AC-cheat-detect-2`): 동일-user(+동일-group) 재사용 `d≤6` → `failed`; **전역 cross-user는 auto-`failed` 안 함**(신호/최대 `manual_review` — 생판 남 충돌 오판 방지). 해밍 임계는 **64비트 DCT pHash 기준**(EVAL-0021 확정, 다르면 재도출).
- **shadow mode**(G1 BLOCKING 보존): `VERIFY_ENFORCE=false`(=PoC 전)면 판정기는 would-be 결정만 기록, doneCount·피드는 전부 `passed` 취급(차단 0). `true`(PoC 통과 후)에서만 `failed` 실제 카운트 제외. shadow는 **신규 컬럼 불필요**(read-time enforce 게이트).
- `manual_review`도 **doneCount 인정**(사람 검토 큐 없음 — 피어 반려/hard `failed`만 다운그레이드). `failed`도 피드엔 남김(카운트만 제외, `AC-auto-verify-2`). 기계 오판 복구 = 사진 1회 교체(EVAL-0024).
- status·`model_version` write는 service_role 경로(EVAL-0020 가드 준수). 본문 미로깅.

## Non-goals

- 신호 _계산_ 자체 — WP2a/EVAL-0021 (본 task는 신호를 _해석_).
- 컬럼·가드 migration — WP1/EVAL-0020.
- 피어 다수결 반려(맥락적 사기) — WP5/EVAL-0025 (기계 신호와 상호보완).
- θ 값 결정 자체 — PO 정책(잠정확정, spec `2026-06-05-false-flag-threshold-theta`). 실측 PoC 튜닝은 dogfood 후속. 본 task는 주입된 θ를 _해석_.

## Acceptance Criteria

| 기준                                    | 검증 방법                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------- |
| 기본 passed (`AC-auto-verify-1`)        | 신호 청정 입력 → `passed` (θ 주입 픽스처)                                   |
| 명백 부정 failed (`AC-auto-verify-2`)   | θ 초과 신호 → `failed`, 피드 잔존·카운트 제외                               |
| 경계 manual_review (`AC-auto-verify-3`) | 경계 신호 → `manual_review` (드묾)                                          |
| 재탕 차단 (`AC-cheat-detect-2`)         | 동일-user/group phash `d≤6` → `failed`; 전역 cross-user → `failed` 아님     |
| shadow mode                             | `VERIFY_ENFORCE=false` → would-be 기록만, doneCount 영향 0 (픽스처)         |
| manual_review 카운트                    | `manual_review` 입력 → doneCount 인정(피어/hard failed만 제외)              |
| θ 외부 주입                             | θ 하드코딩 부재 — server env(`VERIFY_*`) zod 경로 대조, `NEXT_PUBLIC_` 부재 |
| harness traceability                    | `pnpm harness:check` 통과 (todo, 인용 resolve)                              |

## Verification Commands

```bash
# G1-θ 해제(θ 주입). EVAL-0020(컬럼)·EVAL-0021(신호) 구현 후:
pnpm harness:context EVAL-0022
pnpm typecheck && pnpm lint
pnpm test -- verify-judge   # θ 픽스처 주입 판정 테이블 테스트
pnpm harness:check
```

## Expected Output Summary

θ 주입 인터페이스, 신호 → status 매핑 규칙(기본 passed·failed·manual_review), 재탕 처리, service_role write 경로, G1 해제 전까지 보류 범위를 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? No — EVAL-0021 `lib/verify/` 재사용.
2. New naming convention? No.
3. New dependency? No (신호는 EVAL-0021 산출).
4. Verification commands changed? No — `pnpm test -- verify-judge` 스코프뿐.
5. Harness instructions outdated? No.
6. `.agents/` 문서 갱신? No.

## Stop Condition

- **θ 주입 완료** — EVAL-0020(컬럼)·EVAL-0021(신호) 구현 후 모든 Acceptance Criteria green + `pnpm harness:check` 통과.
- θ는 config/spec에 주입됨 — 판정 인터페이스·θ 픽스처 테이블·신호→status 매핑 로직 구현 가능. 실측 G1 PoC는 후속 튜닝(코드 변경 없이 주입값 교체).
- pass@3 안에 green 못 만들면 → 판정 규칙 단위로 split (프롬프트·컨텍스트 1회 점검 후, 05 §9.4).
