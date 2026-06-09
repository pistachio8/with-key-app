---
Task: EVAL-0020
Track: greenfield
Kind: migration
Status: todo
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0020: 검증 데이터 컬럼 migration — action_logs 검증 status 컬럼군 + 가드 확장 + immutability 좁은 예외

> WP1 (`feat/rn-verify-data`). **게이트 무관** — 스키마는 θ 독립(05 §3), 즉시 진행. production apply만 후속. EVAL-0021·0022·0024의 데이터 전제.

## Parent Links

`AC-auto-verify-4`·`AC-auto-verify-5`·`AC-cheat-detect-1` — [01-rn-mvp-prd.md §5.B](../../docs/migration/01-rn-mvp-prd.md) · TS SoT 없음(AT eval 흡수, 05 §2 D10) · raw: [.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md) · `JS-verify-1`·`JS-verify-3` — [p2-verification-job-stories](../../docs/stories/2026-06-05-p2-verification-job-stories.md) · [photo-verification WP1](../../docs/eng-stories/2026-06-05-photo-verification.md) · WP: `feat/rn-verify-data`

## Goal

자동검증 status·신호의 서버 전용 저장 구조를 고정한다. 완료 시 ① 검증 컬럼군 5개(ADR-0032 §4) ② `prevent_ai_column_update` 가드 확장→클라 위조 write `42501` 거부 ③ immutability 예외 2가지(status 사후 UPDATE·마감 전 사진 교체) ④ `BE_SCHEMA` 갱신. 기본값 `passed`(친구 신뢰).

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md` (§4 자동검증 모델·가드·immutability Q9)
- `docs/eng-stories/2026-06-05-photo-verification.md`
- `supabase/migrations/0002_rls.sql` (`prevent_ai_column_update` 원형)
- `supabase/migrations/0010_action_logs_photo_path.sql`
- `packages/domain/src/validators/action-log.ts`
- `docs/BE_SCHEMA.md`

## Target Files

- `supabase/migrations/` — `0044_action_logs_verify_columns.sql` (+ 필요 시 `0045_action_logs_verify_immutability.sql` 분리; 번호 append, 재정렬 금지)
- `docs/BE_SCHEMA.md`

## Requirements

- `action_logs` 추가 컬럼: `auto_verify_status`(enum `pending/passed/failed/manual_review/peer_rejected`, default `passed`) · `auto_verify_score`(numeric?) · `auto_verify_model_version`(text?) · `photo_phash`(text?) · `photo_captured_at`(timestamptz?).
- 다섯 컬럼은 **서버 write 전용** — `prevent_ai_column_update` 가드 트리거 확장, `role <> 'service_role'` 직접 write를 `42501` 거부(새 메커니즘 금지, 0002 패턴 확장).
- immutability 예외 **2가지만**: ① service_role의 검증 status 사후 UPDATE ② 마감 전 사진 1회 교체. 그 외 본문(키워드·사진 경로) immutable.
- enum은 기존 status 흐름과 충돌 없게(`peer_rejected`는 WP5 카운트 제외용).
- 컬럼은 메타(신호·점수·버전)만 저장. 사진/일기 본문 미로깅.

## Non-goals

신호 계산(WP2a/EVAL-0021) / status 판정(WP2b/EVAL-0022) / shadow 신규 컬럼(`VERIFY_ENFORCE=false`는 would-be 기록·read-time gate 무시, 플래그 컬럼 미추가) / 사진 교체 흐름(WP4/EVAL-0024, 본 task는 예외 *허용*까지) / 피어 반려(WP5/EVAL-0025) / **production apply**(후속, down 없음).

## Acceptance Criteria

| 기준                                           | 검증 방법                                       |
| ---------------------------------------------- | ----------------------------------------------- |
| 검증 컬럼군 존재 (`AC-auto-verify-4`)          | 다섯 컬럼 + enum 타입 DDL 대조                  |
| 기본 status = passed (`AC-auto-verify-1` 전제) | default `passed` DDL 대조                       |
| 가드 write-deny                                | service_role 외 write → `42501` (CI)            |
| immutability 예외 2가지만                      | status·사진 교체만 허용, 본문 거부 → 트리거     |
| photo_phash 컬럼 (`AC-cheat-detect-1`)         | `photo_phash`·`photo_captured_at` 존재 DDL 대조 |
| harness traceability                           | `pnpm harness:check` 통과                       |

## Verification Commands

```bash
pnpm harness:context EVAL-0020
pnpm typecheck && pnpm lint
pnpm harness:check
# CI 전용(로컬 Supabase 스택 없음): migration apply + service_role 가드·immutability 역할 테스트
```

## Expected Output Summary

검증 컬럼군·enum·기본값, 가드 확장 범위, immutability 예외 2가지, BE_SCHEMA 갱신 지점, production apply 보류를 한국어로 요약한다.

## Harness Impact Questions

1~6: No — 신규 폴더·명명·의존·검증 커맨드·하네스·`.agents/` 변경 없음.

## Stop Condition

- 모든 AC checkable + 로컬 범위(typecheck·lint·harness:check) green.
- `pnpm harness:check` EVAL-0020 통과.
- pass@3 green 불가 시 → 컬럼 / 가드·immutability 단위로 split(05 §9.4).
