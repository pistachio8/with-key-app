# Drift Report — EVAL-0025 🟨 익명 피어 반려 + 그룹장 검토 대체

- Task: **EVAL-0025** (Track: greenfield · Kind: migration · WP5)
- Branch: `feat/rn-peer-reject`
- Date: 2026-06-14
- Trigger: ADR-0038(accepted, PO 승인) 구현 — 신규 `peer_rejections` 테이블 + `toggle_peer_rejection` SECURITY DEFINER RPC + 익명 집계 read 2종 + 🟨 1탭 UI + doneCount 배선. 그룹장 단독 판정을 익명 다수결로 대체.

## Harness Impact Questions — 답변

1. **New folder structure? NO** — 기존 레이아웃 재사용: `supabase/migrations/`·`packages/domain/src/validators/`·`apps/web/src/lib/db/reads/`·route colocation(`challenge/[id]/_components`·`_actions.ts`).
2. **New naming convention? YES** — 신규 명명 도입:
   - 테이블 `peer_rejections`, 컬럼 `voter_id`(kudos 의 `user_id` 와 의미는 같으나 "반려자=익명 voter" 강조 위해 명명 분리).
   - RPC `toggle_peer_rejection`(kudos 는 Server Action 토글, 반려는 RPC 토글 — 익명·판정 입력이라 DB 안에서 닫음).
   - cache tag: `peer-reject-count-${actionLogId}`(viewer-agnostic) · `user-${viewerId}-peer-reject-${actionLogId}`(viewer-specific) — kudos tag 컨벤션(`kudos-counts-`·`user-...-kudos-`) 동형 확장.
   - read 함수 `getPeerRejectCountForLog`·`getViewerPeerRejectionForLog`(kudos-counts/kudos-viewer 동형).
3. **New dependency? NO** — 신규 런타임 의존 없음. `@withkey/domain` 소비(peer-rejection validator 추가).
4. **Verification commands changed? NO** — 기존 `pnpm typecheck`·`lint`·`test`(unit)·`test:integration`(local stack) 스코프 그대로. peer-reject 통합 테스트는 `tests/integration/peer-reject.spec.ts`.
5. **Harness instructions outdated? NO** — 워크플로/템플릿 가정 불변.
6. **`.agents/` 문서 갱신? NO(불요)** — analytics parity(PRD §9.1) **무변경**: ADR-0038 결정대로 kudos union 을 건드리지 않고 별도 테이블로 분리해, AnalyticsEvent 가드레일 인용을 바꿀 필요가 없다. 반려율·운영 알림 이벤트는 EVAL-0026(별도 spec) 범위. Kudos/analytics 가드레일 본문 갱신 없음.

## doneCount 배선 — 범위 결정 (read↔정산 정합 경계)

- ADR-0038 §후속영향은 "doneCount read 3경로에 `countsTowardDone` 배선"을 권고했다. 본 task 는 **개인 `doneCount`·`verifiedToday`(진행 표시)에서만 `peer_rejected` 를 제외**하고, `potTotal`·`confirmedPenalty`(정산 추정)는 full 집합 유지(`current-challenges.ts`).
- **왜**: 서버 정산 RPC(`0044 _settlement_confirmed_penalties`)는 `auto_verify_status` 필터가 없어 peer_rejected 를 제외하지 않는다. read 추정만 제외하면 표시 pot 과 실제 정산이 어긋난다. read 추정을 정산 RPC 와 정합 유지하고, 정산 측 peer_rejected 제외는 **EVAL-0008(P1 정산, 역방향 의존)** 후속으로 함께 닫는다.
- `countsTowardDone` 의 `failed`/enforce 분기(read-side 배선)는 **EVAL-0022(자동검증 판정) Non-goal** 이라 본 task 범위 밖 — peer_rejected 만 명시 제외.

## 검증 (로컬 실측)

- `pnpm typecheck` green(domain·web·mobile). `pnpm lint` green. `pnpm test`(unit) green — web 714 / mobile 154.
- `tests/integration/peer-reject.spec.ts` **6/6 통과**(로컬 supabase stack, 0048 적용 후): 자기 반려 거부 · 본인 제외 과반 전이 · 토글 복원 · 익명성 RLS(타인 voter_id 비노출) · 클라 직접 write 거부(RPC only) · 48h 윈도우 종료.
- migration `supabase db reset` 으로 0001–0048 클린 적용 확인. `supabase gen types --local` 결과에서 `peer_rejections`·`toggle_peer_rejection` 타입을 committed `supabase.ts` 에 surgical 삽입(전체 재생성 churn 회피).

## 외부 수동 조치 (PR 머지 전/후 PO·CI)

- **migration 0048 remote(linked) 적용**: 통합 테스트(CI)·`db:types --linked` 는 linked 프로젝트 기준이라, 0048 을 linked Supabase 에 적용해야 CI 의 peer-reject 통합 테스트가 green 이 된다. production apply 는 ADR-0038 §게이트대로 후속(θ·G2 무관, 단방향).
- **모바일 viewport 수동 확인**: 🟨 1탭 UI 의 실기기/DevTools 모바일 확인은 자동 검증 불가 — PO 핸드오프.
- **로컬 supabase 바이너리**: `pnpm-workspace.yaml` `onlyBuiltDependencies` 가 `supabase` postinstall(Go 바이너리 다운로드)을 차단(EVAL-0010 drift 와 동일 조건). 본 task 는 `node node_modules/supabase/scripts/postinstall.js` 로 1회 수동 설치 후 로컬 stack 사용.
