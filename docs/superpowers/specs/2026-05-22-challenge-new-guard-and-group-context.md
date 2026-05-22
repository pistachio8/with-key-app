---
spec: 2026-05-22-challenge-new-guard-and-group-context
title: /challenge/new 가드 그룹 컨텍스트 인식 + 헤더 그룹 sheet 캐시 정합성
author: pistachio8
date: 2026-05-22
status: draft
---

## Summary

`/challenge/new` 의 진입 가드를 **그룹 단위**로 재정의해 PRD §3.3 AC-1 ("그룹당 동시 1개")과 일치시킨다. 동시에 그룹 생성·변경·삭제 액션이 `(app)` layout 캐시(`fetchMyGroups()`, `fetchOwnerGroupsForChallengeForm()`)를 무효화하지 않아 AppHeader 그룹 sheet 가 stale 해지는 문제를 `revalidatePath('/', 'layout')` 한 줄로 해결한다.

부수적으로 (a) `NewGroupDialog` 가 생성 직후 push 하는 URL 의 `?welcome=` 쿼리를 제거(invite 자동가입 전용 카피와 의미 충돌), (b) 폼의 그룹 select 에서 이미 open challenge 가 있는 그룹을 disabled 로 표시해 사용자가 풀-코스 입력 후 conflict 거절을 당하지 않도록 한다.

## Why

- **Bug 1 (헤더 sheet 갱신 누락)**: `createGroup` 후 `router.push + router.refresh` 만으로는 다른 라우트(`/home`)에 캐시된 layout RSC payload 가 무효화되지 않는다. Next.js 16 Client Router Cache 가 prior 페이로드를 재사용 → AppHeader `groups` prop 이 새 그룹을 모름.
- **Bug 2 (`/challenge/new` 가드의 그룹 컨텍스트 무시)**: `/challenge/new/layout.tsx` 의 `fetchOwnerOpenChallenge` 가 사용자가 owner 인 **모든 그룹**을 통틀어 open challenge 를 찾아 redirect 한다. group-header 의 `hasOpenChallenge` 는 **그룹별**로 검사 → 둘의 "open" 정의가 불일치. layout 은 `searchParams` 를 받지 못해 `?groupId=` 컨텍스트 인식 불가.
- **Welcome 카피 mismatch**: ADR-0008 의 `?welcome=` 쿼리는 invite 콜백이 자동가입 후 부착하는 1회성 신호 — "🎉 OO에 합류했어요" 배너 카피. 직접 만든 사용자에게는 "합류"가 어색.
- **풀-코스 거절 UX**: owner 그룹이 2개 이상이고 일부에 open challenge 가 있을 때 폼에서 그룹 선택 → 빈도/기간/서명까지 완료 → 제출 시 unique index conflict. 사전 차단이 친절.

## Impact Scope

### 변경 경로

- 신규:
  - `docs/superpowers/specs/2026-05-22-challenge-new-guard-and-group-context.md` (본 문서)
- 수정:
  - `src/app/(app)/group/new/_actions.ts` — `createGroup` 에 `revalidatePath('/', 'layout')`
  - `src/app/(app)/group/[id]/_actions.ts` — `renameGroup`, `deleteGroup` 에 동일
  - `src/app/(app)/challenge/new/_actions.ts` — `createChallenge` success 직전에 동일 (auto-group 분기 포함 효과)
  - `src/app/(app)/challenge/new/page.tsx` — `searchParams.groupId` 인식 가드 분기 추가, `initialGroupId` fallback 보정
  - `src/lib/db/reads/owner-groups-for-challenge-form.ts` — `openChallengeId` 필드 추가, `challenges` SELECT 에 `id, status` 추가, `buildOwnerGroupsForChallengeForm` 매핑 보강
  - `src/app/(app)/challenge/new/_components/new-challenge-form.tsx` — `ChallengeFormGroupOption` 에 `openChallengeId` 추가, `SelectItem disabled` + "(진행 중)" 라벨
  - `src/components/app-shell/new-group-dialog.tsx` — push URL 에서 `?welcome=` 제거
  - 테스트: 4개 spec 에 `next/cache` mock 추가, `_actions.spec.ts` group fixture 에 `openChallengeId` 필드 추가, `owner-groups-for-challenge-form.spec.ts` 에 `openChallengeId` 매핑 케이스 2개 추가
