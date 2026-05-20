---
spec: 2026-05-20-group-challenge-concept
title: 그룹과 챌린지의 책임 분리 · 솔로 카피 정합화 · 현황판 KPI 버그 수정
author: ian
date: 2026-05-20
status: draft
---

## Summary

PRD·코드·UI가 "그룹 = 챌린지"인 양 혼용되어 모순이 누적되었다. 본 spec은 그룹과 챌린지를 1:N + 직렬(동시 1개) 모델로 재정의하고, 그에 맞춰 (a) 권한 모델, (b) `StatusCard` 사회증명 카피, (c) `DashboardTab` 현황판 KPI "종료" 라벨 버그 세 가지를 한 PR로 정리한다.

핵심 결정:

- **그룹 owner만 챌린지 생성** (PRD AC-1 복원).
- **그룹당 동시 1개**(`pending|accepted|active` 합쳐 1개) — partial unique index 로 강제.
- **계좌는 그룹 속성** — 변경 시 진행 중 챌린지에 즉시 반영(현 join 구조 유지).
- **카피는 status × 솔로 × owner 3축 분기** — `pending+솔로`에서 "혼자 시작했어요" 노출되던 버그 제거.
- **현황판 KPI 라벨은 status 직접 분기** — `endAt === null`을 "종료"로 오해하던 버그 제거.

이 spec이 머지되면 ADR-0011, migration 0029, 카피·KPI 수정 PR이 같은 묶음으로 따라온다.

## Why

- 현행 `createChallenge` `_actions.ts` 만 보면 `withUser` 통과한 누구나 호출 가능한 것처럼 읽힌다. 실제로는 RPC `create_challenge`(0022) 와 RLS `challenges_insert_owner`(0002) 가 owner-only 로 강제하고 있으나, 그 의도가 Server Action 표면과 UI(비owner에게 "새 챌린지" CTA 노출) 에 드러나지 않아 회귀 위험이 남는다. 본 spec 은 표면(UI CTA·에러 매핑)에 owner-only 의도를 표면화하고, DB 에는 동시 1개 제약만 신규로 보강한다.
- 현행 RPC/스키마는 같은 그룹에 `active|pending` 챌린지가 둘 이상 존재하는 것을 막지 않는다. POC 데이터 규모상 발생 안 했을 뿐.
- `StatusCard.socialProof` 는 `participantCount === 1` 하나로 결정되어 `pending+솔로`에서 "혼자 시작했어요"가 노출된다 — 시작 안 한 상태에 시작했다고 함. `active` freeze 상태에서도 "친구를 초대해보세요"가 멤버에게도 노출되어 의미가 어긋난다.
- `DashboardTab` 의 3번째 KPI 는 `daysRemaining === null` 을 "종료"로 표시한다. 그러나 `end_at IS NULL` 은 `pending|accepted` 에서 더 흔하다 — 시작 안 한 챌린지에 "종료"라는 잘못된 라벨이 노출된다. 정작 `closed` 에서는 `daysRemaining = 0` 이 되어 "남은 0일"이 표시된다(의미가 정확히 반전).
- 위 네 가지는 동일한 모호함(그룹/챌린지 책임 분리 불명확)의 다른 얼굴이므로 한 spec·한 PR 로 묶는 편이 일관성이 높다.

## Impact Scope

### 변경 경로

- 신규:
  - `docs/adr/0011-group-challenge-ownership-model.md`
  - `supabase/migrations/0029_one_active_challenge_per_group.sql`
  - `src/app/(app)/challenge/[id]/_components/status-card.spec.tsx`
  - `tests/integration/migrations/create-challenge.spec.ts`
