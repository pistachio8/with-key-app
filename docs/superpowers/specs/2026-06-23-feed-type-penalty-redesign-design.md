---
spec: 2026-06-23-feed-type-penalty-redesign
title: 피드 타입(이미지/3초 영상) + 벌칙 Redemption 정산 재설계
author: Ian
date: 2026-06-23
status: draft
---

## Summary

챌린지에 두 가지 축을 더한다.

1. **피드 타입 선택** — 챌린지 생성 시 `이미지` 또는 `3초 영상` 중 하나를 고른다. 이 선택이 그 챌린지의 **인증 medium 전체**와 **정산 결과물**을 함께 결정한다. 이미지 챌린지는 기존 사진 인증·기존 recap을 그대로 쓰고, 영상 챌린지는 **실시간 캡처 3초 클립**으로 인증하며, 결과물은 **Phase 1에선 클립 스토리 자동재생**, fast-follow로 클립을 이어 붙인 **합본 몽타주**(Setlog/1SE 패턴, Oracle A1 self-host 워커)를 받는다.
2. **벌칙 Redemption** — 지금은 목표 미달 시 "벌금(돈)"만 부과된다. 여기에 **벌칙(행동 미션)** 을 벌금의 **면제 기회**로 추가한다. 그룹장은 생성 시 벌금 옆에 벌칙 미션 한 줄(자유 입력)을 적을 수 있다. 미달자가 벌칙을 수행해 **녹화 영상**으로 증명하고 동료 다수가 인정하면 벌금이 면제된다. 인정받지 못하면(또는 미수행) 그 벌금은 사라지지 않고 **2배 빚(carry-over)** 으로 다음 챌린지 정산에 얹힌다.

본 spec은 **Phase 1(녹화 기반)** 만 다룬다. 라이브 송출과 실시간 리액션(하트/👍/👎)은 외부 WebRTC 벤더·RN 네이티브가 필요한 별도 epic(Phase 2)으로 분리하며, 녹화본이 Phase 1 데이터 모델로 되돌아오도록 호환만 유지한다.

이 spec이 머지된 뒤 구현 PR(들)이 따라온다. migration 다수 + 정산/RLS 변경이라 ADR 동반이 필요하다(§Impact Scope).

## Why

- **현재 한계**: 정산 결과는 "돈을 잃는다" 한 축뿐이다. 친구 그룹의 정서상 "돈 대신 우스꽝스러운 벌칙을 수행"하는 만회 경로가 강한 참여 동기가 된다. 벌금은 그대로 두되(backstop), 벌칙을 **면제 기회**로 얹으면 기존 금전 모델을 깨지 않고 새 동기를 더한다.
- **이미 깔린 인프라 재사용**: 미달 판정(weekly accrual, `confirmedPenalty`)·동료 반려(`peer_rejection`)·append-only 원장(`point_ledger`)·불변 정산 스냅샷(`settlements`)이 이미 있다. 벌칙 판단은 `peer_rejection`을 거의 그대로 뒤집어 재사용한다("기본 인정, 과반 반려 시 실패"). 신규 메커니즘을 최소화한다.
- **부정방지 정렬**: 영상 챌린지의 **실시간 캡처 전용**(갤러리 업로드 금지)은 각서 앱의 신뢰 요구와 맞는다. 사진 인증에서 phash·EXIF로 사후 탐지하던 것을 카메라 단에서 원천 차단한다.
- **트렌드 타이밍**: 3초 클립 합본 패턴은 지금 한국·홍콩에서 트렌딩 중인 Setlog, 그리고 원조 1 Second Everyday(1SE)가 검증한 형식이다. 친구 그룹 공유 다이어리 → 챌린지 그룹으로 자연 매핑된다.
- **불변성 보존 위험**: redemption은 정산 _후_ 결과를 바꾸는 성격이라, 잘못 설계하면 불변 스냅샷(`settlements`)을 사후 수정하게 된다. 본 spec은 이를 피하려고 redemption을 **forward(다음 챌린지로 이월/환급)** 로만 처리한다(§Design C5).

## Impact Scope

### 변경 경로

- 신규:
  - `supabase/migrations/0051_feed_type_penalty_mission.sql` — `challenges.feed_type`, `challenges.penalty_mission`
  - `supabase/migrations/0052_action_videos.sql` — `action-videos` private 버킷 + RLS, `action_logs` 영상 컬럼(`media_type`·`video_path`)
  - `supabase/migrations/0053_penalty_redemption.sql` — `penalty_proofs`, `penalty_proof_rejections`, `penalty_debts` + RPC
  - `supabase/migrations/0054_point_ledger_redemption_reasons.sql` — `point_ledger.reason` enum 확장(`+ penalty_debt_carryover`)
  - 번호는 spec 작성 시점 next available(현재 max `0050` → `0051~0054`). 구현 PR 시점에 다른 migration이 먼저 머지됐으면 append-only 규칙대로 그때의 next available로 재부여.
  - `apps/web/src/app/(app)/challenge/[id]/penalty/**` — 벌칙 수행/판단 화면(`_components`, `_actions.ts`)
  - `apps/web/src/lib/storage/action-videos.ts` — 영상 업로드·signed URL
  - `apps/web/src/lib/media/montage/**` — 몽타주 워커 **트리거**(인코딩 런타임은 Oracle A1 VPS에 별도 배포, repo 밖)
  - `docs/adr/00NN-penalty-redemption-settlement.md`(deferred penalty·2X carry-over·점수판 풀·불변 스냅샷 보존), `docs/adr/00NN-feed-type-video-capture.md`(실시간 캡처 전용·Oracle A1 self-host 인코딩 워커 인프라). ADR 번호는 `pnpm new adr`가 자동 부여.
  - `docs/superpowers/specs/00NN-redemption-video-analytics.md` — C8 분석 이벤트 결정(PRD §9.1 parity·PO 승인 기록)
