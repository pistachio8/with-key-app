---
Task: EVAL-0021
Track: greenfield
Kind: migration
Status: todo
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0021: 결정론 부정 신호 계산 골격 — phash·EXIF·스크린샷 휴리스틱 + 불변식 테스트

> Work Package WP2a (`feat/rn-verify-judge`, WP2의 비게이트 슬라이스). **게이트 무관 — 선행**(ES §게이트 경계: "결정론 검사 골격·불변식 테스트는 G1과 무관하게 즉시 구현·테스트"). θ 임계에 의존하는 status *판정*은 EVAL-0022(blocked)로 분리. 본 task는 신호를 계산·기록만 하고 합/불 결정은 하지 않는다.

## Parent Links

- Parent PRD Feature: `AC-cheat-detect-1`(MVP 신호 3종: perceptual hash 중복 · EXIF 촬영시각 · 스크린샷 휴리스틱) · `AC-auto-verify-4`(신호·모델 버전을 `action_logs`에 기록, 본문 미로깅) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- Parent Test Scenario: 별도 TS SoT 없음 — AT eval 수용기준으로 흡수(05 §2 D10). raw: [.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md)
- Parent Job Story: `JS-verify-3`(재탕·캡처 사진이 통하지 않는 공정함) — [docs/stories/2026-06-05-p2-verification-job-stories.md](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Parent Engineering Story: [2026-06-05-photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP2 (skeleton 슬라이스)
- Parent Work Package: `feat/rn-verify-judge` (WP2)

## Goal

θ와 무관하게 즉시 구현 가능한 결정론 신호 계산기를 고정한다. 이 task가 끝나면 제출 사진에서 ① perceptual hash(`photo_phash`) ② EXIF 촬영시각(`photo_captured_at`, 챌린지 기간·제출시각과의 거리) ③ 스크린샷 휴리스틱(상태바·EXIF 카메라 정보 부재)을 결정론적으로 계산하는 순수 함수가 존재하고, 그룹/전역 phash 중복 조회가 동작하며, 동일 입력 → 동일 신호의 **결정론 불변식**이 단위 테스트로 검증되고, 신호·`model_version`이 EVAL-0020 컬럼에 기록된다. **status 합/불 판정은 하지 않는다**(θ 의존, EVAL-0022).

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md` (§4 검증 신호)
- `docs/eng-stories/2026-06-05-photo-verification.md`
- `apps/web/src/lib/storage/action-photos.ts`
- `apps/web/src/lib/validators/action-log.ts`
- `apps/web/src/app/(app)/challenge/[id]/action/_actions.ts` (제출 경로 — 신호 계산 hook 지점)

## Target Files

- `apps/web/src/lib/` — 신규 `verify/` 신호 계산 모듈(`phash.ts` · `exif.ts` · `screenshot-heuristic.ts` 또는 동등 분리) + 단위 테스트(`*.spec.ts`)
- (조회) phash 중복 read — `apps/web/src/lib/db/reads/` 신규 함수 또는 RPC 입력 헬퍼

## Requirements

- perceptual hash 계산 = 결정론(동일 이미지 → 동일 hash). 그룹 내/전역 중복 조회 입력 제공(`AC-cheat-detect-1` ①). 해시 = **64비트 DCT pHash**(sharp grayscale→DCT) — EVAL-0022 θ 임계(해밍 6/10)가 이 비트수에 정합하므로 다른 비트수/알고리즘 채택 시 `docs/superpowers/specs/2026-06-05-false-flag-threshold-theta.md` θ 재도출 필요.
- EXIF 촬영시각 파싱 → `photo_captured_at` 산출. 부재/조작 시 신호 플래그(`AC-cheat-detect-1` ②).
- 스크린샷 휴리스틱: EXIF 카메라 정보 부재·상태바 패턴 등 결정론 신호(`AC-cheat-detect-1` ③).
- 계산 결과는 EVAL-0020 컬럼(`photo_phash`·`photo_captured_at`·`auto_verify_score`·`auto_verify_model_version`)에 서버가 기록. 사진/본문 미로깅 — 신호 메타만.
- **결정론 불변식 테스트**(θ 무관 즉시 활성): 동일 입력 → 동일 신호 벡터, 명백 재탕(동일 phash) → 중복 플래그 true. status 결정값은 단언하지 않음.

## Non-goals

- **status 합/불 판정**(`passed`/`failed`/`manual_review` 결정) — θ 임계 의존, WP2b/EVAL-0022 (G1 blocked).
- 검증 컬럼 migration·가드 — WP1/EVAL-0020 (본 task는 그 컬럼에 기록만).
- 온디바이스 사전검증(업로드 전 거름) — WP3/EVAL-0023.
- AI생성·재촬영 우회 하드닝(`AC-cheat-detect-4`) — Fast-follow red-team, 본 task 밖.

## Acceptance Criteria

| 기준                                      | 검증 방법                                                     |
| ----------------------------------------- | ------------------------------------------------------------- |
| phash 결정론 (`AC-cheat-detect-1` ①)      | 단위 테스트: 동일 이미지 → 동일 hash, 변형 이미지 → 거리 측정 |
| 중복 재탕 플래그 (`AC-cheat-detect-1` ①)  | 동일 phash 입력 → 그룹/전역 중복 신호 true                    |
| EXIF 촬영시각 (`AC-cheat-detect-1` ②)     | EXIF 있는 사진 → `photo_captured_at` 산출, 부재 → 플래그      |
| 스크린샷 휴리스틱 (`AC-cheat-detect-1` ③) | 카메라 EXIF 부재/스크린샷 패턴 → 신호 true                    |
| 신호 기록 (`AC-auto-verify-4`)            | 신호·`model_version`이 `action_logs` 컬럼에 기록, 본문 미로깅 |
| harness traceability                      | `pnpm harness:check` 통과                                     |

## Verification Commands

```bash
pnpm harness:context EVAL-0021
pnpm typecheck && pnpm lint
pnpm test -- verify        # 결정론 신호 불변식 (로컬, DB 불필요)
pnpm harness:check
```

## Expected Output Summary

세 신호(phash·EXIF·스크린샷) 계산 모듈 위치, 결정론 불변식 테스트 결과, EVAL-0020 컬럼 기록 지점, status 판정이 EVAL-0022(G1)로 분리되어 본 task에서 결정값을 내지 않음을 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? `apps/web/src/lib/verify/` 신규 — yes (검증 신호 모듈 홈). → drift 노트.
2. New naming convention? No — `*.ts`·`*.spec.ts` 기존 규약.
3. New dependency? perceptual hash·EXIF 파서 라이브러리 도입 가능 — yes일 수 있음(BE 판단, registry 우선). → drift 노트.
4. Verification commands changed? No — `pnpm test -- verify` 스코프 추가뿐.
5. Harness instructions outdated? No.
6. `.agents/` 문서 갱신? `lib/verify/` 신규 폴더·신규 의존 발생 시 yes → `evals/drift-reports/`에 노트 + check-harness-drift.

## Stop Condition

- 결정론 신호 불변식 테스트 green + `pnpm harness:check` 통과.
- status 판정값을 단언하지 않음(scope 봉인 — θ는 EVAL-0022).
- pass@3 안에 green 못 만들면 → 신호 단위(phash / EXIF / 스크린샷)로 split (프롬프트·컨텍스트 1회 점검 후, 05 §9.4).