- 수정:
  - `docs/PRD.md` §3.3 AC-1, §3.4 솔로 카피 매트릭스
  - `docs/BE_SCHEMA.md` §5.5 비고
  - `src/app/(app)/challenge/[id]/_components/status-card.tsx` (props 확장 — signedCount, isOwner)
  - `src/app/(app)/challenge/[id]/_components/dashboard-tab.tsx` (props 확장 — status)
  - `src/app/(app)/challenge/[id]/_components/dashboard-tab.spec.tsx` (status 별 케이스 정정)
  - `src/app/(app)/challenge/[id]/(tabs)/layout.tsx` (`StatusCard` 호출에 신규 props 전달 — `totalSigned`/`isOwner` 는 이미 계산 중)
  - `src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx` (`DashboardTab` 호출에 `status` 전달)
  - `src/app/(app)/challenge/new/page.tsx` (owner 의 open challenge 시 redirect — C8)
  - `src/app/(app)/challenge/new/_actions.ts` (변경 없음 — 기존 매핑 그대로. 본 PR 에서 손대지 않을 수도 있음)
  - `src/app/(app)/group/[id]/page.tsx` — 검토 결과 변경 불필요. 현재 group 페이지에 "새 챌린지" CTA 자체가 없음. owner-only 게이트는 (a) RPC/RLS 기존 강제 + (b) `/challenge/new/layout.tsx` RSC 가드(C8) 로 충분.

### src/ 영향

- 챌린지 상세 페이지 UI 2곳(`StatusCard`, `DashboardTab`) 카피·라벨 분기 — 신규 props (`signedCount`, `isOwner`, `status`).
- **`(tabs)/layout.tsx` 가 이미 `totalSigned` 와 `isOwner` 를 계산하고 있다** (L40·L47, `fix/challenge-detail-nested-tabs` 브랜치 기준). 따라서 read 변경·신규 derive 없이 **`StatusCard` 호출부의 prop 전달만 추가**.
- 챌린지 생성 진입 가드 — `/challenge/new` RSC 가 owner 의 open challenge 시 redirect.
- 그룹 상세 진입 1곳에서 비owner "새 챌린지" CTA 숨김.
- Server Action 에러 매핑은 기존 `mapSupabaseError` 가 이미 처리(`forbidden`·`conflict`). 호출처 UI 토스트만 컨텍스트 분기.

### Supabase / RLS / migration 영향

- migration 0029: `challenges` 에 partial unique index (`group_id` where `status in ('pending','accepted','active')`). 단방향, down 스크립트 없음(POC 정책).
- RPC `create_challenge`(0022) 의 owner 가드는 기존대로 유지. 본 spec 은 RPC 본문을 변경하지 않는다.
- RLS 변경 없음 — `challenges_insert_owner`(0002) 가 이미 owner-only.

### 외부 서비스

없음.

## Design

### C1. 도메인 모델 (개념 정리)

| 주체 | 정의 | 키 |
|---|---|---|
| **그룹** | 사람·계좌·초대링크의 영속 컨테이너 | `groups` |
| **그룹 owner** | 그룹 대표 · 계좌 보유자 · 초대권자 · **챌린지 생성/시작 단독 권한** | `groups.owner_id` |
| **챌린지** | 그룹이 한 번에 1개 수행하는 주간 단위 인스턴스 (직렬) | `challenges` |
| **참가자** | 챌린지가 `pending` 인 동안 코호트로 freeze 되는 멤버 | `challenge_participants` |

규칙:
- **그룹당 동시 챌린지 1개** — `status in ('pending','accepted','active')` 인 챌린지가 이미 있으면 새 챌린지 생성 거부.
- **친구 초대 = 그룹 가입**이 1차 의미. "현 챌린지 참가"는 부수 효과로, 챌린지가 `pending` 일 때만 자동 편입(`accept_invite` RPC 동작 그대로).
- **계좌는 그룹 속성**. 챌린지는 계좌를 따로 갖지 않고 항상 그룹의 현재 값을 비춤 — 변경 시 진행 중 챌린지에 즉시 반영(`groups!inner(...)` join 으로 이미 자연 반영됨).

### C2. 권한 모델

| 권한 | 누구 | 강제 위치 |
|---|---|---|
| 그룹 생성 | 누구나 (auto-group 그대로) | `create_group_with_owner` RPC |
| **챌린지 생성** | **owner만** | 기존 강제 위치 유지 — RPC `create_challenge`(0022) 의 owner 체크 + `challenges_insert_owner` RLS(0002). 본 spec 은 UI CTA 가드만 추가 |
| 챌린지 시작 (pending→active) | owner만 | 기존 가드 유지 |
| 초대 링크 생성 | owner만 | `invites_insert_owner` RLS |
| 계좌 등록·수정 | owner만 | `groups_update_owner` RLS |

`challenges.created_by` 컬럼은 **추가하지 않는다** — owner=creator 모델이므로 불필요. **왜**: 컬럼 추가는 BE_SCHEMA·types·read·RLS 전부에 파급되어 비용이 큰데, 본 spec 결정 하에서는 정보 가치가 없다.