- 수정:
  - `packages/domain/src/validators/challenge.ts` — `feedType`, `penaltyMission` 필드
  - `packages/domain/src/validators/action-log.ts` — 영상 medium 허용
  - `packages/domain/src/challenge/weekly.ts` — 미달 산정은 유지, redemption pending 분리
  - `packages/domain/src/settlement.ts` — penalty 적용 시점 분기(벌칙 챌린지 deferred)
  - `apps/web/src/app/(flow)/challenge/new/**` — 생성 폼에 피드 타입·벌칙 입력
  - `apps/web/src/app/(app)/challenge/[id]/recap/**` — `feed_type` 분기(이미지=기존, 영상=스토리 자동재생)
  - `apps/web/src/lib/analytics/track.ts` — 신규 분석 이벤트(C8) — PRD §9.1 갱신·PO 승인 동반
  - `apps/web/src/lib/db/reads/challenge-feed.ts` — `FeedItemView`에 `videoSignedUrl` 추가
  - `docs/BE_SCHEMA.md` — 신규 3테이블·`feed_type`/`penalty_mission`/`media_type`/`video_path` 컬럼·`action-videos` 버킷·`penalty_debt_carryover` reason·immutability 예외 목록 갱신

### src/ 영향

- `apps/web/src/app/(flow)/challenge/new/_actions.ts` — 생성 입력 확장
- `apps/web/src/app/(app)/challenge/[id]/**` — 인증 제출(영상), 벌칙 화면, recap 분기
- `apps/web/src/lib/storage/**`, `apps/web/src/lib/media/**`
- `packages/domain/src/{validators,challenge,settlement}/**`

### Supabase / RLS / migration 영향

- **있음(큼)**. 신규 테이블 3개(`penalty_proofs`, `penalty_proof_rejections`, `penalty_debts`) + 컬럼 추가(`challenges`, `action_logs`) + 신규 버킷(`action-videos`) + `point_ledger.reason` 확장 + redemption RPC(SECURITY DEFINER).
- 전 테이블 RLS ON 유지. 모든 write는 RPC 단일 경로. `settlements`는 **불변 유지**(사후 수정 없음). ledger는 append-only 유지.
- migration은 append-only 번호, 단방향. 각 변경에 ADR 동반(정산·RLS은 spec-required §4).

### 외부 서비스

- **Phase 1(핵심)**: 외부 서비스 **불필요**. 영상 결과물은 클라이언트 스토리 자동재생(C6-A), 실시간 캡처는 web `MediaRecorder` / RN `vision-camera`.
- **fast-follow(몽타주, C6-B)**: 합본 인코딩은 **Oracle Cloud Always Free Ampere A1 self-host ffmpeg 워커**(stateless, 미디어 SoT는 Supabase 유지). Mux 등 유료 인코딩 서비스는 비채택($0·async/retry 궁합). free tier 회수 리스크는 몽타주가 비핵심·재시도 가능이라 수용.
- **Phase 2(out of scope)**: 라이브 송출 WebRTC 벤더(LiveKit/Agora/Daily 등) + 실시간 리액션(Supabase Realtime broadcast).

## Design

### 화면 시안 (Design reference) — 구현이 따를 1차 기준

구현 PR(EVAL-0042~0046)은 아래 **고화질 인터랙티브 목업**을 화면 디자인의 1차 기준으로 삼는다. 목업은 실제 앱 토큰(`apps/web/src/app/globals.css`)을 미러한 `css/withkey.css` 위에 그려져 색·타이포·컴포넌트·접근성 베이스라인(focus-visible·reduced-motion)이 구현과 일치하며, 카피·기본값·상태 분기·인터랙션(3초 캡처 타이머·스토리 재생·판정 토글·권한 플로우)을 담는다. 최종 일러스트·미세 모션은 디자인 영역.

- **허브(오버뷰 + 전체 흐름)**: [`docs/mockups/2026-06-24-feed-type-penalty-screens.html`](../../mockups/2026-06-24-feed-type-penalty-screens.html) — 시안 위 ▶ 로 각 화면을 그 자리에서 실행, `↗ 전체`로 단독 열기
- **인터랙티브 화면(단독 실행)**: [`docs/mockups/2026-06-24-feed-type-penalty/`](../../mockups/2026-06-24-feed-type-penalty/) ([`index.html`](../../mockups/2026-06-24-feed-type-penalty/index.html) 런처)
- **토큰·컴포넌트 SoT**: [`docs/DESIGN.md`](../../DESIGN.md) (Design System) · 앱 토큰 원본 `apps/web/src/app/globals.css`

| spec §  | 화면                                | 목업 파일                                                              |
| ------- | ----------------------------------- | ---------------------------------------------------------------------- |
| C1      | 챌린지 생성 (피드 타입 + 벌칙 미션) | `challenge-new.html`                                                   |
| C2      | 실시간 3초 영상 캡처 인증           | `action-video.html`                                                    |
| C3      | 벌칙 수행 증명 제출 (미달자)        | `penalty-submit.html`                                                  |
| C4      | 동료 판단 (peer-reject 재사용)      | `penalty-review.html` (`?state=empty`=미제출 대기)                     |
| C5      | Redemption ↔ 정산 (면제/2배 이월)   | `penalty-result.html` · `?r=rejected`(이월) · 허브 변이 D(정산 영수증) |
| C6      | 영상 결과물 — 스토리 / 몽타주       | `recap-story.html` (`?state=empty`) · 허브 변이 E(몽타주, fast-follow) |
| C7      | 이미지 결과물 — 회귀(무변화)        | 허브 변이 F(기존 PhotoGallery 그대로)                                  |
| 진입·홈 | 홈 "만회 찬스" 대기 섹션            | `home.html`                                                            |
| 피드    | 인증 피드 — 영상 카드               | `challenge-feed.html`                                                  |

