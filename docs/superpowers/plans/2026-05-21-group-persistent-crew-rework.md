---
plan: 2026-05-21-group-persistent-crew-rework
title: Group Persistent Crew Rework
author: pistachio8
date: 2026-05-21
status: draft
---

## 목표

같은 친구 구성으로 챌린지를 반복할 때 매번 "`{displayName}님과 친구들`" 그룹이 새로 생성되어 그룹·계좌·통산 적립금이 분리되는 문제를 해결한다. 그룹을 **persistent crew(지속 친구 구성)** 로 재정의하고, 두 번째 챌린지부터는 기존 그룹에 자동 attach되도록 매칭 규칙을 도입한다. 의도적으로 다른 멤버 구성을 만들고 싶을 때는 명시 진입점·rename·안전 삭제를 제공한다.

관련 ADR: [ADR-0003](../../adr/0003-2026-05-14-group-ux-implicit-auto-creation.md) (extend), [ADR-0011](../../adr/0011-group-challenge-ownership-model.md) (그대로 적용).

관련 plan (의존성):

- [2026-05-21-ui-input-button-h11-sot](./2026-05-21-ui-input-button-h11-sot.md) — PR #67. 본 plan이 새로 추가하는 모든 Input/Select/Dialog는 이 SoT를 따른다. 신규 `<Select>` 컴포넌트(`src/components/ui/select.tsx`, base-ui wrapper) · `<Textarea>` · `Input h-11 default` · `DialogContent max-h-[85svh] overflow-y-auto` · 시트/다이얼로그 내부 CTA `h-11` · 페이지 단독 sticky CTA `h-12` 룰이 정의됨. PR #67은 docs only이고 **실 코드 구현은 후속 PR (아직 미작성)** — 본 plan의 작업 순서에 영향 (§작업 순서·의존성 참조).

## 영향 범위

- 변경 경로:
  - `src/app/(app)/challenge/new/_actions.ts` · `_components/**` (그룹 매칭 + 셀렉터)
  - `src/app/(app)/group/[id]/page.tsx` · `_components/**` (CTA · rename · 삭제)
  - `src/app/(app)/group/new/_actions.ts` (`#N` 순번 default 이름 로직)
  - `src/components/app-shell/group-switcher-trigger.tsx` · `group-switcher-sheet.tsx` (노출 조건 ≥1, dialog 통합)
  - `src/lib/db/reads/` (`fetchOwnerGroupsForChallengeForm`, 그룹별 멤버/챌린지 카운트 read 신규)
  - `src/lib/validators/group.ts` (rename input schema)
- 데이터/RLS 영향:
  - **스키마 변경 없음** (컬럼 추가/제거 없음)
  - RLS: `groups` UPDATE/DELETE 정책이 owner-only인지 확인 후 부족하면 보강 migration (`000X_groups_owner_mutations.sql`)
- 외부 서비스: 없음
- 재사용 후보: `createGroup` Server Action (`/group/new/_actions.ts`), `groupInputSchema` (zod), `Dialog` primitive, `<Select>` primitive

## 결정 요약 (Q1~Q10)