### C3. 스키마 변경 (migration 0029)

```sql
-- supabase/migrations/0029_one_active_challenge_per_group.sql
-- 그룹당 동시 챌린지 1개만 허용. closed 는 제외하여 직렬 진행에는 영향 없음.

create unique index if not exists challenges_one_open_per_group
  on public.challenges (group_id)
  where status in ('pending', 'accepted', 'active');
```

- `if not exists` — `pnpm supabase db reset` 외 부분 reset / test isolation 환경에서 idempotent.

- **owner 가드는 이미 강제됨**: `0022_create_challenge_rpc_fix.sql` 의 RPC 본문(L40-46) 이 `v_owner_id <> v_uid` 시 `42501` 을 raise. 추가로 `0002_rls.sql` 의 `challenges_insert_owner` 정책이 직접 INSERT 도 owner-only 로 차단. **본 spec 은 owner 가드를 신규 추가하지 않고, partial unique index 만 보강**.
- partial unique index 충돌은 sqlstate `23505` 로 표면화 → 기존 `mapSupabaseError` 가 자동으로 `"conflict"` ErrorCode 로 매핑. 신규 `"already_open"` 코드를 만들지 않고 **`createChallenge` 호출처 UI 에서 `error === "conflict"` 시 "이미 진행 중인 챌린지가 있어요" 토스트** 로 컨텍스트 분기. **왜**: `ErrorCode` union 확장은 응답 계약·UI 카피 매핑 등 광범위한 파급이 있으나, `createChallenge` 가 conflict 를 반환하는 유일한 경로가 본 partial unique 이므로 컨텍스트 분기로 충분.

사전 확인 명령(적용 직전):

```sql
select group_id, count(*)
  from challenges
 where status in ('pending','accepted','active')
 group by 1
having count(*) > 1;
```

결과가 비어 있어야 index 생성이 성공한다. POC 데이터 규모상 비어 있을 가능성이 높지만, 비어 있지 않으면 데이터 정리부터 별도 PR 로 선행.

### C4. 카피 매트릭스 (StatusCard.socialProof)

| status | 솔로 (1명) | 멀티 (≥2) |
|---|---|---|
| `pending` | owner: "서명 대기 · 지금 초대하면 함께 시작해요" / 비owner: "서명 대기 중" | `{signedCount}/{N}명 서명` |
| `accepted` | (안전망 — 실제 발생 안 함, 아래 주석 참조) | `{N}명 모두 서명 완료 · 곧 시작` (안전망) |
| `active` | owner: "혼자 시작했어요 · 다음 챌린지엔 함께해요" / 비owner: "혼자 진행 중" | `{N}명이 함께해요` |
| `closed` | "혼자 마쳤어요" | `{N}명이 함께했어요` |

- 비owner+솔로 케이스는 정의상 거의 발생하지 않으나(솔로=owner 1명) 안전망 카피만 둠.
- `active` 의 초대 유도 카피("다음 챌린지엔…")는 **owner에게만 노출** — invite 토큰 생성 권한이 owner에게만 있으므로 그 외에 노출하면 누를 곳이 없어 좌절.
- **freeze 경계** (`accept_invite` RPC 와 정합):
  - `pending`: 신규 invitee 가 `challenge_participants` 에 자동 편입됨 → "지금 초대하면 함께 시작해요" 카피가 참.
  - `accepted` 이후: freeze. 신규 invitee 는 `group_members` 에만 합류하고 다음 챌린지부터 함께함. 따라서 `accepted`·`active` 솔로 카피는 "다음 챌린지엔…" 또는 "혼자 시작하기" 안내로만 분기하고, "지금 초대하면 함께 시작" 카피는 노출하지 않는다.
- **`accepted` 는 현재 dead state**: CHECK 제약(`pending|accepted|active|closed`) 상 가능한 상태이지만, 어떤 RPC 도 `status='accepted'` 로 전이시키지 않는다(`grep -rn "'accepted'"` 결과 모두 read-side 매칭). 따라서 솔로 owner 의 실제 흐름은 `pending → (owner가 "혼자 시작하기") → active` 이며 `accepted` 를 거치지 않는다. 매트릭스의 `accepted` 행은 향후 status 전이 RPC 가 다시 도입될 때를 위한 **안전망** 으로만 유지하며, 본 PR 의 UI 테스트는 `accepted` 케이스를 강제하지 않는다.

