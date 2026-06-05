---
Task: EVAL-0020
Track: greenfield
Kind: migration
Status: todo
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0020: 검증 데이터 컬럼 migration — action_logs 검증 status 컬럼군 + 가드 확장 + immutability 좁은 예외

> Work Package WP1 (`feat/rn-verify-data`). **게이트 무관** — 스키마는 θ 독립(05 §3), 설계·로컬 검증·코드는 즉시 진행. production migration apply만 후속. 결정론 검사 골격(EVAL-0021)·판정(EVAL-0022)·교체(EVAL-0024)의 데이터 전제.

## Parent Links

- Parent PRD Feature: `AC-auto-verify-4`(결과·신호·모델 버전 기록, 본문 미로깅) · `AC-auto-verify-5`(마감 전 1회 교체 = immutability 예외 데이터 전제) · `AC-cheat-detect-1`(`photo_phash` 컬럼) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- Parent Test Scenario: 별도 TS SoT 없음 — greenfield라 AT eval 수용기준으로 흡수(05 §2 D10). 엣지케이스 raw: [.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md)
- Parent Job Story: `JS-verify-1`(승인 없이 바로 카운트) · `JS-verify-3`(재탕·캡처 차단) — [docs/stories/2026-06-05-p2-verification-job-stories.md](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Parent Engineering Story: [2026-06-05-photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP1
- Parent Work Package: `feat/rn-verify-data` (WP1)

## Goal

자동검증 status·신호를 적재할 서버 전용 저장 구조를 고정한다. 이 task가 끝나면 `action_logs`에 검증 컬럼군(`auto_verify_status` enum · `auto_verify_score` · `auto_verify_model_version` · `photo_phash` · `photo_captured_at`)이 ADR-0032 §4대로 migration 파일로 존재하고, 기존 `prevent_ai_column_update` 가드 트리거(0002)가 이 컬럼군까지 확장되어 클라 위조 write가 `42501`로 거부되며, immutability에 **좁은 예외 2가지**(검증 status 사후 UPDATE · 마감 전 사진 1회 교체)만 허용되고, `BE_SCHEMA`가 갱신된다. 기본값은 `passed`(친구 신뢰).

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md` (§4 자동검증 데이터 모델 · 가드 확장 · immutability 예외 Q9)
- `docs/eng-stories/2026-06-05-photo-verification.md`
- `supabase/migrations/0002_rls.sql` (`prevent_ai_column_update` 가드 트리거 원형)
- `supabase/migrations/0010_action_logs_photo_path.sql`
- `apps/web/src/lib/validators/action-log.ts`
- `docs/BE_SCHEMA.md`

## Target Files

- `supabase/migrations/` — 신규 `0044_action_logs_verify_columns.sql` (+ 필요 시 `0045_action_logs_verify_immutability.sql`로 가드/예외 분리; 번호 맨 뒤 append, 재정렬 금지)
- `docs/BE_SCHEMA.md`

## Requirements

- `action_logs` 추가 컬럼: `auto_verify_status`(enum `pending/passed/failed/manual_review/peer_rejected`, default `passed`) · `auto_verify_score`(numeric nullable) · `auto_verify_model_version`(text nullable) · `photo_phash`(text nullable) · `photo_captured_at`(timestamptz nullable).
- 다섯 컬럼은 **서버 write 전용** — `prevent_ai_column_update` 가드 트리거를 확장해 `role <> 'service_role'`의 직접 write/update를 `42501`로 거부(새 메커니즘 만들지 않음, 0002 패턴 확장).
- immutability 좁은 예외 **2가지만**: ① 서버(service_role)의 검증 status 사후 UPDATE ② 마감 전 사진 1회 교체. 그 외 `action_logs` 본문(키워드·생성 사진 경로 등) immutable 유지.
- enum 값 추가는 기존 status 흐름과 충돌 없게(기본 `passed`, `peer_rejected`는 WP5 카운트 제외용).
- 본문 미로깅 — 컬럼은 메타(신호·점수·버전)만 저장, 사진/일기 본문 아님.

## Non-goals

- 신호 계산 로직(phash/EXIF/스크린샷) — WP2a/EVAL-0021.
- status 판정(θ 임계) 로직 — WP2b/EVAL-0022 (G1 blocked).
- 사진 교체 흐름 구현 — WP4/EVAL-0024 (본 task는 예외 *허용*까지).
- 피어 반려 reaction 저장 — WP5/EVAL-0025.
- **production migration apply** — 후속(스키마 설계·로컬 검증·코드까지). down 스크립트(POC forward-only).

## Acceptance Criteria

| 기준                                           | 검증 방법                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| 검증 컬럼군 존재 (`AC-auto-verify-4`)          | 다섯 컬럼 + enum 타입을 migration DDL 대조                                |
| 기본 status = passed (`AC-auto-verify-1` 전제) | `auto_verify_status` default `passed`를 DDL 대조                          |
| 가드 write-deny                                | service_role 외 검증 컬럼 직접 write가 `42501` (CI 역할 테스트)           |
| immutability 예외 2가지만                      | status UPDATE·사진 1회 교체만 허용, 본문 UPDATE 거부를 트리거 정의 대조   |
| photo_phash 컬럼 (`AC-cheat-detect-1`)         | `photo_phash`·`photo_captured_at` 컬럼 존재 DDL 대조                      |
| harness traceability                           | `pnpm harness:check`가 frontmatter·Parent·Source·Target·AC 인용 검증·통과 |

## Verification Commands

```bash
pnpm harness:context EVAL-0020
pnpm typecheck && pnpm lint
pnpm harness:check
# CI 전용(로컬 Supabase 스택 없음): migration apply + service_role 가드·immutability 역할 테스트
```

## Expected Output Summary

추가된 검증 컬럼군·enum·기본값 위치, 가드 트리거 확장 범위, immutability 좁은 예외 2가지 정의, BE_SCHEMA 갱신 지점, production apply가 후속으로 보류되는 범위를 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? No — `supabase/migrations/`·`docs/` 기존 위치.
2. New naming convention? No — `000X_<snake_case>.sql` 유지.
3. New dependency? No.
4. Verification commands changed? No — 기존 `harness:*`·CI migration apply 사용.
5. Harness instructions outdated? No.
6. `.agents/` 문서 갱신? No.

## Stop Condition

- 모든 Acceptance Criteria checkable + 로컬 가능 범위(typecheck·lint·harness:check) green.
- `pnpm harness:check`가 EVAL-0020에 대해 통과.
- pass@3 안에 green 못 만들면 → migration 단위(컬럼 / 가드·immutability)로 split (프롬프트·컨텍스트 1회 점검 후, 05 §9.4).
