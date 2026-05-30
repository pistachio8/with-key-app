# ADR-0027 — "챌린지 종료" 판정을 시간 파생 SoT로 통일 + auto-close cron

**Date**: 2026-05-30
**Status**: accepted <!-- accepted / superseded / deprecated -->
**Deciders**: pistachio8

## Context

"챌린지가 끝났는가"를 판정하는 기준이 코드베이스에 **두 갈래**로 갈라져 있다.

- **시간 파생 기준** — `status = 'closed' OR (status = 'active' AND end_at <= now)`. 즉 만기(`end_at`)가 지나면 "끝남". 다음 경로가 이미 이 기준을 쓴다.
  - `src/lib/db/reads/recap.ts:130` — 정산(recap) 진입 쿼리 (`.or(status.eq.closed,and(status.eq.active,end_at.lte.${now}))`)
  - `src/app/(app)/challenge/[id]/_actions.ts:42` — 좋아요(kudos) 차단 게이트
  - `src/app/(app)/challenge/[id]/_actions.ts:152` — 인증 제출 차단 게이트 (`now > end_at`)
  - `src/app/(app)/challenge/[id]/(tabs)/layout.tsx:64` — 종료 배너(`ChallengeEndedBanner`) 표시 조건
- **status 컬럼 기준** — `status === 'active'`(또는 `status IN ('pending','accepted','active')` / `status !== 'closed'`). `end_at`을 보지 않는다. 다음 경로가 이 기준으로 "진행 중인가"를 표시·판정한다.
  - `src/lib/db/reads/current-challenges.ts:97` — 홈 "진행 중" 리스트 필터
  - `src/app/(app)/layout.tsx:52` — 인증(카메라) FAB의 `activeChallenges` (over 챌린지가 "인증하기"에 노출 → 탭하면 게이트·RLS가 차단 → forbidden)
  - `src/lib/db/reads/active-challenge.ts` — `/action`·`/feed` 의 "현재 챌린지" 선택(`status==='active' && participant`)
  - `src/app/(app)/group/[id]/_components/group-challenges-list.tsx` — `status==='active'`면 "진행 중" 배지 + `daysLeftLabel`(≤0 시 "마감") → over는 **"진행 중 + 마감"** 동시 표기
  - `src/lib/db/reads/my-challenges.ts:83` · `src/app/(app)/me/challenges/page.tsx:40` — `status !== 'closed'` 를 "운영 중/참여 중"으로 집계 → over가 "종료된 챌린지" 대신 진행 버킷에 잡힘
  - `src/app/(app)/challenge/[id]/_components/status-card.tsx` — `status === 'active' ? D-${daysLeft} : '종료'`
  - `src/app/(app)/challenge/[id]/_components/dashboard-tab.tsx` — `status === 'active' ? '남은 N일' : …` (over는 "남은 0일")
  - `src/app/(app)/challenge/[id]/_components/next-step-cta.tsx` · `_components/feed-tab.tsx` — `status === 'active'` 분기로 인증/피드 UI 게이팅

`status`를 `'closed'`로 바꾸는 경로는 **운영자 수동 종료(`endChallenge`) 하나뿐**이며(코드·migration 전수 확인 — 다른 RPC·경로는 모두 `status='active'` 활성화만), **자연 만료(`end_at` 경과)로는 `status`가 절대 바뀌지 않는다**. 즉 만기가 지나도 운영자가 "종료"를 누르지 않으면 `status`는 계속 `'active'`로 남는다.

이 불일치는 관측 가능한 문제를 만든다. [ADR-0026](0026-challenge-end-boundary-kst-midnight.md)이 `end_at`을 KST(한국 표준시) 자정에 정렬한 뒤, D-N 카운트다운이 "마지막 날 = D-1, 자정 이후 = 만료"로 깔끔히 떨어졌다. 그러자 만기가 지난 `active` 챌린지가:

- **홈**: `status='active'`라는 이유로 "진행 중 챌린지"에 그대로 노출되고, D-N 표시는 `Math.max(0, ceil((end_at − now)/86_400_000))` 클램프 때문에 음수가 아니라 **"D-0"**으로 찍힌다 → "D-0인데 진행 중" 모순.
- **상세 페이지**: "챌린지가 종료되었어요" 배너(`ChallengeEndedBanner`, 시간 파생 조건) 바로 아래에 `status='active'` 기반 `StatusCard`가 **"D-0 · 진행 중"**으로 렌더 → 같은 화면에서 종료/진행이 동시 주장.
- **정산(recap)**: 시간 파생 기준이라 같은 챌린지를 이미 "끝남(정산 대상)"으로 본다 → 홈과 정산이 한 챌린지를 다르게 본다.

추가로 D-N 산출 공식이 **5곳**에 인라인 복붙되어 있다 — `Math.max(0, ceil(...))` 4곳(`current-challenges.ts:170` · `active-challenge.ts` · `(tabs)/layout.tsx:18` · `(tabs)/dashboard/page.tsx:12`) + `ceil(...)`→"마감" 변종 1곳(`group-challenges-list.tsx:25`). 시간 파생 종료 predicate(`status==='active' && end_at < now`)도 **TS 4곳**(`_actions.ts:42`(kudos 게이트) · `(tabs)/layout.tsx:64` · `(tabs)/page.tsx:77`) **+ SQL 1곳**(`recap.ts:130`)에 흩어져 있어, 한 곳을 고쳐도 다른 곳이 어긋날 구조다.

한편 **인증 제출 자체는 이미 시간 기준으로 이중 차단**된다(설계 안전망): 제출 Server Action(`action/_actions.ts:89-97`)이 `status==='active' && start_at <= now <= end_at` 을 검사하고, RLS `al_insert_self_active`([0028](../../supabase/migrations/0028_pending_invite_start_flow.sql))의 `with check` 도 `c.status='active' and now() between c.start_at and c.end_at` 로 같은 경계를 강제한다. 따라서 만기 후(파생상 over, DB상 active) 제출은 앱·RLS 양쪽에서 막힌다 — 본 결정으로 노출되는 건 "표시"와 0029 슬롯뿐이고 쓰기 누수는 없다.

또한 `end_at`이 지난 `active` 챌린지는 partial unique index `challenges_one_open_per_group`([0029](../../supabase/migrations/0029_one_active_challenge_per_group.sql), `where status in ('pending','accepted','active')`)의 슬롯을 계속 점유한다. 따라서 그 그룹은 **`status`가 `'closed'`로 바뀌기 전까지 새 챌린지를 만들 수 없다**. 이 제약은 읽기 단계에서 시간 파생으로 우회할 수 없다 — DB index는 `status` 컬럼만 본다.

## Decision

**"챌린지가 끝났는가"의 Single Source of Truth(SoT, 단일 기준)를 시간 파생(`end_at <= now`)으로 통일하고, 모든 읽기 경로가 공유 헬퍼 하나를 거치게 한다. 동시에 `end_at`이 지난 `active` 챌린지를 `closed`로 전이시키는 auto-close를 기존 deadline-push cron에 합친다.**

### 1. 공유 lifecycle 헬퍼 (`src/lib/challenge/lifecycle.ts`, 신규)

```ts
// src/lib/challenge/lifecycle.ts
export type ChallengePhase = "pending" | "accepted" | "running" | "over" | "closed";

export function challengePhase(
  status: ChallengeStatus,
  endAt: string | null,
  now: number = Date.now(),
): ChallengePhase {
  if (status === "closed") return "closed";
  if (status === "active") {
    return endAt != null && new Date(endAt).getTime() <= now ? "over" : "running";
  }
  return status; // 'pending' | 'accepted'
}

export function isChallengeOver(
  status: ChallengeStatus,
  endAt: string | null,
  now: number = Date.now(),
): boolean {
  const p = challengePhase(status, endAt, now);
  return p === "over" || p === "closed";
}

export function remainingDays(endAt: string | null, now: number = Date.now()): number {
  if (!endAt) return 0;
  return Math.ceil((new Date(endAt).getTime() - now) / 86_400_000);
}
```