### C5. 현황판 KPI 라벨 (DashboardTab.daysPill)

기존:

```tsx
<KpiPill label={daysRemaining != null ? `남은 ${daysRemaining}일` : "종료"} />
```

문제: `end_at IS NULL` 은 `pending|accepted` 에서 흔하고 `closed` 에서는 실제 종료 시각이 들어 있어 `daysRemaining === 0` 이 됨. 의미와 표시가 정확히 반전.

수정:

```tsx
const daysPill =
    status === "pending"  ? "시작 전"
  : status === "accepted" ? "곧 시작"
  : status === "active"   ? (daysRemaining != null ? `남은 ${daysRemaining}일` : "—")
  : /* closed */            "종료";
```

- `DashboardTab` props 에 `status` 추가.
- `daysRemaining` 자체의 계산 로직(`computeDaysLeft`)은 변경 없음 — 표시 레이어에서만 분기.

### C6. 데이터 read — `signedCount` 도출 위치

`fetchChallengeDetail`(`src/lib/db/reads/challenge-detail.ts`) 은 이미 `members[].signed` 를 노출한다(L66-74). 그리고 본 PR 베이스 브랜치 `fix/challenge-detail-nested-tabs` 의 `(tabs)/layout.tsx` 가 **이미** 동일한 derive 를 수행 중:

```ts
// src/app/(app)/challenge/[id]/(tabs)/layout.tsx (현재 코드, L40·L47)
const isOwner = detail.group.ownerId === user.id;
const totalSigned = detail.members.filter((m) => m.signed).length;
```

→ 본 spec 의 작업은 read 변경·신규 derive 없이 **`StatusCard` 호출부에 `signedCount={totalSigned}` 와 `isOwner={isOwner}` 두 줄 prop 전달만 추가**하는 것. `DashboardTab` 의 `status` 도 `(tabs)/dashboard/page.tsx` 에서 `detail.status` 를 전달.

**왜**: route group 재구성(ADR-0010) 으로 derive 가 이미 leaf-level 에서 끝나 있어 본 spec 의 코드 변경 면적이 호출부 1줄씩에 그친다.

### C7. Server Action 에러 매핑

기존 `mapSupabaseError`(`src/lib/actions/supabase-error.ts`) 가 이미 다음을 자동 매핑한다:

- `42501` → `"forbidden"` (RLS·RPC owner 거부)
- `23505` → `"conflict"` (unique 위반 — 본 spec 의 partial unique 포함)
- `P0002` → `"not_found"` (RPC `raise '...' using errcode='P0002'`)

따라서 `createChallenge` `_actions.ts` 의 코드 변경은 거의 없다. **호출처 UI** 에서만 컨텍스트 분기로 한국어 토스트를 표시:

```ts
// src/app/(app)/challenge/new/page.tsx 클라이언트 측 (의사코드)
if (!res.ok) {
  const msg =
    res.error === "forbidden" ? "그룹장만 챌린지를 만들 수 있어요" :
    res.error === "conflict"  ? "이미 진행 중인 챌린지가 있어요" :
                                "잠시 후 다시 시도해주세요";
  toast.error(msg);
}
```

**왜 `"conflict"` 재활용**: 신규 `"already_open"` 코드를 만들면 `ErrorCode` union 확장·`mapSupabaseError` 의 23505 분기·UI 카피 매핑까지 파급. `createChallenge` 가 conflict 를 반환하는 유일한 경로가 본 partial unique 이므로 컨텍스트 분기로 충분.

### C8. UI 진입 가드