> **UI 용어**: 사용자 노출 명칭은 **"만회 찬스"**(처벌 어감 완화). 본 spec·코드 식별자(`penalty_*`·`/penalty`)와 금액 "벌금"은 그대로 유지한다 — 이름만 부드럽게.

### 데이터 흐름 한눈에

```
[생성] feed_type(image|video) + penaltyAmount + penaltyMission?(자유 입력)
   │
[인증] image → 사진(기존)  /  video → 실시간 3초 클립(action-videos)
   │
[종료/정산] 보증금 전액 환급(+H).  ※ 벌칙 챌린지는 penalty 부과 안 함(deferred), 스냅샷 redemption_pending: true
   │
[창1 +0~48h] 일반 인증 peer-reject → 미달분 X 확정 (창1 닫힘 = X 동결)
   │
[창2 +48~96h] 미달자(X>0) = 그룹장 미션 수행 → 녹화 영상 제출(penalty_proofs) + 증명 peer-judgment
   │
[판단] 기본=인정. 서약자 과반 '불성실' 반려 시 면제 실패 (peer-reject 재사용)
   ├─ 인정/미반려 → 벌금 면제 (추가 차감 없음)
   └─ 과반 반려 / 미제출(+96h 만료) → penalty_debts 에 2X 기록
         → 같은 그룹 다음 정산에서 penalty_debt_carryover(−2X) → 그 정산 pool_points(+2X 집계)
   │
[결과물] image → 기존 recap.  video → 스토리 자동재생(Phase 1) · 합본 몽타주(fast-follow, Oracle A1)
```

### C1. 챌린지 생성 확장

`challengeInputSchema`(`packages/domain/src/validators/challenge.ts`)에 추가:

- `feedType: z.enum(["image", "video"])` — 기본 `"image"`(기존 동작 보존).
- `penaltyMission: z.string().min(1).max(80).optional()` — 자유 입력 벌칙 미션. 없으면 기존 "벌금만" 동작.

**왜 기본 image**: 기존 챌린지·테스트·migration backfill이 깨지지 않도록 신규 컬럼은 안전한 기본값을 가진다.

DB: `challenges.feed_type text not null default 'image' check (feed_type in ('image','video'))`, `challenges.penalty_mission text`(nullable). RPC `create_challenge`(현행 6-파라미터, `0022`)에 두 파라미터를 추가하되 **default를 줘 단일 시그니처를 유지**한다 — 함수 오버로드 신설 회피(이 repo는 `0020`에서 오버로드를 drop한 이력). `feedType`은 validator에도 `.default("image")`를 둬 DB default와 일치시킨다(zod default=parse 시점·DB default=INSERT 시점이라 RPC가 명시 전달하면 한쪽만 적용되는 불일치 방지).

### C2. 실시간 3초 영상 캡처 & 저장

- 영상 챌린지의 인증은 **앱 카메라 실시간 캡처 전용**. 갤러리 업로드 UI를 노출하지 않는다.
  - Web(PWA): `navigator.mediaDevices.getUserMedia` + `MediaRecorder`(최대 3초). RN 전환 시 `react-native-vision-camera`. 캡처는 **동일 코덱·해상도·fps로 표준화**한다(몽타주 `concat -c copy` 재인코딩 회피 전제 — C6).
- 저장: 신규 private 버킷 `action-videos`. 경로 `{userId}/{challengeId}/{actionLogId}-{nonce}.{ext}`(기존 `action-photos` 패턴 미러). signed URL 600s.
- **signed URL read**: 기존 `photo-signed-url.ts`(ADR-0024 — Layer 1 visibility 통과 후 `adminClient()`+public `"use cache"`+`cacheTag`+600s stale)를 복제한 `video-signed-url.ts`로 읽는다. feed 소비 시 `FeedItemView`(`challenge-feed.ts`)에 **`videoSignedUrl` 필드 추가 필요**(현재 `photoSignedUrl`만 존재). recap/스토리 전용 read도 동일 패턴 재사용.
- `action_logs`에 medium 추가(**확정: 컬럼 방식**): `media_type text not null default 'photo' check (media_type in ('photo','video'))`, `video_path text`(nullable). 별도 `action_media` 테이블은 비채택 — 컬럼 추가가 가볍고 기존 `photo_path`·검증 컬럼군과 같은 행에 colocate되어 `doneByWeek`·feed read 변경이 최소.
- **불변성 트리거 갱신(필수)**: `0046 prevent_action_log_body_mutation`은 변경 금지 컬럼을 **열거**하므로 신규 컬럼은 기본 변경 허용 상태가 된다. `0052`에서 트리거를 `create or replace`로 갱신 — **`media_type`을 금지 목록에 추가(불변, 클라가 photo↔video 위조 방지)**, **`video_path`는 제외(마감 전 교체 허용, `photo_path`와 동일)**. `photo_path` 교체용 `update_action_log_photo_path` RPC(`0011`)에 대응하는 `update_action_log_video_path` 필요 여부도 결정.
- 검증(`action-log.ts`): 영상 MIME(`video/mp4`, `video/webm`)·길이(≤3.5s 버퍼)·크기 상한.
- **검증 상태(영상)**: 제출 시 `auto_verify_status='passed'` 기본값(=done 카운트). 기존 enum 값 재사용이라 `doneByWeek` 산정이 사진과 **완전히 동일**하게 동작(passed=done, peer_rejected=제외). 영상엔 **AI 검증 없음**(Phase 1 — 3초 클립 판정 모델 없음, 범위 밖). 무결성 = 실시간 캡처(갤러리 차단)가 1차 보증 + peer-reject가 유일한 사후 게이트. 코드 주석에 "영상의 `passed`는 'AI 통과'가 아니라 '캡처 수용'" 명시. **왜 enum 미신설**: `capture_verified` 같은 값을 추가하면 `doneByWeek`·feed read 등 모든 소비처를 건드려야 한다.