- `ChallengePhase`는 **파생 뷰 모델 타입**이다. zod 스키마 SoT(`src/lib/validators/*`)나 영속 경계가 아니다 — 영속·쓰기 SoT는 여전히 DB `status` 컬럼(0029 index 포함). `phase`는 순수 파생이라 평범한 TS union으로 둔다.
- `remainingDays`는 **클램프 없는 raw 값**. ADR-0026 정렬 덕에 `running` 챌린지는 항상 `D-{duration}`…`D-1` 범위(0은 `over`일 때만)이므로 호출처는 `phase === 'running'`일 때만 `D-${remainingDays}`를 렌더한다 → **"D-0"이 화면에 나올 수 없다**.
- 라벨("D-7"/"종료"/"서명 대기"/"곧 시작")은 화면마다 달라서 헬퍼가 소유하지 않는다. 헬퍼는 `phase` + `remainingDays`만 제공하고 각 컴포넌트가 포맷한다.

### 2. 결정 지점 분류 + 전수 통일

**`status`를 phase로 무차별 교체하지 않는다.** 결정 지점은 두 부류로 갈리며, 부류마다 SoT가 다르다. 이 구분이 본 결정의 핵심이다 — 섞어 바꾸면 새 불일치를 만든다.

> **분류 기준**: `phase`는 "사용자에게 진행/종료로 **보여줄까** · 인증이 **가능한가**"(표시·자격)의 SoT. `status`는 "이 row를 **변경할 수 있는가** · DB 슬롯(0029)을 점유하는가"(쓰기·권한)의 SoT. 둘은 공존한다.

#### A. `phase`/`isChallengeOver`로 변환 (표시·인증 자격) — over를 running과 분리