- 검토 결과 현재 코드에 비owner 가 누를 수 있는 "새 챌린지" CTA 는 존재하지 않는다(`/group/[id]` 에 없음, home 의 EmptyState 는 그룹 없는 신규 사용자 전용). 따라서 "비owner CTA 숨김" 변경은 불필요.
- 비owner 가 URL 직타로 `/challenge/new` 를 진입하면 (a) auto-group 분기로 자기 새 그룹의 owner 가 되거나 (b) 기존 그룹 ID 로 `groupId` 쿼리를 강제 전달했어도 RPC owner 가드(42501) 가 거절 → toast 노출.
- **owner 의 open challenge 진입 가드**: `/challenge/new` 의 RSC 단계에서 사용자가 owner 인 그룹 중 `status in ('pending','accepted','active')` 챌린지를 가진 그룹이 있는지 확인하고, **있으면 그 챌린지로 `redirect()`**. **왜**: 사용자가 폼을 다 채우고 제출한 뒤에야 conflict 토스트를 보는 건 시간 낭비. 진입 단계에서 막으면 사용자가 자기가 현재 무엇을 하던 중이었는지 즉시 파악.
  - 구현 쿼리(의사 SQL):
    ```sql
    select c.id from challenges c
      join groups g on g.id = c.group_id
     where g.owner_id = auth.uid()
       and c.status in ('pending','accepted','active')
     order by c.created_at desc
     limit 1
    ```
  - **다수 그룹 disambiguation**: 사용자가 여러 그룹의 owner 일 수 있으나(auto-group + 수동), open challenge 는 그룹당 1개로 제한되었으므로 사용자 전체에서 최대 N개. **가장 최근 `created_at desc` 1건** 으로 redirect.
  - ADR-0003 auto-group 흐름은 보존 — open challenge 가 없으면 폼 그대로 렌더(현재 사용자가 어떤 그룹의 owner도 아닐 수 있다는 첫 챌린지 케이스 포함).

## Alternatives Considered

### A1. `challenges.created_by` 컬럼 추가 + 모든 멤버에게 챌린지 생성 허용

- 장점: 활동성↑, "owner=대표" 와 "creator=만든 사람" 을 분리할 수 있어 유연.
- 단점: BE_SCHEMA·RLS·read·types·UI 전부 파급. owner 부재 시 시작 권한·정산 권한 위임 정책까지 새로 정의해야 함.
- 기각: POC 범위 초과. 브레인스토밍 Q1 재논의 후 owner-only 로 합의됨.

### A2. 솔로 카피의 status 무분기 유지 + 비owner에게 invite 진입 추가

- 장점: 카피 분기 코드 단순.
- 단점: invite 권한 모델까지 흔들어야 함. RLS 변경·초대 한도·중복 토큰 정책 등 파급.
- 기각: 카피 분기가 더 외과적이고 PRD/원본 의도와 정합.

### A3. KPI "종료" 라벨을 `daysRemaining === 0 && status === "closed"` 같은 복합 조건으로 보강