**왜 실시간 전용**: 각서 앱의 신뢰. 미리 찍어둔 영상·짜깁기를 카메라 단에서 차단. 단 web `getUserMedia`는 가상 카메라로 우회 가능 — 잔여 부정은 동료 판단(peer-reject)이 backstop.

### C3. 벌칙 수행 증명 제출

신규 `penalty_proofs`:

- 컬럼: `id`, `challenge_id`, `user_id`(수행자), `media_path`(녹화 영상), `submitted_at`, `status text check in ('pending','accepted','rejected','expired')`, `created_at`.
- UNIQUE `(challenge_id, user_id)` — 챌린지당 미달자 1인 1제출(재제출은 update). **그룹장이 정한 단일 미션을 전 미달자가 공통 수행**(결정 확정).
- 제출 자격: 그 챌린지에서 **확정 미달분 X > 0** 인 참가자만 — 단 **X는 창1이 닫히는 종료+48h에 확정**된다(§C5 타임라인). 제출·판단 창(창2) = **[종료+48h, 종료+96h]** (M=48h, ADR-0030의 48h를 두 번째로 재사용). 즉 일반 인증 peer-reject로 X가 동결된 _뒤에야_ 증명 제출이 열려 '미달자 집합'이 흔들리지 않는다.
- RLS: `penalty_proofs`·`penalty_proof_rejections` SELECT는 같은 그룹 멤버(반려는 voter 본인 행만), write는 RPC만. `penalty_debts` SELECT는 `point_ledger` 패턴 따라 본인 또는 그룹 멤버. carry-over 수금 RPC는 음수 차감이라 **service_role 전용**(`grant_bundle_points` 패턴) 권장.
- **화면 상태**: `challenge/[id]/penalty/**`는 제출(영상 업로드)·판단 토글·만료 결과 각각 loading/error 상태 필요 — 기존 `loading.tsx` + `<Suspense>` 패턴 따른다.

### C4. 동료 판단 (peer-reject 재사용)

- 기존 `peer_rejections`(`0048`)·`toggle_peer_rejection` 패턴을 **penalty_proof 대상**으로 미러한 `penalty_proof_rejections` + `toggle_penalty_proof_rejection(proof_id)` RPC.
- 시맨틱: 기본값 = **인정**(accepted). **N = 전체 서약 참가자**, 수행자(증명 제출자) 제외 → 유효 판단자 N−1명. 그중 **`reject_count > (N-1)/2`**(기존 `toggle_peer_rejection`과 **동일 공식** — off-by-one 없이 그대로 미러)가 "불성실" 반려하면 `status='rejected'`. 익명성 동일(voter_id 저장하되 SELECT 본인 행만, 카운트에서 제외).
- **소그룹 동작**(기존 peer-reject와 동일, 그대로 수용): 서약 2명 → 판단자 1명이라 1표면 반려. 서약 1명(솔로) → 판단자 0명이라 반려 불가 = **항상 인정**(판단할 동료가 없으니 면제). POC 친구 그룹 범위라 별도 floor(예: N≥3)를 두지 않는다.
- 판정 시점: 토글마다 동적 재계산(기존과 동일). **창2 만료(종료+96h)** 시 cron/lazy 평가로 미제출은 `expired`, 과반 미달 반려는 `accepted` 확정. 제출이 늦어 판단 시간이 부족하면 **기본값(accepted)** 으로 통과 — redemption은 관용 방향이 안전하므로 수용(peer-reject는 악의적 증명 backstop).

**왜 재사용**: 새 투표 시스템을 만들지 않는다. 검증된 과반·익명·멱등 로직을 그대로 가져온다.

### C5. Redemption ↔ 정산 연동 (불변성 보존이 핵심)

원칙: **`settlements` 스냅샷은 절대 사후 수정하지 않는다. redemption 결과는 forward로만 흐른다.**

- **벌칙 챌린지(penalty_mission 있음)** 정산:
  - 종료 시 `settle_challenge`는 보증금 전액 환급(+H)만 적용하고, **weekly 미달분 X는 이 정산에서 차감하지 않는다(deferred)**. 스냅샷 `distribution`에는 `redemption_pending: true` 메타만 기록한다 — **X는 정산 시점이 아니라 창1이 닫히는 종료+48h에 확정**되므로(아래 §타임라인), 불변 스냅샷에 확정 X값을 박지 않아 사후 X 변경 오염을 원천 차단한다.
  - **구현 분기점**: `computeSettlement`(`settlement.ts:68`)는 현재 무조건 penalty 행을 만든다. deferred는 `penalty_mission IS NOT NULL`일 때 penalty 계산을 건너뛰는 분기로 처리(도메인에 `deferPenalty` 플래그 추가 vs RPC가 `confirmedPenalty=0` 전달 중 택1 — 구현 plan 확정). 또 `SettlementResult.distribution`은 `Record<string, SettlementShare>`(`settlement.ts:53`)라 `redemption_pending`을 담을 수 없으니 distribution 타입(또는 별도 메타 필드) 확장 필요.
  - 창2 결과(종료+96h 확정):
    - **accepted** → 벌금 면제. 추가 원장 행 없음(차감이 애초에 없었으므로).
    - **rejected / expired** → `penalty_debts(user_id, origin_challenge_id, amount=2X, status='open')` 기록(debt가 'open' 되는 시점 = 종료+96h).
  - **수금(다음 챌린지)**: 그 사용자가 **원천 챌린지와 같은 group_id**의 다음 챌린지 정산에 참여하면, open debt를 `point_ledger`에 `penalty_debt_carryover`(−2X)로 차감하고(`ref_id = penalty_debts.id`로 멱등 — 1회만 차감), 그 2X를 **수금이 일어나는 챌린지 정산의 `pool_points` 계산에 포함**(사후 UPDATE 아님 — 아래 ⚠️)한 뒤 debt를 `settled`로 닫는다. group_id 스코핑의 근거는 아래 §풀 모델 참조.