| 경로                                                                                               | 현재                                       | 변환 후                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/db/reads/current-challenges.ts`                                                           | `status` 필터 · `Math.max(0,ceil)`         | challenge view에 `phase` 파생 노출 · `daysLeft`→`remainingDays`                                                                 |
| `src/app/(app)/home/page.tsx`                                                                      | `status==='active'` 집계                   | `phase==='running'`/`'over'` 분리, 집계(`activeCount`·`completedToday`·`pendingToday`·"예정 벌금" `totalPenalty`)는 `running`만 |
| `src/app/(app)/home/_components/running-challenge-list.tsx` (+ 신규 `settlement-pending-list.tsx`) | status 분기                                | `running`만 렌더 · `over`는 정산 대기 CTA                                                                                       |
| `src/app/(app)/home/_components/row-pending-indicator.tsx`                                         | `status==='active'?D-${daysLeft}`          | `running`일 때만 `D-${remainingDays}`                                                                                           |
| `src/app/(app)/layout.tsx:52`                                                                      | FAB `activeChallenges = status==='active'` | `phase==='running'` (over를 인증 FAB에서 제외)                                                                                  |
| `src/lib/db/reads/active-challenge.ts`                                                             | `status==='active'` 선택 · 공식            | `/action`·`/feed` 인증 대상은 `running`만 · `remainingDays`                                                                     |
| `src/app/(app)/group/[id]/_components/group-challenges-list.tsx`                                   | `status` 배지 + `daysLeftLabel`            | `phase` 배지(`over`→"종료/정산") · `running`만 D-N                                                                              |
| `me/challenges/_components/manage-card-list.tsx` 배지                                              | `STATUS_LABEL[status]`                     | `PHASE_LABEL[challengePhase(...)]`(over→"정산 대기"). 단 같은 컴포넌트의 `canEnd` 등은 §B                                       |
| `src/app/(app)/challenge/[id]/(tabs)/layout.tsx` · `(tabs)/page.tsx`                               | 인라인 predicate + 공식                    | `challengePhase`/`isChallengeOver`/`remainingDays`                                                                              |
| `src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx` · `_components/dashboard-tab.tsx`         | `Math.max(0,ceil)` · `status==='active'`   | `remainingDays` · `phase`                                                                                                       |
| `src/app/(app)/challenge/[id]/_components/status-card.tsx` · `next-step-cta.tsx` · `feed-tab.tsx`  | `status==='active'` 분기                   | `phase`(over는 종료 신호 · 인증 prompt 숨김)                                                                                    |
| `src/app/(app)/challenge/[id]/_actions.ts:42` (kudos 게이트)                                       | 인라인 predicate                           | `isChallengeOver`                                                                                                               |

- `recap.ts:130`의 `.or(...)` SQL 필터는 Supabase 쿼리 빌더 문자열이라 TS 헬퍼를 직접 부를 수 없다 → **동일 로직을 유지**하되 "canonical = `isChallengeOver`" 주석을 단다.
- over의 D-N은 화면에 나오지 않는다(`running`일 때만 렌더). over는 일관되게 "종료/정산" 신호.

#### B. `status` 유지 (쓰기 제약·권한 미러) — 변환 금지

이 지점들은 "DB row가 변경 가능한가"를 묻는다. phase로 바꾸면 **오작동**한다.

| 경로                                                                                                            | 현재                                                          | 변환하면 안 되는 이유                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(app)/group/[id]/page.tsx` `hasOpenChallenge` (`status==='active'`)                                    | 새 챌린지 CTA 게이팅                                          | partial unique index `challenges_one_open_per_group`(0029, **status 기반**)를 미러. over도 closed 전까지 슬롯 점유라 생성 불가가 **맞다**. phase로 "생성 가능"을 보이면 DB가 23505로 거부 → 거짓 안내 |
| `me/challenges/_components/manage-card-list.tsx:84` · `challenge-owner-menu.tsx` `canEnd` (`status==='active'`) | 운영자 "종료" 버튼                                            | over는 DB상 active라 운영자가 **종료를 눌러야** 슬롯이 풀린다. `running`으로 좁히면 over의 종료 버튼이 사라져 영구 stuck                                                                              |
| 〃 `canDelete`/`canLeave` (`status!=='closed'`)                                                                 | 삭제/나가기 권한                                              | DB 변경 가능성 기준이라 status가 SoT                                                                                                                                                                  |
| `my-challenges.ts:83` `deriveCounts` · `me/challenges/page.tsx:40` 버킷 (`status!=='closed'`)                   | 운영 슬롯 차트(`OWNER_LIMIT`) · "운영 중/참여 중/종료된" 버킷 | over 는 closed 전까지 슬롯을 점유하므로 "운영 슬롯" 카운트·"운영 중" 버킷에 남는 게 맞다. 운영자 `canEnd` 도 유지돼 거기서 종료 가능(구현 중 §A→§B 정정)                                              |
| `src/lib/challenge/settlement.ts` `computeAccruedPot` (`status!=='active'&&!=='closed'→0`)                      | 누적금 산정                                                   | over(=active)는 정산 대상이라 pot 계산이 **맞다**                                                                                                                                                     |
| `action/_actions.ts:89-97` 제출 게이트 · `_actions.ts:148-157` `markActionStarted`                              | 쓰기 차단                                                     | 이미 `now<=end_at` 검사 → over 제출 차단. 변경 불필요(선택적으로 헬퍼 사용 가능)                                                                                                                      |
| `auth/callback` · `invite/[token]/_actions` 라우팅                                                              | 로그인 후 redirect                                            | status 기반 라우팅. 갓 만료된 챌린지로 라우팅돼도 종료 배너가 보이면 충분 — 저위험, 유지                                                                                                              |
| `api/cron/deadline-push/route.ts` 마감 push 스캔                                                                | `status==='active' && 미래 end_at`                            | cron 자신. §3에서 auto-close만 추가                                                                                                                                                                   |

### 3. auto-close (기존 deadline-push cron에 fold)