- 장점: 기존 props 시그니처 유지.
- 단점: 표시 의도를 결정하는 진짜 신호는 `status` 이므로, 파생 신호(`daysRemaining`) 로 분기하는 패턴이 그대로 남아 차후 회귀 재발 가능.
- 기각: status 를 직접 받는 편이 명료.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm supabase db reset
pnpm test -- integration/migrations
```

### 시나리오

정상:
- owner 가 빈 그룹에 챌린지 생성 → 성공.
- owner 가 closed 만 있는 그룹에 새 챌린지 생성 → 성공(partial unique 충돌 없음).
- 솔로 owner pending 진입 → "서명 대기 · 지금 초대하면 함께 시작해요" + KpiPill "시작 전".
- 솔로 owner 가 자가 서명 후 그대로 둠 → 챌린지는 여전히 `pending` (자동 status 전이 없음) → 카피 유지.
- 솔로 owner 가 "혼자 시작하기" 누름 → active 전이 → "혼자 시작했어요 · 다음 챌린지엔 함께해요" + KpiPill "남은 N일".
- 멀티 active → "{N}명이 함께해요" + KpiPill "남은 N일".
- closed 진입 → "{N}명이 함께했어요" 또는 "혼자 마쳤어요" + KpiPill "종료".
- owner 가 active 챌린지가 있는 그룹의 계좌를 등록 → 상세 페이지 새로고침 시 last4 즉시 반영.

실패/엣지:
- 비owner 가 RPC `create_challenge` 직접 호출 → 42501 → `mapSupabaseError → "forbidden"` → 토스트 "그룹장만 …".
- owner 가 같은 그룹에 active 있는 채 두 번째 챌린지 생성 → 23505 → `mapSupabaseError → "conflict"` → 토스트 "이미 진행 중인 …" (단 일반적으로는 `/challenge/new` RSC redirect 가 먼저 잡아서 이 경로는 race 조건의 fallback).
- pending 챌린지가 있는 채로 다시 호출 → 동일하게 `"conflict"` 거부.
- `pending` 상태인데 `endAt IS NULL` 이어도 KpiPill 이 "종료" 가 아니라 "시작 전" 으로 표시되는지 회귀 테스트.

## Rollout

- 본 spec 머지 → ADR-0011 + migration 0029 + UI 수정을 묶은 PR 1개.
- 사전 확인 쿼리(C3) 로 데이터 충돌 없음을 검증 후 migration 적용.
- dogfood 1~2일 동안 active 솔로 owner / 솔로 owner pending / 멀티 active / closed 4상태를 한 번씩 통과시켜 카피·라벨 회귀 확인.
- Week 2 GO/NO-GO 회의(`docs/VALIDATION.md`)에서 운영 데이터 재검토 — 그룹당 1개 제약이 실제 사용 흐름에서 마찰을 만드는지 확인.

### 롤백

- migration 0029 는 단방향이지만 `drop index challenges_one_open_per_group;` 한 줄로 즉시 무효화 가능(긴급 시 후속 migration 으로 처리, ADR-0009 정책과 동일).
- UI/Server Action 변경은 PR revert 1회로 완전 되돌릴 수 있음.
- 카피 변경만 되돌리고 KPI 수정은 유지하고 싶다면 두 영역이 다른 커밋으로 분리되어 있어 부분 revert 가능.

## Out of scope

- `active` 솔로 owner 가 invite 버튼을 누를 때 "다음 챌린지엔 함께해요" 모달 흐름 (CTA 후속 UX 별도 spec).
- `pending` 에서 KpiPill "총 인증 0회 · 실패 0회" 를 숨길지 여부 (디자인 결정 별도).
- `challenges.created_by` 도입을 통한 owner ≠ creator 분리 (POC 이후 v1 검토).
- 멤버 → owner 권한 위임 / co-owner 도입 (POC 이후).
- owner 이탈 시 그룹 자동 승계 (현 정책: 그룹 해산, PRD §3.3 유지).
- **`active` 중 합류한 신규 멤버 안내 강화**: 현재 `JustJoinedBanner(?joined_late=1)` 가 일부 처리하나, 신규 멤버 가 챌린지 상세에 진입했을 때 "이 챌린지는 진행 중이고, 너는 다음 챌린지부터 참가" 메시지가 챌린지 상세 본문에 노출되는지는 본 spec 범위 밖. 후속 검증.
- **`accepted` status 재활성화 여부**: 현재 dead state. 재도입하려면 별도 RPC 와 PRD 갱신 필요. 본 spec 은 안전망 카피만 둠.
- **PRD AC-6 freeze 경계 wording 정정**: PRD 는 "active 이후" 합류는 group-only 라고 표기하나, 실제 `accept_invite` 는 `pending` 만 매칭(`accepted` 부터 freeze). 코드 동작이 더 보수적. PRD 갱신은 별도 PR.
- **`NextStepCta` 의 "정보 탭에서 혼자 시작할 수 있어요" 카피 정정**: ADR-0010 (nested route tabs) 이후 시작 버튼(`StartChallengeCard`)은 `(tabs)/layout.tsx` 에 위치하여 정보 탭이 아닌 모든 탭 공통 영역에 노출된다. NextStepCta 카피가 정보 탭을 지시하는 것은 outdated. 별도 PR 에서 정정.

## 용어집

- **ADR**: Architecture Decision Record — 되돌리기 비용 큰 결정을 보존하는 짧은 기록.
- **freeze**: 챌린지가 `active` 로 전이된 뒤 참가자 코호트가 고정되어 추가/제거되지 않는 상태 (PRD AC-6).
- **owner**: 그룹의 대표·계좌 보유자·초대권자. `groups.owner_id` 가 가리키는 사용자.
- **partial unique index**: 특정 조건(WHERE) 을 만족하는 행에만 적용되는 유니크 제약. Postgres `CREATE UNIQUE INDEX ... WHERE ...`.
- **POC**: Proof of Concept — 본 프로젝트의 2주 검증 단계.
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어.
- **RPC**: Remote Procedure Call — Supabase Postgres 함수 호출.
- **SoT**: Single Source of Truth — 중복 정의 없이 한 곳을 기준으로 삼는 원본.
- **socialProof**: `StatusCard` 의 하단 카피 영역. status × 솔로 × owner 3축으로 분기.
