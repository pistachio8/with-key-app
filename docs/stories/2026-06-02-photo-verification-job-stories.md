# Backlog: 인증(사진) 기능 — Job Stories

> fromwith — 그룹 운동 각서(서약서) 앱의 "인증" 기능을 Job Story(JTBD)로 분해한 백로그입니다.
> 작성일 2026-06-02 · 작성자 pistachio8
>
> **v2 (2026-06-02 재작성)**: 초안(v1)을 실제 코드·PRD/BE_SCHEMA와 대조한 뒤 모델을 교정했습니다.
> 핵심 교정 — ① "사진 인증"이 아니라 **인증(ActionLog) = 사진 + 운동 종류 + 키워드 칩 + AI 운동일기**, ② "일일 마감/일자별 합불"은 없음 → 챌린지 `end_at` + 누적 `doneCount ≥ goalCount`, ③ 벌금은 "예정 금액 표시만"(POC), ④ Kudos(응원) 추가, ⑤ 사진 교체 스토리 제거(로그 immutable).

**Format**: Job Stories — `When [상황], I want to [동기], so I can [결과]`
**Total stories**: 5 (코어 인증 루프 + 피드/응원 + 결과/벌금 + 알림 진입)
**현 구현 상태 범례**: ✅ 구현됨 · 🔄 부분/다르게 구현 · ⬜ 미구현(갭)

이 문서는 4개 산출물로 구성됩니다.