`src/app/api/cron/deadline-push/route.ts`에 다음 UPDATE를 추가한다. 새 cron entry는 만들지 않는다(Vercel Hobby plan: cron 하루 1회·계정당 소수 제한, `vercel.json`에 이미 2개).

```ts
await admin
  .from("challenges")
  .update({ status: "closed" })
  .eq("status", "active")
  .lte("end_at", new Date().toISOString());
```

- RLS `challenges_update_pending_owner`는 `active→closed`를 막지만 `adminClient`(service role)는 우회한다 — 기존 `endChallenge`·`deadline-push`와 동일 패턴이라 신규 migration 불필요.
- 마감 push 스캔(미래 `end_at`)과 auto-close(과거 `end_at`)는 대상 창이 달라 충돌하지 않는다.
- `status='closed'`의 의미가 "운영자 조기 종료"에서 "종료(조기 OR 자연 만료)"로 넓어지지만, recap의 `.or` 양 분기가 모두 "정산 진입"으로 수렴하므로 회귀 없음.

### 4. 적용 범위 · backfill

- **기존 stuck 행 backfill 없음.** auto-close cron 첫 실행이 `active`+만료 행을 ~1일 내 정리한다(ADR-0026의 "소급 변경 금지" 준수).
- 신규 analytics 이벤트 없음 — PRD §9.1 이벤트 표 1:1 가드레일.

### 5. DB-lag 창 (수용)

`end_at`은 KST 자정(= UTC 15:00)이고 cron은 `0 0 * * *` UTC(= KST 09:00)에 돈다. 따라서 자정에 만료된 챌린지는 같은 날 09:00 KST에 `closed`로 전이되어 **최대 ~9시간 DB-lag**가 생긴다. 이 창 동안:

- **표시**: 모든 읽기 경로가 `challengePhase`로 파생하므로 즉시 "종료/정산 대기"로 정확히 보인다.
- **쓰기 게이트**: 제출 RLS(`now between start_at and end_at`) · action-log 게이트(`now > end_at`) · kudos 게이트(`active && end_at < now`)가 `status`와 무관하게 `end_at` 기준으로 이미 차단 → 누수 없음.
- **0029 슬롯**: cron 전까지 슬롯이 점유되지만, 운영자 수동 종료(`endChallenge`)로 즉시 해제 가능.

## Alternatives Considered

### 1. status 컬럼을 SoT로 유지하고 모든 곳을 status만 보게 통일

- **Pros**: 단순 `.eq('status','active')` 쿼리가 항상 정확. 파생 계산 불필요.
- **Cons**: 자연 만료를 반영하려면 status를 실시간에 가깝게 전이시켜야 하는데, cron은 하루 1회(Hobby)라 자정~09:00 사이는 무조건 어긋난다. 그 창의 표시 정합을 status만으로는 맞출 수 없다.
- **Why not**: recap·게이트가 이미 시간 파생을 쓰고 있어, status-SoT로 통일하면 오히려 정확한 쪽(recap)을 부정확하게 되돌리는 셈.

### 2. auto-close cron만 추가하고 읽기는 status 그대로

- **Pros**: 변경 최소. 헬퍼·전수 통일 불필요.
- **Cons**: cron 주기(하루 1회) 한계로 자정~09:00 DB-lag 창에서 "D-0 진행 중" 모순이 그대로 남는다 — 사용자가 보고한 바로 그 증상이 매일 아침까지 재현.
- **Why not**: 근본(이중 정의)을 두고 전이 타이밍만 당기는 미봉책.

### 3. 전용 auto-close cron entry 신설

- **Pros**: 만료 직후(예: 00:05 KST) 닫아 DB-lag 최소. 관심사 분리가 깔끔.
- **Cons**: Vercel Hobby cron 개수 제한 초과 위험(이미 2개). Pro 업그레이드 또는 기존 cron 조정 필요.
- **Why not**: deadline-push에 fold하면 비용 0으로 동일 효과. lag는 파생-읽기가 커버.

### 4. lazy-write (읽기 중 active+만료 발견 시 그 자리에서 close UPDATE)

