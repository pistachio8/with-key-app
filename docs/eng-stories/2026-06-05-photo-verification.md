---
eng-story: 2026-06-05-photo-verification
title: P2 사진 자동검증 데이터·판정·피어반려 파이프라인
author: pistachio8
date: 2026-06-05
status: draft
---

# Engineering Story: P2 사진 자동검증 데이터·판정·피어반려 파이프라인

> "친구 신뢰 기본 통과 + 명백한 부정만 차단 + 그룹 익명 다수결 반려(결과)를 위해 시스템은 `action_logs`에 서버 전용 검증 status 컬럼군(기본 `passed` · phash·EXIF·스크린샷 결정론 신호) + immutability 좁은 예외(status 사후 UPDATE · 사진 1회 교체) + 익명 반려 집계(기술 변경)를 가져야 한다, 사진은 운동을 증명 못 하고(false-reject 비용) `action_logs`가 immutable이며(Q9) 그룹장 단독 판정은 이해상충(제약) 때문에." 시스템 언어. 1 ES → N Work Package(05 §1.2).

## Parent / 직교 인용

- 상위 Job Story: [JS-verify-1 … 6](../stories/2026-06-05-p2-verification-job-stories.md)
- 상위 PRD AC: `AC-auto-verify-*` · `AC-cheat-detect-*` · `AC-peer-reject-*` · `AC-owner-load-*` ([PRD §5.B](../migration/01-rn-mvp-prd.md))
- 직교 결정(인용만 — 본문 복제 아님):
  - 데이터 모델: [ADR-0032 §4 정산·자동검증 데이터 모델](../adr/0032-settlement-verification-data-model.md) (`action_logs` 검증 컬럼 + `prevent_ai_column_update` 가드 확장 + immutability 예외 Q9)
  - 피드 캐시 경계: [ADR-0024 Layer1 이후 admin hydrate](../adr/0024-admin-cache-after-layer1-visibility.md) (검증 status·반려 집계가 인증 피드에 노출되는 read 경로)
  - 반려 reaction 저장·신규 이벤트 경계: [ADR-0032 §게이트·범위 경계](../adr/0032-settlement-verification-data-model.md) (🟨 익명 반려 = Kudos union 변경 → PO 승인 + 별도 spec, 신규 AnalyticsEvent → PRD §9.1 1:1 spec — **둘 다 선행 미작성**)
  - 게이트: [PRD §7 Q1](../migration/01-rn-mvp-prd.md) (G1 false-flag 임계 θ — 미확정, DECISION_NEEDED `G1-θ`)

## 서사 (지을 일 + 엔지니어링 왜)

POC의 "그룹장 수동 판정"을 없애려면, 인증마다 **결정론 부정 신호**(perceptual hash 재사용·EXIF 촬영시각 불일치·스크린샷 휴리스틱)를 제출 즉시 계산해 `action_logs.auto_verify_status`에 적재하되 **기본은 `passed`**(친구 신뢰 — 사진은 운동을 증명할 수 없으므로 false-reject 비용이 높다)로 두고 **명백한 부정만 `failed`**, 확신 못 하는 경계만 드물게 `manual_review`로 둔다. 네 검증 컬럼(`auto_verify_status`·`auto_verify_score`·`auto_verify_model_version`·`photo_phash`·`photo_captured_at`)은 **서버 write 전용**이며, 기존 AI 컬럼처럼 `prevent_ai_column_update` 가드 트리거(0002)를 확장해 클라 위조를 `42501`로 거부한다(새 메커니즘 아님, ADR-0032 §4). 자동검증은 비동기 확정·override라 작성 후 status를 서버가 UPDATE 해야 하므로 **immutability에 좁은 예외**(검증 status UPDATE + 마감 전 사진 1회 교체)를 둔다(Q9).