- 삭제:
  - `src/app/(app)/challenge/new/layout.tsx` (가드 page 로 이전)
  - `src/lib/db/reads/owner-open-challenge.ts` (`owner-groups-for-challenge-form` 가 동일 정보 제공)

### src/ 영향

- `(app)` 그룹 layout 캐시 무효화가 그룹 변경 4개 액션 후 발생 — POC 규모(그룹 < 10, 사용자 액션 빈도 ~분 단위)에서 부담 미미.
- `owner-groups-for-challenge-form` 가 challenges 테이블을 1회 더 SELECT 하지 않음 — 기존에도 가져오던 컬럼에 `id, status` 만 추가.

### Supabase / RLS / migration 영향

없음. 기존 RLS (`challenges_select_member`, `groups_select_member`) 로 owner 가 자기 그룹의 모든 챌린지를 SELECT 가능.

### 외부 서비스

없음.

## Design

### C1 — `/challenge/new` page 가드 분기 매트릭스

| 시나리오                                            | 동작                                         | 근거                             |
| --------------------------------------------------- | -------------------------------------------- | -------------------------------- |
| `?groupId=X` + X 에 open(pending\|accepted\|active) | `/challenge/${openId}` redirect              | PRD AC-1 그룹당 1개              |
| `?groupId=X` + X 에 open 없음                       | 폼 렌더                                      | 정상                             |
| `?groupId=X` + X 가 사용자 owner 아님               | 가드 skip, `initialGroupId` 는 첫 selectable | 기존 fallback 보존 (silent)      |
| groupId 없음 + owner 그룹 0개                       | 폼 (ADR-0012 auto-group)                     | 첫 챌린지 사용자                 |
| groupId 없음 + owner 그룹 1개 + 그 그룹 open        | 그 챌린지로 redirect                         | spec C8 의도 보존                |
| groupId 없음 + owner 그룹 ≥1 + **모두** open        | 가장 최근 open challenge 로 redirect         | 새 챌린지 만들 수 있는 그룹 없음 |
| groupId 없음 + 일부만 open                          | 폼 + select 에서 open 그룹 disabled          | 사전 차단                        |

**왜 layout 이 아니라 page 인가**: Next.js 16 layout 은 `searchParams` 를 props 로 받지 않는다. 가드가 `?groupId=` 를 인식하려면 page 에 두어야 한다.

### C2 — `OwnerGroupForChallengeForm.openChallengeId`

`buildOwnerGroupsForChallengeForm` 가 challenges 입력에서 status ∈ {pending, accepted, active} 인 가장 최근 row 의 id 를 그룹별로 매핑. closed 만 있으면 null.

### C3 — `revalidatePath('/', 'layout')` 위치

`createGroup`, `renameGroup`, `deleteGroup`, `createChallenge` 의 success 응답 직전. **왜 항상 호출**: 분기마다 다른 라우트의 layout 데이터에 영향 — 사용자 액션 빈도가 분 단위라 부담 미미하고 "그룹 식별/이름/존재" 와 "open challenge id" 가 모두 layout 데이터에 들어가므로 안전한 디폴트.

### C4 — `?welcome=` 사용자 직접 생성 경로에서 제거

`NewGroupDialog` 의 push URL 에서 쿼리 제거. invite 콜백(`/auth/callback`) 의 `?welcome=` 부착은 그대로 유지 — 두 경로의 의미가 분리됨. `toast.success("새 그룹을 만들었어요")` 가 사용자 직접 생성의 confirmation 을 담당.

### C5 — Select 라벨 카피

`SelectItem` children: `{name}` 또는 `{name} (진행 중)`. base-ui `<SelectPrimitive.ItemText>` 가 trigger label 에 mirror 되지만 disabled 그룹은 선택 불가 → trigger 에는 selectable 그룹의 이름만 표시됨. 칩 컴포넌트 대신 텍스트 보강을 채택해 ItemText 제약 우회.

## Alternatives Considered