- **벌금 전용 챌린지(penalty_mission 없음)**: 기존 동작 그대로 — 정산 시 penalty(−F) 즉시 적용.

> ⚠️ **settlements엔 작동하는 UPDATE 경로가 없다 (리뷰 발견 — 구현 필수 제약)**: 트리거 `settlements_guard_writes`(`0043:51`, 함수 `0044:42-48`)는 `tg_op<>'INSERT'`를 **무조건 차단**한다(definer/service_role 예외도 INSERT에만). 그런데 현행 `settle_challenge`(`0044`)는 placeholder INSERT(`pool_points=0`) 후 `UPDATE settlements SET pool_points,distribution` 패턴이라 **그 UPDATE 자체가 막힌다**(정적 분석 high-confidence; 로컬 Supabase 부재로 실행 미검증 — `pnpm supabase db reset` + RPC 실호출로 확정 필요). **해소**: `settle_challenge`를 **pool/distribution을 루프에서 먼저 계산해 단일 INSERT로 최종값 기록**(사후 UPDATE 제거)으로 재설계한다. carry-over 2X도 이 시점엔 debt가 이미 'open'이라 그 INSERT의 pool 계산에 포함된다. 결과: (1) INSERT-only 트리거 통과, (2) 1 INSERT·영구 무수정의 진짜 불변성, (3) carry-over가 사후 수정 없이 귀속. 기존 정산 RPC도 함께 고치는 변경이라 ADR(penalty-redemption-settlement)에 명시한다.

`point_ledger.reason` 확장: `+ 'penalty_debt_carryover'` 한 줄만. 면제(accepted)는 애초에 차감이 없었으므로 원장 행이 없다. **`penalty_redeem_waived` 같은 delta 0 메타 행은 만들지 않는다** — `point_ledger`는 `CHECK (delta <> 0)`이라 0 행이 구조적으로 불가능하다. 면제 사실의 감사 추적은 `penalty_proofs.status='accepted'` + 정산 스냅샷의 `redemption_pending` 메타로 충분하다. 구현 주의: `point_ledger.reason`은 native enum이 아니라 **CHECK 제약**(`0042:48-56`)이라 `0054`는 `ALTER TABLE point_ledger DROP CONSTRAINT … ADD CONSTRAINT … CHECK (reason in (…, 'penalty_debt_carryover'))` 형태로 작성한다. 타입 측은 `SettlementReason`(`settlement.ts:21`, 손수 union)에 `'penalty_debt_carryover'` 추가(zod 파생 아님 — 기존 패턴 유지).

#### 풀 모델 — "그룹 풀"은 점수판이다 (확장은 문서로만 예약)

carry-over가 흘러드는 "원천 그룹 풀"의 정체를 코드 사실에 맞춰 명확히 한다. 기존 코드에 **영속 그룹 풀 엔티티는 없다** — `settlements.pool_points`는 _챌린지마다_ 붙는 스냅샷 숫자이고, 대응하는 `+` 원장 행 없이 집계만 된다(`settlement.ts:13` "개인↔개인 재분배 원장 행이 없다", AC-settle-6 도박 회피). 따라서:

- **현재(이 spec)**: 2X carry-over는 위처럼 **같은 그룹 다음 정산의 `pool_points` 스냅샷에 합산**하는 것으로 "원천 그룹 풀 귀속"을 구현한다. **신규 테이블 없음**(기존 pool-as-snapshot 패턴 그대로). 풀은 **포인트(점수)로만** 존재하는 점수판이며, 앱은 현금을 보관·지급하지 않는다. "공동 사용(회식 등)"은 그룹이 앱 밖에서 정산하고, 앱은 누적 숫자만 넛지로 보여준다(현금 인출 없음 → 금융 라이선스 불필요). 참고: `pool_points`에는 이미 "다음 챌린지 hold 시 공동 스테이크로 소비"라는 forward 경로가 `distribute_pool` 주석에 문서화돼 있으나 **WP3 미구현**이며, carry-over는 일반 forfeit과 동일하게 그 경로를 그대로 상속하므로 추가 설계가 없다.
- **미래(이 spec 밖, 문서로만 예약)**: 그룹 풀을 "공동 사용·인앱 상점의 재원"이 되는 **지속 잔액**으로 승격할 경우, `point_ledger`의 검증된 패턴(append-only · 잔액=Σdelta · 불변)을 그룹 레벨에 복제한 **`group_pool_ledger`**(group_id별, 출금은 새 reason으로 추가)를 도입하고 기존 `pool_points`를 백필한다. 이는 **별도 포인트 경제 epic + ADR**의 몫이다. **왜 지금 안 짓나**: 포인트 용도가 미정인 시점에 구조를 굳히면 잘못된 추상화에 갇힌다. 확장성은 코드가 아니라 **결정 기록**으로 보존한다.

#### 타임라인 & 다음 챌린지 (non-blocking)

타임라인: `종료(=정산·보증금 환급)` → `창1 [+0~48h]` 일반 인증 peer-reject로 **X 확정** → `창2 [+48~96h]` 증명 제출·판단 → `+96h` 미인정/미제출 시 **debt 확정(open)**.