| ID   | 결정                                     | 선택                                                                                                                                             |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1   | 그룹 모델                                | **A. Persistent crew** — 그룹 = 친구 구성, 1:N 챌린지 (ADR-0011 정합)                                                                            |
| Q2   | open 챌린지 없을 때 매칭 규칙            | **D. owner 그룹 수 분기**: 0개 → auto-group · 1개 → 자동 attach + "○○ 그룹에서 시작" 라벨 · ≥2개 → 셀렉터 필수                                   |
| Q3a  | 첫 챌린지 auto-group default 이름        | **A1. 현행 `{displayName}님과 친구들`** (마찰 0 우선)                                                                                            |
| Q3b  | 명시 "새 그룹 만들기" 폼의 이름          | **B2. optional, 비우면 `default + #N` 순번** (현재 시점 owner 보유 default 패턴 그룹 수 + 1)                                                     |
| Q3c  | rename UI                                | **C1. 그룹 상세 헤더 연필 아이콘만** (사용자 발견, 자동 prompt 없음)                                                                             |
| Q4   | 그룹 상세 새 챌린지 CTA                  | **B. 추가** + open 챌린지 있으면 disable + 안내 카피                                                                                             |
| Q5   | 두 번째 그룹 만들기 진입점               | **B. 헤더 switcher 노출 ≥1로 완화 + dialog 기반 생성** (`/group/new` 페이지 복원 안 함)                                                          |
| Q6   | 홈→`/challenge/new` 진입 시 default 그룹 | **A. 가장 최근 챌린지(MAX `created_at`) 있었던 그룹**                                                                                            |
| Q7   | 기존 중복 그룹 마이그레이션              | **A. 없음** (POC 수동 정리)                                                                                                                      |
| Q8   | 그룹 삭제                                | **B. 안전 케이스만** — owner + 멤버 1명 + **챌린지 0건 (status 무관, closed 포함)**                                                              |
| Q9   | 작업 분할                                | **B. 3 PR** (PR-A → PR-B/PR-C 병렬)                                                                                                              |
| Q10a | ADR 처리                                 | **a-1. 새 ADR-0012 작성 + ADR-0003에 `extended by ADR-0012` 표기**                                                                               |
| Q10b | ≥2 셀렉터 UI                             | **b-1. dropdown** — 구현체는 PR #67이 도입할 **base-ui Select wrapper** (`src/components/ui/select.tsx`). shadcn 슬롯 패턴 + Input과 동일 `h-11` |

## 작업 순서·의존성

본 plan과 PR #67(UI h-11 SoT) 사이 의존성을 정리한다. **본 plan은 새 Input·Select·Dialog 컴포넌트를 4곳에서 사용**(셀렉터 · new-group-dialog · rename · delete-confirm dialog).

상태 (2026-05-21 기준):

- PR #67: 머지 대기 중인 **docs only** plan. SoT 표·base-ui Select 슬롯 설계 확정.
- PR #67의 **실 코드 구현 PR (`src/components/ui/select.tsx`·`textarea.tsx` 신설 + Input default 변경 + 시트 6개 파일 정리)** 은 아직 미작성.

본 plan의 작업 가능 시점 선택지:

| 순서 옵션                                                                             | 의미                                                                                                                    | 평가                                                                                                 |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **α. PR #67 코드 구현 PR 머지 후 본 plan 시작** (권장)                                | base-ui `<Select>`·`<Textarea>`·새 Input default·DialogContent 안전망이 이미 들어와 있어 본 plan은 import만             | 가장 깔끔, SoT 중복 구현 0, 시각 회귀 위험 ↓                                                         |
| **β. 병행: PR-A는 임시 native `<select>` 사용, PR-B/C는 PR #67 코드 PR 머지 후 시작** | PR-A 의 셀렉터만 임시. native `<select>`는 OS dropdown이지만 모바일 우선이라 iOS bottom sheet picker로 충분히 사용 가능 | PR-A 가 빠르게 머지 가능, 후속 PR #67 후속 PR 머지 시 native → base-ui 교체 cleanup PR 1개 추가 필요 |
| **γ. 본 plan PR-A 에서 `select.tsx` wrapper 자체를 인라인 도입**                      | PR #67이 docs로만 SoT를 정해 두었으므로 본 plan PR-A가 base-ui Select wrapper 첫 구현자가 됨                            | SoT 소유권이 모호 — PR #67의 후속 코드 PR와 충돌 위험 ↑. **비권장**                                  |

**기본 권장: α (순차)**. PR #67 코드 구현 PR이 만들어지지 않은 상태라 일정 압박이 있으면 β로 갱신.

> 머지 순서:
>
> 1. PR #67 (docs) → PR #67 후속 코드 구현 PR → 본 plan PR-A → PR-B + PR-C 병렬.

## 작업 단계 (PR 단위)

### PR-A: persistent crew core (베이스 — 먼저 머지)

사용자 가치: **의도하지 않은 N개 그룹 생성이 멈춤**. 핵심 페인 해결.