1. **`fetchOwnerOpenChallenge` 시그니처에 `groupId?` 옵션 추가** — `owner-groups-for-challenge-form` 와 데이터 중복. 통합 폐기.
2. **layout 가드 그대로 두고 모든 owner 그룹 open 일 때만 redirect** — `?groupId=` 컨텍스트 인식 불가 (layout 한계).
3. **`?welcome=` 카피를 양쪽 모두 자연스러운 표현으로 통일** — 의미가 흐려짐. 경로별 카피 분리가 정직.
4. **Select 에서 open 그룹을 아예 숨김** — 사용자가 "왜 어떤 그룹은 안 보이지" 인지 불명확. disabled + "(진행 중)" 가 더 정직.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
```

### 시나리오

1. **Bug 1 (revalidate)**: 헤더 sheet → 새 그룹 만들기 → `/home` 이동 → 헤더 sheet 다시 열기 → 새 그룹 보임.
2. **Bug 1 — rename**: 그룹 이름 변경 → 다른 페이지 이동 → 헤더 sheet 에 새 이름 반영.
3. **Bug 1 — delete**: 그룹 삭제 후 `/home` → 헤더 sheet 에서 사라짐.
4. **Bug 1 — auto-group**: 그룹 0개 사용자 → `/challenge/new` 폼 제출 → 헤더 sheet 에 새 그룹 + 챌린지 즉시 반영.
5. **Bug 2 — 그룹 컨텍스트**: 그룹 A(closed) + 그룹 B(active) 상태에서 A 의 "이 그룹에서 새 챌린지" → `/challenge/new?groupId=A` 폼 정상 렌더 (B 의 챌린지로 튕기지 않음).
6. **Bug 2 — spec C8 보존**: owner 그룹 1개 + active 챌린지 → `/challenge/new` 직접 진입 → 그 챌린지로 redirect.
7. **Bug 2 — 모든 그룹 open**: owner 그룹 A(active) + B(active) → `/challenge/new` 직접 진입 → 가장 최근 open 으로 redirect.
8. **Follow-up — select disabled**: owner 그룹 A(active) + B(none) → `/challenge/new` → Select 열기 → A 는 "(진행 중)" + disabled, B 는 선택 가능, B 가 initialGroupId.
9. **Welcome 카피**: 헤더 sheet → 새 그룹 만들기 → 새 그룹 상세 페이지 도달 → "🎉 OO에 합류했어요" 배너 안 보임 (toast 만).

## Rollout

단일 PR 머지 → develop 자동 배포 → dogfood 확인 (시나리오 1, 5, 8 핵심). 운영 데이터 1주 누적 후 가드 분기 빈도(특히 7번 모든-open redirect) 측정해 UX 개선 필요성 재평가.

### 롤백

1 PR revert 로 원복 가능. DB 변경 없음. spec/문서/타입 변경만이므로 데이터 손실 위험 없음.

## Out of scope

- 헤더 sheet 에 그룹별 "진행 중" 표시 추가 (이번 PR 은 Select 에만)
- group-header 의 "현재 진행 중인 챌린지가 있어요" disabled 버튼에 "다른 그룹에서 만들 수 있어요" 보조 카피 추가
- partial unique index `challenges_one_open_per_group` 의 race 대응 — DB 가 최종 방어선이라 POC 에서 보강 불필요

## 용어집

- **ADR-0008**: invite 자동가입 OAuth 콜백 도입 결정 — `?welcome=` 쿼리의 원래 의미 정의
- **ADR-0012**: persistent crew (owner 그룹 1개일 때 매칭) 결정 — auto-group 흐름의 근거
- **open challenge**: `Challenge.status ∈ {pending, accepted, active}`. `closed` 제외. PRD §3.3 AC-1 의 "동시 1개" 카운트 단위
- **Router Cache**: Next.js App Router 클라이언트 측 RSC payload 캐시. `revalidatePath` 가 응답에 cache invalidation 정보를 실어 무효화
- **spec C8**: 2026-05-20 group-challenge-concept spec 의 C8 항목 — "owner 가 open challenge 를 갖고 있으면 폼 진입을 막고 redirect" 의도
