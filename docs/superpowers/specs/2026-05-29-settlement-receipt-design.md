---
spec: 2026-05-29-settlement-receipt-design
title: 정산 영수증 (Settlement Receipt) — recap 페이지 톤 통일
author: pistachio8
date: 2026-05-29
status: draft
---

## Summary

챌린지 종료 후 진입하는 정산 페이지(`/challenge/[id]/recap`)의 정산 핵심 섹션 4개
(`MyPenaltyCard` · `InvitationHeader` · `MemberRoster` · `SettlementAccount`)를
**하나의 "정산 영수증(Settlement Receipt)" 카드**로 통합한다.

디자인 톤의 원본은 recap-share 공유 카드 시스템(`src/app/api/og/recap-card/templates.tsx`, PR #142)이다.
그 팔레트(CREAM · INK · TERRA · SUB · SUBTEXT · DASHLINE)와 에디토리얼 모티프(레터스페이싱 라벨 · 점선 절취선 · `from·with` 도장)를
**화면 위로 가져와**, 지금까지 다운로드용 공유 카드에만 적용돼 있던 톤을 사용자가 보는 정산 화면과 일치시킨다.

메타포는 **영수증**이다 — "정산"이라는 행위와 직결되고, 모노스페이스 항목 행 + 점선 절취선 + 하단 도장으로
"찍어낸 명세서" 느낌을 준다. 위트는 절제된 이모지 한두 개와 footer 한 줄로만 표현한다(공유 카드의 차분한 에디토리얼 톤을 깨지 않기 위해).

> 본 spec은 [`2026-05-21-recap-invitation-design.md`](2026-05-21-recap-invitation-design.md)(청첩장 톤 4섹션 분리 구성)의
> **해당 4섹션 비주얼·구조를 대체**한다. PhotoGallery·ShareCardAction·빈 상태·배너는 그 spec의 결정을 유지한다.

## Why

- 현재 정산 페이지는 **두 디자인 언어가 혼재**한다: 중립 톤 `MyPenaltyCard`(`bg-card`) + 브라운 accent(`#b07a4d`)의 memoir 섹션 3종.
  PR #142가 도입한 공유 카드의 TERRA(`#C2683D`) 에디토리얼 톤과 **불일치**한다.
- **다운로드 공유 카드만 새 톤**이고 화면 정산 뷰는 따라오지 않았다. 사용자가 매일 보는 화면이 공유물보다 덜 정돈돼 보인다.
- 4섹션이 시각적으로 분절돼 "정산 결과"가 한눈에 안 들어온다. 단일 영수증으로 묶으면 **명료성·기억 가치**가 오른다.
- 영수증 메타포는 별도 학습 없이 "정산 명세"로 읽힌다(친숙한 실물 은유).

## Impact Scope

### 변경 경로

- **신규**:
  - `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx` — 통합 영수증 (RSC, presentational)
  - `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.spec.tsx` — 단위 테스트
  - `public/logo-from-with-warm.svg` — 영수증 톤으로 recolor한 로고 (원본 `logo-from-with.svg`는 불변)
- **수정**:
  - `src/app/(app)/challenge/[id]/recap/page.tsx` — 4개 import·렌더 → `SettlementReceipt` 하나로 교체, `PhotoGallery`를 `!isSolo` 블록 **밖으로** 이동(솔로에서도 표시)
  - `src/app/globals.css` — 색 토큰 4개(§색 토큰 표) + 영수증 모노 폰트 토큰 `--font-receipt`(§R1) 추가
- **삭제** (recap 페이지 전용이라 통합 후 고아 — 본 변경이 만든 정리):
  - `my-penalty-card.tsx` (+ `.spec.tsx`)
  - `invitation-header.tsx` (+ `.spec.tsx`)
  - `member-roster.tsx` (+ `.spec.tsx`)
  - `settlement-account.tsx` (+ `.spec.tsx`)

### src/ 영향

`src/app/(app)/challenge/[id]/recap/**` + `src/app/globals.css`(색 토큰 추가). `src/components/ui/stamp.tsx`는 **수정 없이 재사용**(아래 §Design 도장 항목 참조).

### Supabase / RLS / migration 영향

**없음.** `fetchRecap`이 이미 반환하는 필드만 사용한다. 신규 쿼리·컬럼·RLS 변경 없음.

### 외부 서비스

**없음.**

## Design

### 데이터 (모두 `RecapView`에 이미 존재 — `src/lib/db/reads/recap.ts`)

| 화면 요소      | 출처 필드                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| 헤더 그룹명    | `group.name` (그룹만)                                                                                          |
| 헤더 제목·기간 | `title` · `durationDays` · `startAt` · `endAt`                                                                 |
| 목표 인증      | `goalCount`                                                                                                    |
| 나의 인증      | `viewerDoneCount`                                                                                              |
| 판정           | `viewerAchieved`                                                                                               |
| 나의 정산 금액 | `viewerPerHeadPenalty` → `formatKRW()` (`src/lib/challenge/penalty.ts`)                                        |
| CREW           | `members[].displayName` · `members[].isMvp`                                                                    |
| ACCOUNT        | `group.bankCode` · `group.accountHolder` · `group.accountNumberLast4` → `BANK_NAMES` (`src/lib/bank/codes.ts`) |

정산 모델(`src/lib/challenge/settlement.ts`): 벌금은 **정액 per-head**. `viewerDoneCount >= goalCount`면 0원, 아니면 `penaltyAmount` 전액.
**미달일수 × 단가 같은 분할 계산은 존재하지 않으므로** 영수증에 그런 항목을 만들지 않는다(사실과 다른 표기 금지).

### C1. `SettlementReceipt` (신규, RSC presentational)

props (모두 `recap/page.tsx`에서 주입):

```ts
// src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx
type SettlementReceiptProps = {
  groupName: string | null; // 솔로면 null → 헤더 subtitle "· {group}" 생략
  title: string;
  durationDays: number;
  startAt: string | null; // null 이면 헤더 기간 줄 생략 (RecapView 는 nullable)
  endAt: string | null;
  goalCount: number;
  viewerDoneCount: number;
  viewerAchieved: boolean;
  viewerPerHeadPenalty: number;
  isSolo: boolean; // members.length === 1
  members: ReadonlyArray<{ id: string; displayName: string; isMvp: boolean }>;
  // 계좌 — 셋 다 채워졌을 때만 ACCOUNT 줄 렌더(현 SettlementAccount 의 null 가드와 동일).
  // 객체 대신 nullable 필드로 받아 page 측 TS narrowing 부담 제거.
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
};
```

레이아웃 (위 → 아래), CREAM 배경 · 상하 점선 절취선:

1. **헤더** — recolor된 로고(`/logo-from-with-warm.svg`) + subtitle `🧾 정산 영수증[· {groupName}]` + `{title} · {durationDays}일 · {기간}`
2. 절취선 (DASHLINE)
3. **항목 행** (모노스페이스, 라벨 SUB / 값 INK): `목표 인증 {goalCount}회` · `나의 인증 {viewerDoneCount}회` · `판정 {달성 🎉 | 미달 😅}`
4. 절취선
5. **나의 정산** — 라벨 SUBTEXT + 금액. 미달=TERRA `{formatKRW}` · 달성=INK `0원`(이모지 없음)
6. **[그룹 전용]** 절취선 → `CREW` 라벨 + `👑 {MVP이름}` (왕관 이모지는 이름 **왼쪽**) · 나머지 이름 → `ACCOUNT` 라벨 + `{bankLabel} ***-****{last4} · {holder}`
7. 절취선
8. **footer 한 줄** — 미달 `오늘도 인증, 수고했어요 😜` · 달성 `끝까지 해냈어요 👏`
9. **`from·with` 도장** — `Stamp variant="wordmark"`, INK 톤다운 색, `animate-stamp-in`(컴포넌트 내장) 1회 재생

### 분기 규칙

- **그룹**(`members.length > 1`): 전체(헤더+항목+정산+CREW+ACCOUNT+footer+도장)
- **솔로**(`members.length === 1`): CREW·ACCOUNT **생략**(현 `!isSolo` 가드와 동일 동작). 헤더 subtitle 그룹명 생략
- **계좌 미설정**(`bankCode`/`accountHolder`/`accountNumberLast4` 중 하나라도 null): ACCOUNT 줄만 생략(현 `SettlementAccount`의 null 가드와 동일)

### 색 토큰

영수증·공유 카드 공통 팔레트를 **`globals.css`의 `--invite-*` 패밀리에 확장 추가**해 SoT로 둔다(현재 `templates.tsx`는 hex 하드코딩 — 화면/공유가 한 곳을 보게 정리). **왜**: TERRA(`#C2683D`)·SUBTEXT(`#8E8579`)·DASHLINE(`#C9C0B0`)가 현재 토큰에 없어 컴포넌트마다 hex가 흩어지면 톤 드리프트가 생긴다.

| 의미              | hex                 | 토큰(신규)            |
| ----------------- | ------------------- | --------------------- |
| CREAM 배경        | `#FAF6EF`/`#FBF7EF` | 기존 `--invite-bg`    |
| INK 본문          | `#2A221C`           | 기존 `--invite-ink`   |
| SUB 보조          | `#5E4838`           | 기존 `--invite-muted` |
| TERRA accent      | `#C2683D`           | `--invite-terra`      |
| SUBTEXT 라벨      | `#8E8579`           | `--invite-subtext`    |
| DASHLINE 구분     | `#C9C0B0`           | `--invite-dashline`   |
| 도장(톤다운 잉크) | `#4A3F37`           | `--invite-stamp`      |

### 로고 recolor

원본 `logo-from-with.svg`(from 파랑 `#4e78df` / dot `#6a5018` / with 노랑 `#f9b514`)를 영수증 톤으로 바꾼
**별도 파일** `public/logo-from-with-warm.svg`를 추가: from=`#5E4838` · dot=`#C2683D`(TERRA) · with=`#2A221C`(INK).
**왜 별도 파일**: app-header 등 전역에서 쓰는 원본 브랜드 색은 그대로 둬야 하므로 영수증 한정 변형만 분리한다.

### 도장 INK 톤

기존 `Stamp`의 `tone`(primary/success/danger/onPrimary)에 잉크 톤이 없다. `Stamp`는 `border-current`/`text-current` 기반이므로
**`className`으로 색만 오버라이드**한다 (`className="text-[var(--invite-stamp)] border-[var(--invite-stamp)] size-14"`).
**왜 컴포넌트 수정 대신 className**: 단일 사용처를 위해 공유 primitive에 tone을 추가하는 것은 과하다. `animate-stamp-in`은 컴포넌트에 내장돼 그대로 적용된다.

### `recap/page.tsx` 변경 요지

```tsx
// 4개 섹션 → 1개로
<SettlementReceipt
  groupName={isSolo ? null : groupName}
  title={recap.title}
  durationDays={recap.durationDays}
  startAt={recap.startAt}
  endAt={recap.endAt}
  goalCount={recap.goalCount}
  viewerDoneCount={recap.viewerDoneCount}
  viewerAchieved={recap.viewerAchieved}
  viewerPerHeadPenalty={recap.viewerPerHeadPenalty}
  isSolo={isSolo}
  members={recap.members.map((m) => ({ id: m.id, displayName: m.displayName, isMvp: m.isMvp }))}
  bankCode={recap.group?.bankCode ?? null}
  accountHolder={recap.group?.accountHolder ?? null}
  accountNumberLast4={recap.group?.accountNumberLast4 ?? null}
/>
<PhotoGallery photos={photos} />   {/* !isSolo 밖으로 — 솔로에서도 표시 */}
<ShareCardAction challengeId={challengeId} shareMessage={shareMessage} />
```

`AccountInlinePrompt` · 조기종료 배너 · 빈 정산 상태 · `ShareCardAction`(영상/사진형/티켓형 탭)은 **그대로**.

## Alternatives Considered

- **4섹션을 각각 영수증 톤으로 restyle(통합 안 함)**: 단일 영수증 메타포가 사라지고 카드 4개가 쌓여 "한 장의 명세서" 느낌을 못 준다. 기각.
- **화면 위 티켓(boarding-pass) 재현**: 다운로드 티켓 카드와 시각적으로 중복되고 구조 변경 폭이 가장 크다. 기각.
- **다른 톤(다크 네온 / Y2K / Swiss 미니멀)**: 친근·위트는 강하나 "공유 카드와 같은 톤"이라는 목표에서 가장 멀어진다. 기각.
- **로고 mono ink(전체 단색)**: 절제미는 좋으나 브랜드 식별성이 약함. tri-tone(로고 A) 채택.

## 기술 검토 / 레이아웃·구현 리스크

구현 전 실측한 항목. 목업과 실제가 어긋날 수 있는 지점과 결정을 기록한다.

### R1. 모노스페이스 폰트 — 목업 ≠ 기본값 (결정 필요/완료)

`globals.css`는 `--font-mono: var(--font-sans)`로 **monospace를 Pretendard에 alias**해 둠. 따라서 Tailwind `font-mono`를 써도 모노스페이스가 **안 나온다**.
목업의 "영수증" 모노 느낌을 내려면 명시적 stack을 강제해야 한다.

- **결정**: 영수증 루트에 한정해 모노 stack을 적용한다 — `globals.css`에 `--font-receipt: ui-monospace, SFMono-Regular, Menlo, "Liberation Mono", monospace` 토큰을 추가하고 영수증 컴포넌트에서 `style={{ fontFamily: "var(--font-receipt)" }}`(또는 arbitrary class)로 사용.
- **주의**: 이는 앱 내 **유일한 monospace 사용처**가 된다(의도적 — 영수증 메타포 한정). 한글(목표 인증·판정 등)은 모노 stack에 한글이 없어 시스템 한글 fallback으로 렌더되고, 숫자·라틴만 모노로 정렬된다. 실제 영수증과 같은 결이라 수용.
- **왜 sans 유지 안 함**: Pretendard로만 가면 영수증 character(가지런한 숫자·"찍어낸" 느낌)가 약해진다. 단, 사용자가 원하면 sans + `tabular-nums`(숫자 정렬만)로 대체 가능 — 이 경우 모노 토큰 불필요.

### R2. full-bleed(-mx-4) vs contained — 레이아웃 정합

기존 memoir 4섹션과 PhotoGallery는 모두 `-mx-4` + 크림 배경으로 **화면 가장자리까지 꽉 찬 밴드**다.

- **영수증**: `-mx-4` 없이 **page `p-4` 안의 contained 카드**로 둔다(상하 점선 절취선만, 좌우 테두리·radius 없음). **왜**: 절취선이 있는 종이 슬립은 좌우 여백이 있어야 "한 장의 영수증"으로 읽힌다.
- **PhotoGallery**: 현행 `-mx-4` full-bleed **유지**. 결과적으로 `[여백 있는 영수증] → [가장자리까지 꽉 찬 사진 그리드] → [공유 버튼]` 구성이 된다.
- **목업과의 차이**: 목업은 PhotoGallery를 contained(여백 있는 3칸)로 단순화해 그렸으나 **실제는 full-bleed**다. **결정(2026-05-29)**: PhotoGallery는 full-bleed를 **유지**한다 — 의도적 "갤러리 모먼트"이며 스코프(PhotoGallery 불변)도 지킨다. 영수증만 contained.

### R3. nullable 필드 가드 (회귀 방지)

`RecapView`의 `startAt`/`endAt`/계좌 필드는 nullable. 기존엔 `!isSolo && recap.startAt && recap.endAt` 가드 뒤에서만 memoir가 렌더됐다.
영수증은 **항상 렌더**되므로 컴포넌트가 직접 가드한다:

- `startAt`/`endAt` 중 하나라도 null → **기간 줄만 생략**(영수증 본체는 렌더).
- 계좌 3필드 중 하나라도 null → **ACCOUNT 줄만 생략**.
- 부수 효과(개선): 날짜가 null인 그룹 챌린지도 이제 CREW·ACCOUNT가 보인다(기존엔 MyPenaltyCard만 보였음). 정보량 증가 방향이라 수용.

### R4. CREW 다인원 / 복수 MVP

- 인원이 많으면(예 8~10명) `👑 민지 · 현우 · …` 인라인이 길어진다 → 컨테이너 내 **자연 줄바꿈 + 한글 `break-keep`**으로 처리(가로 overflow 금지).
- `pickMvpIds`는 **복수 MVP**를 반환할 수 있다(동점). 각 MVP 이름 왼쪽에 👑를 붙인다(목업은 1명만 표시).

### R5. 로고 SVG 폰트 의존 (무회귀) + 치수

- `logo-from-with*.svg`는 outline 아닌 `<text>` 기반이라 기기 폰트에 의존(둥근 전용 폰트 없으면 fallback). 단 **이는 현재 app-header가 이미 쓰는 동일 동작 — 회귀 아님**.
- 헤더 로고는 **명시 width/height**로 렌더해 CLS 방지(예: `width≈120 · height≈24`, app-header `h-7` 참고).

### R6. 이모지 크로스플랫폼

👑·🧾·🎉·😜·👏·😅는 OS별로 모양이 다르다(iOS/Android/데스크톱). POC 범위에서 수용. 의미 전달이 이모지에만 의존하지 않도록 텍스트 라벨을 병행(판정 "달성/미달", footer 문구).

### R7. 기타 무영향 확인

- `track("penalty_displayed", { amount: viewerPerHeadPenalty })`는 page에 그대로 — 분석 이벤트 **변경 없음**(PRD §9.1 무관).
- `Stamp`는 non-client + `animate-stamp-in` 키프레임 globals.css 존재 → RSC 내 사용·애니메이션 그대로 동작.
- 삭제 4컴포넌트는 recap/page.tsx 외 참조 없음(grep 확인). 교체 시 page의 import 정리 필요(`Card`·`formatKRW` 등 잔존 import는 유지).

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
```

### 시나리오 (`settlement-receipt.spec.tsx`)

- 그룹 챌린지: 헤더·항목·나의 정산·CREW·ACCOUNT·footer·도장 전부 렌더
- 솔로 챌린지: CREW·ACCOUNT **미렌더**, 헤더 그룹명 미표시
- 달성(viewerAchieved): 나의 정산 `0원` + 트레일링 이모지 **없음**, footer `끝까지 해냈어요 👏`
- 미달: 나의 정산 TERRA 금액(`formatKRW`), footer `오늘도 인증, 수고했어요 😜`
- 계좌 null: ACCOUNT 줄 미렌더
- MVP: 👑 이모지가 MVP **이름 왼쪽**에 위치
- 도장: `from·with` 락업 렌더(role="img")

### 수동 (모바일 viewport)

- 그룹/솔로 각각 · 달성/미달 · 계좌 있음/없음 5케이스
- `recap/page.tsx`에서 솔로 챌린지에도 PhotoGallery가 보이는지

## Rollout

- **전제**: recap-share 재설계(PR #142)는 `origin/develop`에 머지됨. 로컬 develop이 stale하므로 `git fetch` 후 **`origin/develop`에서 `feat/recap-settlement-receipt` 브랜치 분기**. PR 베이스 `develop`.
- 단일 PR. dogfood 후 카피·이모지 강도(😜/👏/😅) 재검토.

### 롤백

- 컴포넌트 교체 PR을 revert → 삭제된 4개 컴포넌트는 git history에서 복원. Supabase·migration 영향이 없어 데이터 롤백 불필요.

## 용어집

- **RSC**: React Server Component — 서버에서 렌더되어 클라이언트 번들에 포함되지 않는 컴포넌트
- **TERRA**: 공유 카드 디자인의 테라코타 accent 색(`#C2683D`)
- **INK / CREAM / SUB / SUBTEXT / DASHLINE**: 공유 카드 팔레트 — 본문 잉크색 / 크림 배경 / 보조 갈색 / 라벨 회갈색 / 점선 구분선
- **per-head 정산**: 미달자 1인당 정액 벌금(`penaltyAmount`)을 부과하는 방식. 분할·일수 비례 없음
- **memoir 섹션**: 기존 정산 페이지의 청첩장 톤 그룹 섹션(InvitationHeader/MemberRoster/SettlementAccount)