1. **ADR-0012 작성** — `pnpm new adr group-persistent-crew-model` — Context: ADR-0003은 owner-1그룹 가정 / Decision: 1:N 모델로 확장, 매칭 규칙 도입 / Alternatives: 1:1 강제, 셀렉터 항상 노출 — 검증: ADR 파일 존재, ADR-0003에 cross-link.
2. **ADR-0003 헤더 갱신** — `Status: accepted, extended by ADR-0012` 한 줄 추가 — 검증: 마크다운 diff.
3. **신규 read 추가** — `src/lib/db/reads/owner-groups-for-challenge-form.ts`: owner인 그룹 목록 + 각 그룹의 최근 챌린지 `created_at`, 정렬 desc — 검증: 단위 테스트 (그룹 0/1/N 케이스).
4. **`createChallenge` Server Action 매칭 분기** — `src/app/(app)/challenge/new/_actions.ts`: `maybeGroupId` 없을 때 분기:
   - owner 그룹 0개 → 현행 auto-group 유지 (ADR-0003 그대로)
   - owner 그룹 1개 → 그 그룹에 자동 attach (auto-group 생성 안 함)
   - owner 그룹 ≥2개 → 폼에서 `groupId` 필수 입력 강제 (서버에서도 검증 → `validation_failed`)
     — 검증: `_actions.spec.ts` 케이스 3개 추가.
5. **챌린지 생성 폼 그룹 선택 UI** — `_components/`에 dropdown 추가. **구현체는 PR #67이 도입할 `src/components/ui/select.tsx`(base-ui wrapper)** — Select/SelectTrigger/SelectValue/SelectContent/SelectItem 슬롯 패턴, Input과 동일 `h-11` + `text-base md:text-sm`. PR #67의 코드 구현 PR 머지 전이면 **임시로 native `<select>` 또는 PR-A 자체에서 최소 wrapper를 인라인 도입**(§작업 순서·의존성 참조):
   - owner 그룹 0개 → UI 숨김 (현 동작 유지)
   - owner 그룹 1개 → "○○ 그룹에서 시작" 라벨 한 줄, dropdown 숨김
   - owner 그룹 ≥2개 → dropdown 노출, default = Q6-A 가장 최근 챌린지 그룹
     — `?groupId=xxx` query 있으면 그것을 우선 — 검증: 컴포넌트 테스트 + 모바일 viewport 수동.
6. **PR-A spec 작성** — `pnpm new spec persistent-crew-matching` — 매칭 규칙·셀렉터 default·서버 검증 — 검증: spec-required 경로 변경(`validators/challenge.ts` 미변경, `challenge/new/_actions.ts` RPC 호출 패턴 변경)에 대해 PR 본문에서 spec 링크.

검증: `pnpm typecheck && pnpm lint && pnpm test` + 모바일 수동 (그룹 0/1/N 케이스 3가지).

### PR-B: 그룹 진입점·이름 관리 (PR-A 머지 후)

사용자 가치: **두 번째 그룹 만들기 + 이름 정리** 가능.