- **두 창은 챌린지가 `closed`된 뒤** 돈다. `0029_one_active_challenge_per_group`는 `active`만 막고 `closed`는 제외하므로, redemption 창이 열려 있어도 **같은 그룹의 다음 챌린지를 바로 시작할 수 있다(non-blocking)**. redemption은 닫힌 챌린지에서 백그라운드로 해소된다.
- **정합성은 기간 차이가 보장**: 챌린지 최소 7일(`durationDays.min(7)`) > redemption 창 4일(48h+48h). 다음 챌린지를 종료 직후 시작해도 그 정산(빨라야 +7일)은 항상 debt 확정(+4일) 이후라, carry-over 수금이 누락 없이 다음 정산에 걸린다.
- **UI 요건(진입점 정의)**: 벌칙 창(창2)은 챌린지가 `closed`일 때 열리는데, 현행 home(`fetchCurrentChallenges`)은 `status in (pending,accepted,active)`만 보여줘 `closed`엔 진입로가 없다(`current-challenges.ts:21-25`). 따라서 진입점을 명시한다 — (a) home에 "벌칙 대기" 섹션(기존 `SettlementPendingList` 패턴 미러로 `closed`+open penalty 노출) + (b) 창2 오픈 시 푸시 1회. 화면 본체는 `challenge/[id]/penalty/**`.

**왜 deferred 모델**: 사용자가 고른 동작("미인정 벌금 X가 사라지지 않고 2X 빚으로 다음 챌린지 정산에 얹힘")과 일치하고, 불변 스냅샷을 건드리지 않는다.

**트레이드오프(명시)**:

- penalty를 deferred하면 그 벌금은 이번 보증금으로 담보되지 않는다(보증금은 환급됨).
- 2X 빚은 **원천과 같은 그룹의** 다음 챌린지 참여를 전제로 회수된다 — 그 그룹의 다음 챌린지에 안 들어오거나 다른 그룹에만 참여하면 회수 경로가 없다. POC 친구 그룹 범위에서 수용. 미회수 debt 처리(만료·탕감)는 Out of scope.

### C6. 영상 결과물 — Phase 1 = 스토리 자동재생, 몽타주 = fast-follow

인코딩 인프라를 핵심 기능 크리티컬 패스에서 분리해 두 단계로 나눈다.