1. [Job Stories](#job-stories) — 상황·동기·결과 + acceptance criteria + 현 구현 상태
2. [Acceptance Criteria](#job-stories) — 각 스토리에 인라인
3. [Edge Cases](#edge-cases-종합) — 종합 표
4. [개발 우선순위(남은 갭 기준)](#개발-우선순위남은-갭-기준)

---

## Job Stories

### Story 1: 운동 직후 인증 남기기 (사진 + 키워드 + AI 일기) — 코어

**When** 오늘 운동을 막 끝냈을 때,
**I want to** 사진 한 장을 올리고 운동 종류와 키워드 칩 1~3개만 탭해 빠르게 인증을 남기고 싶다,
**so I can** AI가 써준 운동일기와 함께 오늘 한 일을 기록하고 챌린지 목표에 하루를 채울 수 있다.

**현 구현 상태**: ✅ 구현됨 — `submitActionLog` Server Action (`src/app/(app)/challenge/[id]/action/_actions.ts:70-295`), 폼 `action-form.tsx`.

**Acceptance Criteria:**

- [ ] 인증은 **active 상태 챌린지**에서만 가능하다 — 서버 시각(KST)이 `start_at ~ end_at` 밖이면 차단(`forbidden`). (`_actions.ts:90-98`)
- [ ] 1회 인증 = **사진 1장 필수 + 운동 종류 필수 + 키워드 칩 1~3개 필수** (직접 입력 메모는 키워드 폴백). (`validators/action-log.ts:13-44`, PRD §4.3 AC-2)
- [ ] 사진은 private bucket `action-photos` + **Pre-signed URL**(600초)로만 다룬다. 5MB 제한, iOS HEIC는 업로드 전 `prepareForUpload`로 변환. (`src/lib/storage/action-photos.ts`, `0011_storage_action_photos.sql`)
- [ ] 키워드 칩은 풀에서 노출되고 "다시 뽑기(Reroll)"가 가능하다. (PRD §2, §9.1 `keywords_shown`/`keywords_reroll`)
- [ ] 제출 시 **AI 운동일기**(3~5줄, 150자 이하)가 생성된다. 4.5s 타임아웃, 키워드 커버리지 < 1 이면 `templateFallback()`로 폴백. (가드레일 §AI 일기)
- [ ] 쓰기는 `submitActionLog` 단일 Server Action 경로로 처리된다 (`useEffect`+`fetch` 금지).
- [ ] 제출 시 `action_logged`(+ AI 모드면 `ai_generated`) 이벤트가 기록된다 — 일기 본문은 미로깅, 메타만(`photoSize`·`keywordCount`·`latencyMs`·`fallback` 등). (`schema.ts:76-89`)
- [ ] 모바일 세로 viewport(Safari)에서 한 손 조작으로 완결된다.

**Priority**: P0 | **Effort**: M | **Dependencies**: 챌린지 active 전환(서약→시작), Storage 버킷·RLS

---

### Story 2: 하루 한 번만 카운트, 추가 인증은 기록만 — 코어

**When** 오늘 이미 인증했는데 운동을 또 해서 한 번 더 올리고 싶을 때,
**I want to** 추가 인증이 피드에는 남되 "인증 횟수"는 중복으로 늘지 않는다는 점을 명확히 알고 싶다,
**so I can** 규칙을 오해하지 않고 안심하고 더 공유할 수 있다.

**현 구현 상태**: ✅ 구현됨 — KST 자정 기준 distinct 일자 카운트, 안내 카드 노출.

**Acceptance Criteria:**

- [ ] 인증 일수(`doneCount`)는 **KST 자정 기준 서로 다른 캘린더 일자 수**로 센다 — 같은 날 N개 인증해도 1일. (`src/lib/challenge/done-days.ts:13-28`)
- [ ] 오늘 이미 인증했으면 "추가로 올리는 피드는 기록되지만 인증 횟수는 늘지 않아요" 안내가 보인다. (`action/page.tsx:33`, `action-form.tsx:333-344`)
- [ ] 추가 인증도 피드·Kudos·`action_logged` 이벤트 대상이 된다.
- [ ] 제출된 인증(action_log)과 사진은 **immutable** — 수정·교체·삭제 불가. (`0011_storage_action_photos.sql:51` UPDATE 정책 없음, `upsert:false`, BE_SCHEMA §4 "삭제 금지")

**Priority**: P0 | **Effort**: S | **Dependencies**: Story 1

> ⚠️ "잘못 올린 사진 정정" 수단은 현재 없습니다(immutable). 정정 허용 여부는 [Open Questions](#open-questions) 참조.

---

### Story 3: 인증 피드에서 동료 인증 보고 응원(Kudos) 보내기

**When** 동료가 오늘 인증했는지 궁금하거나 내가 막 인증을 마쳤을 때,
**I want to** 그룹의 인증 카드(사진·키워드·AI일기)를 보고 한 번의 탭으로 응원을 보내고 싶다,
**so I can** 서로 동기를 주고받으며 챌린지에 계속 몰입할 수 있다.

**현 구현 상태**: ✅ 구현됨 — 인증 피드(`challenge-feed.ts`) + Kudos. (PRD §10 화면#6 "인증 피드")

**Acceptance Criteria:**

- [ ] 인증 피드는 같은 챌린지 그룹원의 인증 카드(사진·작성자명·키워드·AI일기 요약·작성 시각)를 보여준다. (`src/lib/db/reads/challenge-feed.ts` `FeedItemView`)
- [ ] 접근 제어는 **Layer 1 visibility**(`listVisibleActionLogIds`, RLS viewer client)로 결정하고, 이후 hydrate read는 admin cache를 쓴다. 비멤버는 빈 리스트를 받는다. (가드레일 §Cache Components, ADR-0024)
- [ ] Kudos(🔥 💪 👏)를 카드별로 원탭 토글하고, 이모지별 카운트와 내 반응이 표시된다. (PRD §7.1)
- [ ] 사진은 viewer 경계를 오염시키지 않는 캐시로 로딩된다(서명 URL 9분 revalidate). (`photo-signed-url.ts`)
- [ ] 피드는 RSC + server fetch로 렌더된다 (SWR·React Query 미도입).
- [ ] `feed_view`·`kudos_given` 이벤트가 기록된다. (PRD §9.1)
- [ ] 빈 피드·로딩·이미지 로딩 실패 상태가 각각 처리된다.

**Priority**: P1 | **Effort**: M | **Dependencies**: Story 1

> ℹ️ "아직 인증 안 한 구성원의 미인증 플레이스홀더"는 현재 **미구현**입니다(피드는 제출된 인증만 표시). 사회적 압박 노출 여부는 Open Questions 참조.

---

### Story 4: 챌린지 종료까지 목표 달성 현황과 예정 벌금 확인 — 코어

**When** 챌린지가 진행 중이거나 종료됐을 때,
**I want to** 내 누적 인증 일수가 목표(`goalCount`)에 얼마나 도달했고 미달 시 예정 벌금이 얼마인지 보고 싶다,
**so I can** 남은 기간에 따라잡을지 판단하고 정산을 신뢰할 수 있다.

**현 구현 상태**: 🔄 구현됨(단, 성공/실패는 저장 안 하고 런타임 파생 / 벌금은 "표시만").

**Acceptance Criteria:**

- [ ] 성공/실패는 별도 상태로 저장하지 않고 **`doneCount ≥ goalCount`** 로 파생 판정한다(성공=벌금 0, 미달=벌금). (`src/lib/challenge/settlement.ts:10-15`)
- [ ] 미달 시 **예정 벌금 = `penalty_amount`** (1,000~10,000원, 1천 단위). POC는 **"예정 금액 표시만"** — 실제 정산은 v1. (PRD §1.2, BE_SCHEMA §5.5)
- [ ] 그룹 누적 예정금(pot) = Σ(미달 참가자 × `penalty_amount`). (`settlement.ts:26-37`, `current-challenges.ts:200-206`)
- [ ] 판정·집계는 RLS 하에서 본인·동일 그룹 데이터만 읽는다.
- [ ] 마감 임박 카드 노출 시 `penalty_displayed` 이벤트가 기록된다. (PRD §9.1)
- [ ] 챌린지는 `end_at`(KST 자정) 도달 시 cron으로 `active → closed` 전이된다. (ADR-0026/0027, `lifecycle.ts:32-39`)

**Priority**: P0 | **Effort**: M | **Dependencies**: Story 1, Story 2

---

### Story 5: 마감 임박·동료 인증 알림에서 인증/피드 화면으로 진입

**When** 다른 일을 하다가 챌린지 종료가 가까워지거나 동료가 인증했다는 알림을 받았을 때,
**I want to** 알림을 한 번 탭해 곧장 인증 화면이나 피드로 가고 싶다,
**so I can** 마감을 놓치지 않고 인증하거나 바로 응원할 수 있다.

**현 구현 상태**: 🔄 구현됨(딥링크·Quiet Hours O / "이미 달성자 제외" 미구현).

**Acceptance Criteria:**

- [ ] `deadline` 알림(챌린지 종료 ~24h 전, 실제 12~36h window)이 **`/challenge/{id}/action`** 으로 딥링크된다. (`src/lib/push/dispatch.ts:200-211`, `cron/deadline-push/route.ts`)
- [ ] `friend_action` 알림(그룹원 인증 완료, 본인 제외)이 **`/challenge/{id}`** 로 딥링크된다. (`dispatch.ts:172-198`)
- [ ] 알림 탭 시 service worker가 `targetUrl`로 기존 탭을 navigate 하거나 새 창을 연다. (`public/service-worker.js:97-135`)
- [ ] Web Push(VAPID) 발송은 **Quiet Hours 02:00~07:00 KST** 동안 suppress 된다. (`src/lib/push/send.ts:28-32`)
- [ ] 푸시 콜백·구독은 Route Handler(`src/app/api/push/*`)로 한정한다 (외부 콜백 전용 경계).
- [ ] 알림 종류별 발송 결과(sent/suppressed/failed)가 추적된다.

**Priority**: P1 | **Effort**: M | **Dependencies**: Story 1, Story 4

> ⚠️ "이미 목표 달성·오늘 인증한 사람에게는 deadline 알림 제외"는 현재 **미구현**(본인 제외만 있음). `missed_yesterday` 타입은 정의만 됨. Open Questions 참조.

---

## Edge Cases (종합)

실제 구현/스키마에 근거한 edge case와 현 처리 상태입니다.

| #   | 상황                                 | 기대/실제 동작                                    |      상태       | 연관  |
| --- | ------------------------------------ | ------------------------------------------------- | :-------------: | ----- |
| E1  | 챌린지 기간 밖(시작 전/종료 후) 인증 | 서버 KST 시각으로 `forbidden` 차단                |       ✅        | S1·S4 |
| E2  | `end_at`(KST 자정) 경계              | 서버 시각 기준 일관 판정, cron auto-close         |       ✅        | S4    |
| E3  | 같은 날 중복 인증                    | 기록되되 1일로만 카운트                           |       ✅        | S2    |
| E4  | 잘못 올린 사진 교체/삭제             | **불가** — log·photo immutable                    | ⬜(설계상 제약) | S2    |
| E5  | 업로드 중 RPC 실패                   | `deletePhoto()`로 고아 사진 정리                  |       ✅        | S1    |
| E6  | HEIC·대용량 사진                     | `prepareForUpload` 변환 + 5MB 제한                |       ✅        | S1    |
| E7  | Pre-signed URL 만료                  | 9분 revalidate로 만료 전 갱신                     |       ✅        | S3    |
| E8  | 타 그룹 인증 접근 시도               | RLS Layer 1로 차단(빈 리스트)                     |       ✅        | S3    |
| E9  | AI 일기 타임아웃/커버리지<1          | `templateFallback()` 폴백                         |       ✅        | S1    |
| E10 | Quiet Hours(02~07 KST) 트리거        | 발송 suppress(기록만)                             |       ✅        | S5    |
| E11 | 본인 인증을 본인에게 알림            | `excludeUserId`로 제외                            |       ✅        | S5    |
| E12 | 빈 피드 / 이미지 로딩 실패           | 빈 상태·폴백 UI                                   |  🔄 확인 필요   | S3    |
| E13 | validator MIME vs bucket MIME 불일치 | validator(jpeg/png/webp) ↔ bucket(heic/heif 허용) |  ⬜ 정리 필요   | S1    |
| E14 | 알림 클릭 비콘 `/api/push/opened`    | service worker는 POST하나 수신 핸들러 부재        |  ⬜ 버그 후보   | S5    |

---

## 개발 우선순위(남은 갭 기준)

핵심 인증 루프(S1·S2·S4)와 피드/응원(S3), 알림 진입(S5)은 **이미 구현돼 있습니다.** 따라서 우선순위는 "신규 빌드"가 아니라 **남은 갭과 정합성 보정**에 둡니다.

**P0 — 정합성/신뢰성 (먼저)**

1. **벌금 정산 범위 확정** (S4) — POC "표시만"에서 실제 정산으로 갈지/언제 갈지 PO 결정. 표시 카피가 오해를 주지 않는지 점검.
2. **E13 MIME 정책 통일** (S1) — validator는 heic/heif 거부하는데 bucket은 허용. 한쪽으로 정렬(권장: 클라 변환 전제로 validator 기준 유지).

**P1 — 알림 정밀화** 3. **deadline 알림 타깃팅** (S5) — "이미 목표 달성/오늘 인증한 사람 제외" 로직 추가 여부. 4. **E14 `/api/push/opened` 핸들러** (S5) — 클릭 비콘 수신부 구현 또는 비콘 제거.

**P2 — UX 보완** 5. **사진/인증 정정 수단** (S2) — immutable 유지 vs 마감 전 1회 교체 허용. ADR 필요. 6. **미인증 플레이스홀더** (S3) — 동료 미인증 노출의 동기부여 vs 프라이버시 trade-off.

---

## Technical Notes (Cross-cutting)

실제 코드 경로 기준입니다.

- **인증 쓰기 경로**: `submitActionLog` (`challenge/[id]/action/_actions.ts`) → action_logs INSERT → `uploadPhoto` → RPC `update_action_log_photo_path` → `track(...)` → `after()` 푸시.
- **저장**: `action_logs` 테이블(`0001_init.sql` + `0010` photo_path), 사진은 `action-photos` private bucket(`0011`). 모든 테이블 RLS ON.
- **판정**: 성공/실패 비저장, 런타임 파생 `doneCount(distinct KST day) ≥ goalCount`. 시각은 서버 `Date.now()` + `Intl.DateTimeFormat('Asia/Seoul')`.
- **피드**: `challenge-feed.ts` (Layer1 visibility → admin hydrate, ADR-0024) + Kudos.
- **푸시**: `dispatch.ts`(start·friend_action·deadline·kudos·owner_start_nudge) + `send.ts`(Quiet Hours) + `service-worker.js`(딥링크). 신규 이벤트/알림은 PRD §9.1과 1:1 — 임의 추가 시 PO 승인 + spec.
- **서약(Pledge) 전제**: 인증은 챌린지가 `active`여야 가능. active는 서약(`signed_at`) 후 오너가 시작. (ADR-0009/0028, `0040_all_signed_owner_nudge.sql`)

---

## Open Questions

구현/정책 확정이 필요한 항목입니다.

1. **인증 정정** — 잘못 올린 사진을 마감 전 1회 교체 허용할 것인가? 현재 log immutable과 충돌하므로 허용 시 ADR 필요.
2. **벌금 정산 시점** — POC "예정 금액 표시만"을 언제 실제 정산으로 전환하는가?
3. **deadline 알림 타깃팅** — 이미 목표 달성/오늘 인증 완료자를 제외할 것인가? `missed_yesterday` 알림을 구현할 것인가?
4. **`/api/push/opened` 핸들러** — 클릭 비콘 수신부를 만들 것인가, service worker의 POST를 제거할 것인가?
5. **MIME 정책(E13)** — validator(jpeg/png/webp)와 bucket(heic/heif 허용) 중 어느 기준으로 통일하는가?
6. **미인증자 피드 노출** — 동료의 "오늘 미인증"을 피드에 표시하는 것이 동기부여로 적절한가, 프라이버시 우려인가?
7. **goal 단위** — `goalCount`는 챌린지 전체 누적 일수 기준이 맞는가(주간 목표 표현과의 정합성 확인)?

---

## 용어집

- **인증(ActionLog)**: 이 앱의 핵심 행위. **사진(필수) + 운동 종류(필수) + 키워드 칩 1~3개(필수) + AI 운동일기**의 결합 기록. 코드 테이블명은 `action_logs`.
- **서약서(Pledge)**: 챌린지 참여 의사를 남기는 절차. `challenge_participants.signed_at`에 기록. 전원 서명 후 오너가 챌린지를 `active`로 시작.
- **doneCount / goalCount**: 누적 인증 일수(KST distinct day) / 목표 일수. `doneCount ≥ goalCount` 면 성공(벌금 0).
- **예정 벌금(penalty)**: 목표 미달 시 표시되는 금액. POC는 "표시만", 실제 정산은 v1.
- **인증 피드**: 챌린지별 인증 카드 리스트(사진·키워드·AI일기·Kudos). PRD 화면 #6.
- **Kudos**: 인증 카드에 보내는 3종 고정 이모지(🔥 💪 👏) 원탭 반응.
- **end_at**: 챌린지 종료 시각(활성화 KST 날짜 + 기간일의 KST 자정). 일일 마감이 아니라 챌린지 단위 마감.
- **Quiet Hours**: 알림 발송 금지 시간대(02:00~07:00 KST).
- **Pre-signed URL**: 일정 시간만 유효한 서명 URL. private 사진을 안전하게 노출.
- **RLS(Row Level Security)**: Postgres 행 단위 접근 제어. 그룹·본인 경계 방어선.
- **Layer 1 visibility**: 인증 노출 여부를 RLS viewer client로 먼저 판정하는 경계(`listVisibleActionLogIds`). 이후 hydrate만 admin cache 사용(ADR-0024).
- **JTBD / Job Story**: 역할이 아니라 상황·동기·결과에 초점을 둔 요구 표현. `When 상황, I want to 동기, so I can 결과`.
