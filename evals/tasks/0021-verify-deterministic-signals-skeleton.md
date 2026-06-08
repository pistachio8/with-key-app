---
Task: EVAL-0021
Track: greenfield
Kind: migration
Status: todo
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0021: 결정론 부정 신호 계산 골격 — phash·EXIF·스크린샷 휴리스틱 + 불변식 테스트

> WP2a (`feat/rn-verify-judge`, 비게이트 슬라이스). **게이트 무관 — 선행**(ES §게이트 경계). θ 의존 status *판정*은 EVAL-0022(blocked)로 분리. 본 task는 신호 계산·기록만, 합/불 결정 하지 않는다.

## Parent Links

`AC-cheat-detect-1`·`AC-auto-verify-4` — [01-rn-mvp-prd.md §5.B](../../docs/migration/01-rn-mvp-prd.md) · TS SoT 없음(AT eval 흡수, 05 §2 D10) · raw: [.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md) · `JS-verify-3` — [p2-verification-job-stories](../../docs/stories/2026-06-05-p2-verification-job-stories.md) · [photo-verification WP2 skeleton](../../docs/eng-stories/2026-06-05-photo-verification.md) · WP: `feat/rn-verify-judge`

## Goal

θ와 무관하게 즉시 구현 가능한 결정론 신호 계산기를 고정한다. 완료 시 ① phash(`photo_phash`) ② EXIF 촬영시각(`photo_captured_at`, 제출시각 거리) ③ 스크린샷 휴리스틱을 결정론 계산하는 순수 함수와 그룹/전역 phash 중복 조회가 존재하고, 동일 입력 → 동일 신호 **결정론 불변식**이 단위 테스트로 검증되며, 신호·`model_version`이 EVAL-0020 컬럼에 기록된다. **status 판정은 하지 않는다**(θ 의존, EVAL-0022).

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md` (§4 검증 신호)
- `docs/eng-stories/2026-06-05-photo-verification.md`
- `apps/web/src/lib/storage/action-photos.ts`
- `packages/domain/src/validators/action-log.ts`
- `apps/web/src/app/(app)/challenge/[id]/action/_actions.ts`

## Target Files

- `apps/web/src/lib/` — 신규 `verify/` 모듈(`phash.ts`·`exif.ts`·`screenshot-heuristic.ts` 또는 동등 분리) + `*.spec.ts`
- phash 중복 read: `apps/web/src/lib/db/reads/` 신규 함수 또는 RPC 헬퍼

## Requirements

- perceptual hash = 결정론(동일 이미지 → 동일 hash). 그룹/전역 중복 조회 입력 제공(`AC-cheat-detect-1` ①). **64비트 DCT pHash**(sharp grayscale→DCT) — 다른 비트수/알고리즘 채택 시 θ 재도출 필요.
- EXIF 촬영시각 파싱 → `photo_captured_at`. 부재/조작 시 신호 플래그(`AC-cheat-detect-1` ②).
- 스크린샷 휴리스틱: EXIF 카메라 부재·상태바 패턴 결정론 신호(`AC-cheat-detect-1` ③).
- 계산 결과는 EVAL-0020 컬럼(`photo_phash`·`photo_captured_at`·`auto_verify_score`·`auto_verify_model_version`)에 서버 기록. 본문 미로깅.
- **결정론 불변식 테스트**(즉시 활성): 동일 입력 → 동일 신호, 동일 phash → 중복 플래그 true. status 단언 안 함.

## Non-goals

**status 판정**(θ 의존, WP2b/EVAL-0022) / 검증 컬럼 migration·가드(WP1/EVAL-0020) / 온디바이스 사전검증(WP3/EVAL-0023) / AI생성·재촬영 하드닝(`AC-cheat-detect-4`, Fast-follow).

## Acceptance Criteria

| 기준                                      | 검증 방법                                              |
| ----------------------------------------- | ------------------------------------------------------ |
| phash 결정론 (`AC-cheat-detect-1` ①)      | 동일 이미지 → 동일 hash, 변형 → 거리 측정              |
| 중복 재탕 플래그 (`AC-cheat-detect-1` ①)  | 동일 phash → 그룹/전역 중복 신호 true                  |
| EXIF 촬영시각 (`AC-cheat-detect-1` ②)     | EXIF 있는 사진 → `photo_captured_at`, 부재 → 플래그    |
| 스크린샷 휴리스틱 (`AC-cheat-detect-1` ③) | 카메라 EXIF 부재/스크린샷 패턴 → 신호 true             |
| 신호 기록 (`AC-auto-verify-4`)            | 신호·`model_version` → `action_logs` 기록, 본문 미로깅 |
| harness traceability                      | `pnpm harness:check` 통과                              |

## Verification Commands

```bash
pnpm harness:context EVAL-0021
pnpm typecheck && pnpm lint
pnpm test -- verify        # 결정론 신호 불변식 (로컬, DB 불필요)
pnpm harness:check
```

## Expected Output Summary

세 신호(phash·EXIF·스크린샷) 모듈 위치, 결정론 불변식 테스트 결과, EVAL-0020 컬럼 기록 지점, status 판정이 EVAL-0022로 분리됨을 한국어로 요약한다.

## Harness Impact Questions

1. 폴더? Yes — `apps/web/src/lib/verify/` 신규 → drift. 2. 명명? No. 3. 의존? Yes 가능(phash·EXIF 파서, registry 우선) → drift. 4. 검증 커맨드? No. 5. 하네스 outdated? No. 6. `.agents/`? 신규 폴더·의존 시 yes → `evals/drift-reports/`.

## Stop Condition

결정론 신호 불변식 테스트 green + `pnpm harness:check` 통과. status 판정값 단언 안 함(θ는 EVAL-0022). pass@3 green 불가 시 phash / EXIF / 스크린샷 단위로 split(05 §9.4).
