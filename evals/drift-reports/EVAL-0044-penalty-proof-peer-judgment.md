# Drift Report — EVAL-0044 벌칙 증명 제출·동료 판단(peer-reject 미러)

- Task: **EVAL-0044** (Track: greenfield · Kind: migration)
- Branch: `feat/penalty-proof-peer-judgment` (PR base `develop` — EVAL-0043은 PR #267로 develop 머지 완료, stack 아님)
- Date: 2026-06-24
- Trigger: spec §C3·§C4(ADR-0039) 구현 — 신규 `penalty_proofs`·`penalty_proof_rejections`·`penalty_debts` 3테이블 + `submit_penalty_proof`·`toggle_penalty_proof_rejection` SECURITY DEFINER RPC(0048 미러) + 창2 UI route + home 진입 섹션.

## Harness Impact Questions — 답변

1. **New folder structure? NO** — 기존 레이아웃 재사용: `supabase/migrations/`·`packages/domain/src/{validators,challenge}/`·`apps/web/src/lib/db/reads/`·route colocation(`challenge/[id]/penalty/{page,loading,_actions,_components}`). 신규 route 세그먼트 `penalty/`는 기존 `recap/`·`action/` 동형.
2. **New naming convention? YES(경미)** — peer-reject 컨벤션 동형 확장:
   - 테이블 `penalty_proofs`·`penalty_proof_rejections`·`penalty_debts`, RPC `submit_penalty_proof`·`toggle_penalty_proof_rejection`(`toggle_peer_rejection` 미러).
   - cache tag: `penalty-proof-reject-count-${proofId}`·`user-${viewerId}-penalty-proof-reject-${proofId}`·`penalty-video-${mediaPath}`(peer-reject·video-signed-url tag 동형).
   - 도메인 헬퍼 `isPenaltyProofRejectedByPeers`(과반식 TS SoT — peer-reject는 SQL에만 있어 미러 대상이 없었으므로 신규).
3. **New dependency? NO** — 신규 런타임 의존 없음. `@withkey/domain` 소비(validators/penalty + challenge/penalty-proof 추가).
4. **Verification commands changed? NO** — 기존 `pnpm typecheck`·`lint`·`test`·`validate:docs`·`test:integration` 스코프 그대로. AC의 `pnpm test:integration -- penalty-proof-rls`는 CI Integration이 실측.
5. **Harness instructions outdated? NO** — 워크플로/템플릿 가정 불변.
6. **`.agents/` 문서 갱신? NO** — analytics parity(PRD §9.1) 무변경(본 task analytics out of scope, 신규 이벤트 미추가).

## 주요 이탈 — migration 번호 0053 → 0055

- task 파일(Goal·Target·Requirements)은 신규 migration을 **`0053_penalty_redemption.sql`** 로 명시했으나, task 작성 이후 `0052_truncate_test_data_ledger_settlements`·`0053_test_cleanup_ledger_settlements_delete`·`0054_action_videos`가 먼저 머지돼 0053이 **이미 소진**됐다.
- **append-only(재정렬 금지) 규칙대로 next available `0055_penalty_redemption.sql`** 로 작성. spec(line 35)도 같은 사유로 예약번호가 밀린 선례(0054 헤더 참조)를 명시하고 있어 정합.
- task 본문은 append-only라 수정하지 않음(stale 번호는 본 drift 노트로 추적).

## 범위 결정 — submit RPC 포함

- task Requirements는 `toggle_penalty_proof_rejection`만 명시하나, `penalty_proofs` write=RPC만(spec §C3) + 제출 UI(창2)가 작동하려면 write 경로가 필요하다. 최소 필요 경로로 `submit_penalty_proof`(창2·서약·벌칙 챌린지·경로 검증) RPC를 함께 추가. penalty_debts 적재·수금·정산 연동·만료 cron·analytics는 Non-goals(EVAL-0045/후속) — penalty_debts는 테이블·RLS만.

## 리뷰(도메인 fan-out) 반영

- migration·backend·frontend 리뷰어 병렬, Blocker 0. 수정한 Major 2: (1) `submitPenaltyProof` zod 선검증(uploadVideo 전 challengeId 검증 — buildVideoPath throw로 ActionResult shape 깨지던 경계 결함), (2) BE_SCHEMA.md §5.8.2 + 카탈로그 + RLS 요약표 3테이블 문서화.
- 소스 교차검증: 익명성(voter_id read 비노출)·ADR-0024 admin hydrate(Layer1 RLS 후 hydrate)·과반식 0048 동일 — 확인.

## 외부 수동 조치 (PR 머지 전/후 CI·dogfood)

- **migration 0055 CI Integration 적용**: 로컬 Supabase 부재(메모리 기록)로 RLS·RPC·storage 경계는 CI Integration이 공유 Supabase에 db push(pending-only) 후 실측. AC2(RLS write=RPC만·voter 익명성)는 이 경로로 검증.
- **창2 UI 모바일 viewport(dogfood)**: getUserMedia/MediaRecorder 캡처·signed URL 재생은 jsdom 미지원이라 실기기 확인이 후속(AC3 — dogfood/preview 핸드오프).
- **production apply**: G2 게이트(0044·0050·0051·0054와 동일, 단방향·forward-only).