기계가 못 잡는 **맥락적 사기**는 **그룹 익명 다수결**로 거른다 — 🟨 반려를 Kudos와 별개 reaction으로 저장하되 누가 눌렀는지 숨기고 집계만 노출, **본인 제외 참가자 과반**이면 `peer_rejected`(카운트 제외), 토글로 과반 미달 시 복원, 유효기간은 정산 전(마감 후 48h). 이 다수결이 **그룹장 단독 검토를 대체**(이해상충 해소, Q8)하므로 그룹장은 일반 참가자로서 1표만 갖고 전용 권한이 없다. 기계 신호와 피어 다수결은 상호보완(기계=재탕·스크린샷, 피어=맥락)이다.

**게이트 경계**: 데이터 컬럼·가드 트리거·결정론 검사 *골격*은 G1과 무관하게 즉시 구현·테스트(05 §3). 단 **false-flag 임계 θ에 의존하는 판정 task는 `blocked`**(G1 PoC + θ 주입 후 활성). 피어 반려·운영 알림은 θ 무관이나, 반려 저장 모델·신규 이벤트는 각각 spec 선행이 필요하다.

## Work Packages (spawn)

- **WP1 — 검증 데이터 컬럼 migration** (`supabase/migrations/0044+`): `action_logs`에 `auto_verify_status`(enum `pending/passed/failed/manual_review/peer_rejected`)·`auto_verify_score`·`auto_verify_model_version`·`photo_phash`·`photo_captured_at` 추가 + `prevent_ai_column_update` 가드 확장 + status UPDATE·사진 1회 교체 immutability 예외. ADR-0032 §4 구현 + `BE_SCHEMA` 갱신. _gate: 설계·로컬 검증 무관(스키마는 θ 독립) / production apply는 후속._
- **WP2 — 결정론 부정탐지 판정 RPC**: phash 중복(그룹/전역)·EXIF 촬영시각·스크린샷 휴리스틱 신호 계산 → status 결정(기본 `passed`, 명백 부정 `failed`, 경계 `manual_review`). 제출 즉시 판정, 신호·`model_version` 기록(본문 미로깅). `AC-auto-verify-1~4`·`AC-cheat-detect-1,2`. _gate: **G1**(θ 임계) — θ 주입 전 판정 task `blocked`, 검사 골격·불변식 테스트는 선행._
- **WP3 — 온디바이스 사전검증** (RN 카메라): 흐림·스크린샷 업로드 전 1차 거름(차단 아닌 "다시 찍기" 권고, 빠른 응답). `AC-cheat-detect-3`. _gate: G1 무관(UX 휴리스틱)._
- **WP4 — 사진 1회 교체** (마감 전, immutability 예외): 교체 시 부정탐지 재실행, 1회 제한, 마감 후 차단. `AC-auto-verify-5`. _gate: WP1 의존._
- **WP5 — 🟨 피어 반려 + 그룹장 검토 대체**: 익명 반려 reaction 저장 + 본인 제외 과반 → `peer_rejected`, 토글·복원, 정산 전 48h 유효, 그룹장 1표. `AC-peer-reject-*`·`AC-owner-load-1,2`. _gate: reaction 저장 모델 = Kudos union 변경 spec + PO 선행(ADR-0032 §경계)._
- **WP6 — 운영 알림 + AnalyticsEvent**: `failed`·반려율 임계 초과 시 그룹 알림, 자동검증·반려 이벤트. `AC-owner-load-3`. _gate: 신규 이벤트는 PRD §9.1 union 1:1 spec 선행._

> 의존 순서: WP1 → (WP2 ∥ WP4) · WP3 독립 · WP5 → WP6. WP1·WP3·결정론 골격은 게이트 무관, WP2는 G1 blocked, WP5는 reaction spec 선행, WP6은 이벤트 spec 선행.

## Track

- **greenfield** (보존 baseline 없음 — POC 그룹장 수동 판정을 자동검증+피어 다수결로 신규 구축, D2).