1. **그룹 상세 "이 그룹에서 새 챌린지" CTA** — `src/app/(app)/group/[id]/_components/group-header.tsx` (또는 별도 카드): 버튼 → `/challenge/new?groupId={id}`. open 챌린지(그룹 단위 read) 있으면 disable + "현재 진행 중인 챌린지가 있어요" 안내 — 검증: 컴포넌트 테스트 + 수동.
2. **헤더 switcher 노출 조건 완화** — `src/app/(app)/layout.tsx`의 switcher 사용처에서 노출 조건 `groups.length >= 2` → `>= 1` — 검증: 1개·≥2개 케이스 수동.
3. **switcher dialog "+ 새 그룹 만들기"** — `group-switcher-sheet.tsx`의 `<Link href="/group/new">`를 dialog trigger로 교체. 신규 컴포넌트 `new-group-dialog.tsx`: 그룹명 `Input` (placeholder = 다음 `#N` default 미리 보기, **`h-11` SoT 자동 적용** — PR #67 후속 PR 머지 시) + "만들기" Button (**시트 내부 CTA = `h-11`, SoT 적용**) → `createGroup` Server Action → `/group/[id]?welcome=...`. DialogContent는 PR #67 SoT의 `max-h-[85svh] overflow-y-auto` 안전망 적용 — 검증: 컴포넌트 테스트 + 수동.
4. **`createGroup` Server Action `#N` 순번 로직** — `src/app/(app)/group/new/_actions.ts`: name 미지정 시 `{displayName}님과 친구들` 기본, owner의 같은 base 이름 그룹 수 ≥1이면 `#N` suffix 부여 (N = 현재 보유 수 + 1) — 검증: `_actions.spec.ts` 케이스 추가 (0/1/2개 보유).
5. **그룹 rename Server Action + UI** — `src/app/(app)/group/[id]/_actions.ts`에 `renameGroup(groupId, name)` 추가 (owner-only, zod 검증, 길이 정책은 R3 참조) + 그룹 상세 헤더에 연필 아이콘 → dialog 또는 inline edit. **dialog 선택 시 PR #67 SoT 적용**: Input `h-11`, 시트 내부 CTA Button `h-11`, DialogContent `max-h-[85svh] overflow-y-auto`. inline 선택 시 페이지 단독 sticky CTA 아님 — 헤더 안 toolbar 보조 액션이므로 `h-11` 적용 — 검증: 단위 테스트 + 수동.
6. **`/group/new` 페이지 처리** — 이미 `/challenge/new`로 redirect만 함. 그대로 유지 (외부 링크 보존).
7. **PR-B spec 작성** — `pnpm new spec group-management-ui` — 진입점·dialog·rename·`#N` 룰.

검증: `pnpm typecheck && pnpm lint && pnpm test` + 모바일 수동 (rename · 두 번째 그룹 만들기 · welcome banner).

### PR-C: 안전 삭제 (PR-A 머지 후 PR-B와 병렬 가능)

사용자 가치: **잘못 만든 빈 그룹 정리**.

1. **RLS 점검** — `groups` DELETE 정책이 owner-only인지 확인. 부족하면 `supabase/migrations/000X_groups_owner_delete.sql` (down 없음, 번호 맨 뒤). 멤버/챌린지 카운트 조건은 application-level이므로 RLS에 넣지 않음 — 검증: `pnpm supabase db reset` + 역할별 접근 실측.
2. **`deleteGroup` Server Action** — `src/app/(app)/group/[id]/_actions.ts`: owner 검증 → 멤버 수 = 1 검증 → 챌린지 수 = 0 (status 무관) 검증 → DELETE → `/home`으로 redirect. 실패 시 `validation_failed` + 이유 카피 — 검증: `_actions.spec.ts` 케이스 (owner 아님 / 멤버 ≥2 / 챌린지 ≥1 / 안전 케이스).
3. **그룹 상세 헤더 삭제 버튼** — 휴지통 아이콘 + 확인 dialog 1단계 (**PR #67 SoT 적용**: DialogContent `max-h-[85svh]`, 시트 내부 CTA `h-11`, 취소 보조 액션은 `h-11 + variant="ghost"`). 조건 미충족 시 disable + tooltip:
   - 멤버 ≥2명: "친구와 함께한 그룹은 삭제할 수 없어요"
   - 챌린지 ≥1건 (status 무관): "한 번이라도 챌린지를 시작한 그룹은 삭제할 수 없어요"
     — 검증: 컴포넌트 테스트 (3가지 disable 사유) + 수동.
4. **결정 inline 기록** — 별도 spec/ADR 없이 PR-C 본문에 결정 근거 inline (작은 범위, 분리 비용 > 가치).

검증: `pnpm typecheck && pnpm lint && pnpm test` + 모바일 수동 (삭제 성공/disable 3케이스).

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
```

PR-C에서 RLS 변경이 있을 경우:

```bash
pnpm supabase db reset
```

수동 확인 항목:

- [ ] 모바일 viewport: 그룹 0/1/N 케이스 챌린지 생성 플로우
- [ ] 그룹 상세 "새 챌린지" CTA: open 챌린지 있을 때 disable
- [ ] 헤더 switcher: 그룹 1개일 때도 노출, "+ 새 그룹 만들기" dialog 동작
- [ ] rename: 그룹 상세 연필 아이콘, owner 외 사용자에겐 비노출
- [ ] 삭제 disable 카피 3종 (멤버/챌린지/owner 아님)
- [ ] 기존 invite 링크(`/invite/[token]`) 회귀 없음 — invite는 그룹 단위로 attach되므로 모델 변경 영향 없음 확인

## 리스크 / 미해결

- **R1. ADR-0011 `challenges_one_open_per_group` 제약 vs 매칭 룰**: owner 그룹 1개에 자동 attach 시 그 그룹에 이미 open 챌린지가 있으면 `/challenge/new` layout 가드(`fetchOwnerOpenChallenge`)가 먼저 redirect하므로 폼에 도달하지 않음. 매칭 분기 자체엔 영향 없음 — 작업 단계 PR-A.4 구현 시 가드 동작 재확인 필요.
- **R2. 기존 owner 다중 그룹 사용자(주로 본인) 인지 부담**: Q7-A로 마이그레이션을 안 하므로 헤더 switcher가 노출되는 순간 N개 그룹이 한꺼번에 보임. 본인 dogfood 한정이라 수용 가능. 외부 사용자 늘면 V2에서 archive 패턴 검토 (Q8-C 옵션).
- **R3. 그룹명 길이 정책 + `#N` suffix**: 현행 `createGroupInputSchema`는 `.max(30)`. rename 시 사용자가 30자 입력 + 시스템이 ` #999` (최대 5자) 자동 부여 시 오버플로 가능. 정책 선택지 (구현 시 결정):
  - (a) 사용자 입력은 그대로 max 30. `#N`은 시스템 자동 부여이므로 DB 컬럼 길이는 36자까지 허용. → DB 스키마 변경 필요할 수 있음 (groups.name VARCHAR(30)인 경우 확인).
  - (b) 사용자 입력 max 25, suffix 여유 5자.
  - (c) `#N`은 default 이름 패턴에만 부여하므로 사용자 입력 이름은 절대 suffix가 안 붙음 → max 30 그대로, base 이름은 hardcoded "`{displayName}님과 친구들`"이라 displayName 제한이 별도 필요. — **default 권장**.
- **R4. PR-A·PR-B 사이 중간 상태**: PR-A 머지 후 PR-B 머지 전 기간에 owner 그룹 ≥2인 사용자가 챌린지 생성 시 셀렉터로 그룹 선택 가능하지만, 두 번째 그룹을 만들 수단(헤더 dialog)이 없음. 본인 dogfood라 수용. 외부 노출 전이면 PR-A·B를 함께 머지 권장.
- **R5. analytics 이벤트 `group_created`**: 현재 `createChallenge` auto-group 분기에서 호출됨. Q2-D 채택 후 owner ≥1 케이스에선 호출되지 않음 — 호출 빈도가 감소하는 게 정상 (의도된 변화). PRD §9.1 이벤트 표 변경은 없음 (이벤트 자체는 유지).
- **R6. PR #67 (UI h-11 SoT) 의존성**: 본 plan은 새 Input·`<Select>`·Dialog 컴포넌트를 4곳에서 사용. PR #67이 docs only로 SoT만 정해 두고 실 코드 구현 PR은 아직 미작성 상태. §작업 순서·의존성 표에 따라 α(순차) / β(병행) / γ(인라인 도입) 중 선택. 기본 권장은 α. 결정 변경 시 본 plan PR-A.5·PR-B.3·PR-B.5·PR-C.3 단계의 "SoT 적용" 문구를 갱신해야 함.
- **R7. base-ui Dialog 안 nested Select focus trap**: PR #67 설계 문서가 "Dialog 안에서 Select가 nested overlay로 뜰 때 base-ui가 focus trap을 정상 처리하는지" 검증 항목으로 명시. 본 plan의 new-group-dialog와 rename dialog 안에서 Select는 안 쓰지만, 향후 dialog 안에 `<Select>`(예: 그룹 카테고리 선택)가 들어가면 이 검증 항목이 활성화 — 현 plan 범위에선 영향 없음 (mention only).