- **Phase 1(핵심): 스토리 자동재생(A)** — 영상 인증 클립을 시간순으로 **클라이언트에서 순서 재생**. 인코딩·서버·외부 비용 0. 영상 챌린지가 결과물 없이 끝나지 않게 보장.
- **fast-follow: 합본 몽타주(B)** — 클립을 이어 붙여 **한 편의 mp4**로 인코딩(표지·BGM·자막 여지). "민지님과 친구들의 4주" 같은 한 파일 공유물. Rollout 단계 ⑤ 독립 PR, dogfood로 캡처 성공률·클립 품질 검증 후 착수.
- **인코딩 런타임 = Oracle Cloud Always Free Ampere A1(4 OCPU/24GB) self-host ffmpeg 워커**(Mux 대비 $0, §Alternatives 결정). 미디어 SoT는 **Supabase Storage 유지** — 워커는 stateless: 클립 pull → ffmpeg concat → 결과 mp4 push(private 저장 + signed URL). 사용자 콘텐츠를 VPS에 영구 저장하지 않아 free tier 회수돼도 손실 없음.
- **CPU 최소화**: 캡처를 동일 코덱·해상도·fps로 표준화(C2)하면 `ffmpeg concat -c copy`로 **재인코딩 없이** 합쳐져 약한 박스로도 즉시 처리. 정규화 필요 시에만 re-encode.
- **트리거**: Vercel cron(Route Handler) 또는 Server Action → VPS의 인증된 엔드포인트(`POST /encode`), 또는 VPS가 `montage_jobs` 폴링. cron Route Handler가 VPS로 _나가는_ 호출은 "외부 배치 트리거"로 가드레일(RH=외부 콜백·BFF 전용) 정신과 정합하나 ADR에 한 줄 정당화. Server Action 경로면 VPS latency에 블록되지 않게 `after()`로 비동기 트리거. 박스는 `sb_secret_*`를 서버 전용 보관, 엔드포인트는 공유 시크릿/서명 + TLS(Let's Encrypt). 신규 env(`MONTAGE_WORKER_URL`·`MONTAGE_WORKER_SECRET`)는 `NEXT_PUBLIC_` 금지 + `apps/web/.env.example` 동기화. PWA 클라이언트 미관여.
- **비핵심·재시도 가능**: 몽타주는 비동기·멱등이라 워커가 잠깐 죽어도 재실행으로 해소 → free tier SLA 부재를 수용.

### C7. 이미지 결과물 — 기존 유지 (단 feed_type 분기 필요)

- **이미지 recap = 현재 동작 그대로**(`recap/page.tsx` + `PhotoGallery`).
- **회귀 위험(필수 처리)**: 현행 `recap/page.tsx`는 `fetchChallengePhotos`(`photo_path IS NOT NULL` 필터, `challenge-photos.ts`)만 호출하므로 영상 챌린지에선 빈 배열 → `PhotoGallery` 침묵 렌더. page가 `challenges.feed_type`을 읽어 `'image'`면 기존 경로, `'video'`면 스토리 자동재생(C6-A)으로 분기해야 한다. 이미지 recap 무변화는 단위 + E2E 회귀로 보장.

### C8. 분석 이벤트 (PRD §9.1 parity — PO 승인 필요)

신규 플로우가 분석에서 보이도록 이벤트를 추가한다. **`AnalyticsEvent` 유니온(`apps/web/src/lib/analytics/track.ts`)·`analyticsEventSchema`는 PRD §9.1과 1:1**이라 아래는 전부 **PO 승인 + PRD §9.1 갱신 + analytics spec(`docs/superpowers/specs/`) 동반**이 필요하다(임의 추가 금지 가드레일).

- `challenge_created`에 `feedType`(image/video)·`hasPenaltyMission` props 추가 — 이미지/영상 코호트 분리.
- `action_logged`에 `mediaType`(photo/video) 추가 — 영상 인증을 사진과 구분(현재 `photoAttached`만 있어 구분 불가).
- 신규 `penalty_proof_submitted`(challengeId) · `penalty_proof_rejected`(proofId — 기존 `peer_reject`는 `actionLogId` 기반이라 흡수 불가) · `penalty_redemption_resolved`(result: accepted/rejected/expired, carryover: bool).
- (선택) 결과물 조회 `recap_story_viewed` · `montage_viewed`.

**왜 spec에 박나**: 이벤트 누락 시 redemption·영상 플로우가 분석 파이프라인에서 전혀 안 보인다. PRD가 분석 SoT이고 parity 누락은 CI(`check-spec-required`) 경고 대상이다.

### Phase 2 훅(설계만, 구현 제외)

- 벌칙 수행 창(C3)의 "녹화 제출"을 "라이브 송출 + 실시간 리액션"으로 교체할 수 있도록, `penalty_proofs.media_path`는 **라이브 세션 녹화본**도 담을 수 있게 medium-agnostic하게 둔다. 리액션(하트/👍/👎)은 영상 벤더와 무관하게 Supabase Realtime로 분리 가능.

## Alternatives Considered

- **벌금 완전 제거(순수 행동 벌칙)** — 보증금/원장/정산을 대거 들어내야 하고, 5번("금액 더블")이 돈 전제라 모순. 기각. 채택: 벌금 유지 + 벌칙은 면제 기회(additive).
- **정산을 redemption 창 종료까지 지연** — 종료 시점 스냅샷을 "provisional"로 두고 48h 뒤 finalize. `settlements` 1챌린지 1불변 스냅샷 전제를 깨고 멱등성이 복잡해진다. 기각. 채택: 정산은 종료 즉시(불변), penalty만 forward 처리.
- **영상 결과물을 합본 몽타주(B)부터 Phase 1 크리티컬 패스로** — 인코딩 인프라(워커/큐)를 2주 POC 핵심 경로에 올리면 출시 리스크. 기각. 채택: **Phase 1 = 스토리 자동재생(A, 인프라 0)** + 몽타주(B)는 fast-follow.
- **몽타주 인코딩을 Mux(managed)로** — 운영부담 0이나 분당 과금. 보유한 **Oracle Cloud Always Free Ampere A1**로 self-host ffmpeg 워커를 돌리면 $0이고, 몽타주가 async·멱등·재시도라 free tier SLA 부재를 견딘다. 채택: **Oracle A1 self-host 워커**(볼륨/운영부담 커지면 Mux 재검토).
- **VPS를 이미지/영상 저장·직서빙 서버로** — private 버킷+signed URL·RLS 가시성·ADR-0024 캐시가 전부 Supabase Storage 위에 있어 접근제어를 재구현해야 하고, free tier 회수 시 사용자 콘텐츠가 통째로 유실된다. 기각. 채택: **미디어 SoT는 Supabase, VPS는 stateless 인코딩 워커 한정**.
- **벌칙 판단을 그룹장 단독/만장일치** — 단독은 권한 집중, 만장일치는 갈등 소지. 기존 peer-reject와 정합한 **과반·익명**(기본 인정) 채택.
- **그룹 풀 원장(`group_pool_ledger`) 즉시 신설(P1)** — 벌금·carry-over를 모두 지속 그룹 잔액으로 모은다. 포인트 용도(공동 사용/인앱 상점)가 아직 미정이라 지금 구조를 확정하면 잘못된 모양에 갇히고, 기존 정산 흐름까지 건드려 이 기능 출시가 늦어진다. 기각. 채택(P2): carry-over는 기존 `pool_points`에 접붙이고, 그룹 풀 승격은 ADR로 문서 예약 + 별도 포인트 epic.
- **풀을 현금 인출 가능하게(실제 회식비 지급)** — 포인트→현금 전환은 도박 본질(승자독식 현금 이전)과 별개로 **선불전자지급수단/전자금융업** 규제 영역이며, PRD가 이미 "결제/환급 = v1+, 법무 선행"으로 게이팅했다. 기각. 채택: **점수판 모델** — 풀은 포인트로만, 실제 회식비는 그룹이 앱 밖에서 정산(현금 인출·라이선스 불필요, 공동 소비라 승자독식 구조도 아님).

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm supabase db reset
pnpm build
```

### 시나리오

- **domain 단위**: weekly accrual로 X 산정 → 벌칙 챌린지는 정산에서 X 미차감(deferred) 검증. accepted → 면제(원장 무변화). rejected/expired → `penalty_debts` 2X 기록. 다음 챌린지 정산에서 `penalty_debt_carryover`(−2X) 1회만 차감(멱등).
- **RLS 실측**: `penalty_proofs`·`penalty_proof_rejections`·`penalty_debts`·`action-videos` 버킷을 anon/authenticated 역할로 read/write 시도 → RPC 외 write 차단, 익명성(반려 voter 비노출) 확인.
- **정산 불변성**: redemption 전/후 `settlements` 행이 동일(사후 수정 없음) 회귀 테스트.
- **settlements INSERT-once (Blocker 검증)**: `settle_challenge`가 사후 UPDATE 없이 **단일 INSERT**로 pool/distribution을 기록해 `settlements_guard_writes`(INSERT-only) 트리거를 통과하는지 `pnpm supabase db reset` + RPC 실호출로 확인(현행 placeholder-INSERT→UPDATE 패턴이 막히는지 함께 회귀).
- **analytics parity**: C8 신규 이벤트가 `analyticsEventSchema`(zod) ↔ `AnalyticsEvent`(TS union) parity 테스트 통과, PRD §9.1 표와 1:1.
- **E2E(모바일 viewport)**: 영상 챌린지 생성(미션 입력) → 실시간 3초 캡처 인증 → 미달 → 벌칙 영상 제출 → 동료 반려 → 다음 챌린지에서 2X 차감 확인. 이미지 챌린지 recap 회귀(변화 없음) 확인.
- **영상 결과물(Phase 1)**: N개 클립 → 스토리 자동재생 순서·signed URL 재생 확인(인코딩 없음).
- **합본 몽타주(fast-follow)**: Oracle A1 워커가 클립 pull → `concat -c copy` → 결과 mp4 push·signed URL 재생 확인. 워커 다운 시 재시도로 산출되는지(멱등) 확인.

## Rollout

- **순서**: ① 스키마+도메인(피드 타입·penalty_mission·deferred 정산) → ② 영상 캡처·저장 + **스토리 자동재생(Phase 1 결과물)** → ③ 벌칙 제출·판단(peer-reject 미러, 창1/창2 순차) → ④ redemption 정산 연동·2X carry-over → ⑤ **합본 몽타주(fast-follow, Oracle A1 워커)**. 각 단계 독립 PR + 검증. **핵심 출시는 ④까지**, ⑤는 캡처 루프 안정 후 착수.
- **dogfood**: 영상 챌린지 1개를 내부 그룹에 돌려 실시간 캡처·벌칙 루프·스토리 재생을 실측. 캡처 성공률·클립 품질 확인 후 몽타주(⑤) 착수 여부·인코딩 파라미터(`-c copy` 가능 여부) 확정.
- **Phase 2 진입 기준**: Phase 1 redemption 루프가 dogfood에서 안정 + 라이브 벤더 PoC(지연·비용) 통과 후 별도 spec.

### 롤백

- 단계별 독립 PR이므로 역순 revert. 신규 컬럼은 기본값(image/null)이라 영상 기능 비활성 시에도 기존 챌린지 정상. `penalty_mission` 미입력이면 redemption 경로가 아예 비활성(기존 벌금 동작)이라 feature flag 역할을 겸한다.

## Out of scope

- **Phase 2 전체**: 라이브 실시간 송출, 실시간 리액션(하트/👍/👎), WebRTC 벤더 연동, RN 네이티브 카메라.
- Setlog식 시간대별(hourly) 촬영 cadence·푸시 — 본 spec은 챌린지 인증 cadence를 바꾸지 않는다.
- 미회수 `penalty_debts`의 만료·탕감 정책.
- `meal`·`other` 등 기존 activity_type·키워드 풀 변경(별도 freeze 정책).
- 벌칙 증명을 영상 외(사진/텍스트)로 허용할지 — Phase 1은 영상 증명만.
- **포인트 현금화 / 실제 현금 회식 정산** — 점수판 모델 채택. 포인트↔현금 전환과 그 금융 라이선스·법무는 PRD v1+ 영역.
- **영속 그룹 풀(`group_pool_ledger`)·포인트 사용처(공동 사용·인앱 상점)** — 별도 포인트 경제 epic + ADR. 본 spec은 carry-over를 기존 `pool_points`에 귀속시키는 데까지만.

## 용어집

- **벌금(Fine)**: 목표 미달 시 부과되는 금전 차감. 기존 모델의 결과물.
- **벌칙(Penalty mission)**: 그룹장이 정한 행동 미션. 수행·인정 시 벌금을 **면제**받는 만회 경로.
- **Redemption**: 벌칙을 수행해 벌금을 면제받는 절차(본 spec의 핵심 신규 흐름).
- **carry-over 빚(penalty_debts)**: 벌칙이 인정되지 않은 벌금이 2배로 다음 챌린지 정산에 이월되는 미수 채무.
- **피드 타입(feed_type)**: 챌린지의 인증 medium·결과물을 정하는 생성 시 선택(`image`/`video`).
- **합본 몽타주(montage)**: 3초 클립들을 한 편의 영상으로 이어 붙인 정산 결과물. Setlog/1SE 패턴.
- **peer-reject(`peer_rejections`)**: 서약 참가자가 익명 과반으로 인증을 무효화하는 기존 메커니즘. 본 spec은 이를 벌칙 판단에 재사용.
- **MediaRecorder**: 브라우저에서 카메라 스트림을 실시간 녹화하는 웹 표준 API. 영상 챌린지의 실시간 캡처에 사용.
- **deferred penalty**: 벌칙 챌린지에서 정산 시 벌금을 즉시 차감하지 않고 redemption 결과에 따라 forward 처리하는 방식. 불변 스냅샷 보존을 위함.
- **점수판 모델(scoreboard)**: 풀을 포인트(점수)로만 유지하고 앱은 현금을 보관·지급하지 않는 방식. 실제 지출(회식 등)은 그룹이 앱 밖에서 정산하고 앱은 누적 숫자만 보여준다. 현금화·금융 라이선스 회피.
- **pool_points**: 정산 시 미달분(forfeit) 합을 적재하는 `settlements`의 스냅샷 숫자. 대응하는 `+` 원장 행 없이 챌린지별로 집계만 된다(영속 그룹 잔액 아님).
- **group_pool_ledger (미래)**: 그룹 풀을 지속 잔액으로 승격할 때 도입할 append-only 그룹 레벨 원장. 본 spec 범위 밖 — 문서로만 예약.