- **Pros**: cron 없이 슬롯 즉시 해제.
- **Cons**: cached read(ADR-0024 경계) · RLS · read-your-write 레이스 안에서의 부수효과로 viewer boundary·캐시 오염 위험.
- **Why not**: 캐시 아키텍처와 충돌. 읽기 경로에 쓰기 부수효과는 본 프로젝트 가드레일 위반.

## Consequences

### 긍정적

- "진행 vs 종료" 판정이 코드베이스 단일 헬퍼로 수렴 — "active인데 over"의 모호함이 타입(`ChallengePhase`)에서 사라져 버그 재발을 구조적으로 차단.
- 홈·그룹·me·상세가 정산·게이트와 같은 시간 기준을 공유 → 화면 간 모순 해소. "D-0"이 화면에 나올 수 없음.
- auto-close로 `status`가 ~1일 내 truthful해져 0029 슬롯이 자동 해제, 다음 챌린지 생성이 막히지 않음.
- D-N 공식 6사본 · 종료 predicate 4사본 제거.

### 부정적 / 비용

- 자정~09:00 KST DB-lag 창에서 `status`가 일시적으로 부정확(파생-읽기·게이트가 커버하므로 사용자 영향 없음, 0029 슬롯만 cron까지 점유 — 수동 종료로 즉시 해제 가능).
- `status='closed'`가 "조기 종료"만이 아니라 "자연 만료"도 포함하게 되어 의미가 넓어짐(recap 양 분기 수렴으로 기능 회귀는 없음).
- 변환 대상 site가 ~14개(§2-A)로 적지 않다 — FAB·dashboard·next-step·feed 등 표시 경로 전반의 prop 타입·분기를 `phase`로 교체하는 churn. 단 §2-B(쓰기·권한)는 손대지 않아 권한 로직 회귀 위험은 없다.
- **홈 "정산 대기"는 transient다.** `phase==='over'`는 `active`+만료(=auto-close 전)만이라, cron이 `closed`로 바꾸면 `current-challenges`의 `status IN (pending,accepted,active)` 필터에서 제외되어 홈 정산 대기 섹션에서 사라진다(~1일 내). 이후 정산 진입은 `/me/challenges` "종료된 챌린지" + 챌린지 상세 `ChallengeEndedBanner`로 이동한다. 즉 홈의 정산 nudge 창은 [만료, auto-close] 구간(≈9h~1일)으로 짧다. 지속 nudge가 필요하면 "closed + 미정산" 상태 추적(신규 flag)이나 별도 read가 필요 — POC 범위 밖으로 보류. (단, 이전 동작은 만료 챌린지가 "진행 중·D-0"으로 **영구** 잘못 노출되던 것이라, 짧은 정산 대기로의 전환은 순개선.)

### 후속 영향

- 구현 계획: [`docs/superpowers/plans/2026-05-30-challenge-derived-over.md`](../superpowers/plans/2026-05-30-challenge-derived-over.md).
- [ADR-0026](0026-challenge-end-boundary-kst-midnight.md) "후속 영향"의 `deadline-push` cron 관련 항목과 연결 — 본 ADR이 그 cron에 auto-close를 fold.
- `ChallengeEndedBanner` 주석의 "서버 status 갱신은 후속 cron(#37)"이 본 결정으로 구현됨 — 주석 갱신.
- `docs/BE_SCHEMA.md` §5.5 `status` 상태 전이 설명에 "auto-close(cron)" 경로 추가.

## Links

- 상위: [ADR-0026 — 챌린지 종료 경계를 KST 자정으로 정렬](0026-challenge-end-boundary-kst-midnight.md)
- SoT 헬퍼(신규): `src/lib/challenge/lifecycle.ts`
- 0029 제약: [`supabase/migrations/0029_one_active_challenge_per_group.sql`](../../supabase/migrations/0029_one_active_challenge_per_group.sql)
- auto-close 위치: `src/app/api/cron/deadline-push/route.ts`
