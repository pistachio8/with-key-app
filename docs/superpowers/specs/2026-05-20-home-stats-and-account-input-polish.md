---
spec: 2026-05-20-home-stats-and-account-input-polish
title: Home Stats Grid 벌금 표기 · Account Input Sheet 터치 타깃
author: pistachio8
date: 2026-05-20
status: draft
---

## Summary

두 가지 시각/레이아웃 결함을 외과적으로 수정한다.

1. 홈 `StatsGrid` 의 "총 벌금" 셀이 4자리 값 이상(예: 3,000원)에서 줄바꿈되어 4-cell 레이아웃이 깨지는 문제 — "원" 단위를 sub-text 로 분리하여 한 줄 유지.
2. 그룹 상세의 `AccountInputSheet` (정산 계좌 추가/변경) 의 select · Input · Button 높이가 ~36px (h-9) 로 WCAG/HIG 권장(44pt+) 미달 — 모두 **h-11 (44px) + 14px font** 로 통일.

PR-A (challenge detail nested tabs) 와 **독립 PR** 로 처리한다. 변경 영역과 검증 방법이 다르고, PR-B 는 빠르게 머지 가능.

## Why

- iPhone 13 Pro 폭 390px → `grid-cols-4` 셀당 약 91px. `text-2xl font-extrabold tabular-nums` 로 "3,000원" 렌더 시 약 105px 점유 → wrap. dogfood 기기 1순위에서 시각 결함.
- `AccountInputSheet` 는 운영자가 정산 계좌를 처음 등록하는 결정적 입력 경로. 36px 터치 타깃은 모바일 polish 기준 미달이고, 같은 코드베이스의 `account-info-sheet.tsx` 가 이미 `h-12 w-full` 패턴을 사용하므로 일관성 부재.
- 두 이슈 모두 **routing/state 변경 없음** — 순수 시각 변경. PR-A 와 묶을 이유 없음.

## Impact Scope

### 변경 경로

- 신규: 없음.
- 수정:
  - `src/app/(app)/home/_components/stats-grid.tsx`
  - `src/app/(app)/home/_components/stats-grid.spec.tsx` (렌더 검증 보완)
  - `src/lib/challenge/penalty.ts` (`formatKRWParts` 추가)
  - `src/app/(app)/group/[id]/_components/account-input-sheet.tsx`

### src/ 영향

- `app/(app)/home/_components/stats-grid.tsx` 의 렌더 마크업.
- `lib/challenge/penalty.ts` 에 helper 1개 추가 (기존 함수 영향 없음).
- `app/(app)/group/[id]/_components/account-input-sheet.tsx` 의 input/select/button className 만.

### Supabase / RLS / migration 영향

없음.

### 외부 서비스

없음.

## Design

### C1. StatsGrid 벌금 표기

**현재:**

```tsx
<span className="text-2xl font-extrabold tabular-nums">{formatKRW(totalPenalty)}</span>
```

`formatKRW(3000)` → `"3,000원"`. 7자 + extrabold + 24px → 91px 셀에 wrap.

**제안:**

- `formatKRW` 결과를 그대로 쓰지 않고, 숫자와 "원" 을 분리해서 렌더.
- 새 helper `formatKRWParts(amount): { number: string; unit: "원" }` 를 `src/lib/challenge/penalty.ts` 에 추가.

채택: 새 helper — 다른 화면(예: `dashboard-tab.tsx`, `status-card.tsx`)에서 같은 표기가 필요해질 때 재사용 가능. `penalty.ts` 가 이미 `formatKRW` 보유라 표현 함수의 자연스러운 동거.

```tsx
// stats-grid.tsx 변경 예시
import { formatKRW, formatKRWParts } from "@/lib/challenge/penalty";

function StatCell({
  tone,
  value,
  unit,
  label,
}: {
  tone: Tone;
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-2xl font-extrabold tabular-nums ${TONE_CLASSES[tone]}`}>
        {value}
        {unit && <span className="text-muted-foreground ml-0.5 text-xs font-medium">{unit}</span>}
      </span>
      <span className="t-caption">{label}</span>
    </div>
  );
}

// 4번째 셀만 unit prop 사용:
const { number, unit } = formatKRWParts(totalPenalty);
<StatCell tone="muted" value={number} unit={unit} label="총 벌금" />;
```

**왜 prop union 이 아닌 별도 unit prop**: union(`string | { number; unit }`)을 받으면 타입 narrowing 부담. 이미 셀별 시멘틱이 다르므로 명시적 optional prop 이 단순.

**숫자만 셀 폭 검산:**

- "3,000" 5자 × text-2xl tabular-nums 약 60-70px. "원" sub-text 11px × 1자 = ~12px. 총 ~82px ≤ 91px. ✓
- "12,345" 6자 × ~14px = ~84px + "원" 12px = ~96px. **여전히 wrap 위험.**
- POC 챌린지 1회 최대 멤버 5명 × 벌금 5천원 × 7일 = 175,000원 가능. 이 경우 wrap 위험.
- **결정**: 본 PR 은 5자리(99,999) 까지 정상 동작 보장. 6자리 이상은 wrap 허용하고 dogfood 보고 별도 fix.

### C2. `formatKRWParts` helper

```ts
// src/lib/challenge/penalty.ts (추가)
export function formatKRWParts(amount: number): { number: string; unit: "원" } {
  return {
    number: amount.toLocaleString("ko-KR"),
    unit: "원",
  };
}
```

- 기존 `formatKRW` 는 그대로 유지 (다른 호출처 영향 없음).
- 새 helper 는 현재 stats-grid 외 호출처 없음. 향후 사용 시 동일 함수.

### C3. AccountInputSheet 터치 타깃

**현재:**

- select: `px-3 py-2 text-[13px]` → 약 h-9 (36px).
- Input: shadcn `h-9` 기본.
- Button: shadcn `h-9` 기본 (취소 · 저장 둘 다).

**제안:**

- select: `h-11 px-3 text-sm` (14px).
- Input: `className="h-11 text-base"` (**16px — iOS Safari focus 자동 zoom 회피**).
- Button: `size="lg" className="h-11 text-sm"` (shadcn lg 는 h-10 이라 명시적 h-11).
- 라벨 `t-caption` 은 그대로 유지 — 라벨은 보조 정보, 본문 폰트만 키움.

```tsx
<select className="border-border bg-card h-11 rounded-lg border px-3 text-sm">
  ...
</select>
<Input className="h-11 text-base" ... />          {/* iOS zoom 회피 — 16px 이상 */}
<Button variant="ghost" size="lg" className="h-11 text-sm" ...>취소</Button>
<Button size="lg" className="h-11 text-sm" ...>{...}</Button>
```

**왜 Input 만 `text-base` (16px)**:

- iOS Safari 는 input focus 시 폰트가 16px 미만이면 viewport 를 자동 zoom-in (이후 zoom-out 어색). select 와 Button 은 zoom 트리거 안 함.
- 시각 일관성 우선이면 모두 16px 통일도 가능하지만, 본 PR 은 **zoom 회피가 목적인 Input 만 16px**, 나머지는 시트 세로 점유 최소화를 위해 14px 유지.

**왜 h-12 가 아닌 h-11**:

- WCAG 2.2 Target Size (Minimum) 24×24 CSS px, AAA 권장 44×44.
- iOS HIG 44×44.
- h-11 = 44px 정확히 권장 하한. 비좁은 Dialog 내에서 4개 row 점유 부담 최소화.
- `account-info-sheet.tsx` 의 reveal 버튼(`h-12 w-full`)과 다른 이유: 그쪽은 단독 CTA, 여기는 4개 요소 + 2개 풋터 버튼. 시트 세로 점유 줄이려면 h-11 적절.

**왜 라벨/도움말 폰트는 유지**:

- 라벨(`t-caption`)은 보조 정보. 본문(input value, button label) 만 키워야 시각 위계 유지.
- "계좌번호는 서버에서 암호화되어 저장돼요" 도움말도 `text-[10px]` 그대로 — 본 PR 스코프 밖.

**가상 키보드 대응 (iPhone SE 등 작은 viewport)**:

- shadcn `<DialogContent>` 의 기본 `max-h-[calc(100vh-...)]` + `overflow-y-auto` 동작 확인. 키보드 올라온 상태에서 풋터 버튼이 스크롤로 접근 가능해야 함.
- default 가 부족하면 `<DialogContent className="max-h-[85svh] overflow-y-auto">` 명시. svh 단위는 dynamic viewport height (iOS Safari 의 키보드 영향 반영).

### C4. 라벨 표기 일관성

`account-info-sheet.tsx` (계좌 보기) 와 `account-input-sheet.tsx` (계좌 입력) 는 동일 컨벤션을 따라야 사용자가 일관성을 느낌. 본 PR 은 입력 sheet 만 손대지만, 시각적으로 두 sheet 가 어색하지 않도록:

- input sheet 의 CTA Button(`size="lg" h-11`) 은 view sheet 의 reveal Button(`size="lg" h-12 w-full`) 과 동일한 톤. h-1px 차이는 무시.
- 향후 view sheet 도 h-11 로 통일하려면 별도 작업.
- **후속 PR**: 본 spec 의 SoT(시트 내부 h-11 / 페이지 CTA h-12)를 앱 전체로 확장 — [`../plans/2026-05-21-ui-input-button-h11-sot.md`](../plans/2026-05-21-ui-input-button-h11-sot.md). Input default 자체 변경 + Textarea/Select 신규 컴포넌트 + 시트 6개 Button 일괄 통일.

## Alternatives Considered

### 1. 숫자 축약 표기 (예: 3K, 12만)

- **Pros**: 자릿수 무관하게 한 줄 유지.
- **Cons**: 정확도 손실. 누적 벌금은 사용자가 정확히 보고 싶어함. POC 검증 단계에 정보 손실 부담.
- **Why not**: 정확도 우선.

### 2. 폰트 사이즈 일괄 축소 (text-2xl → text-xl)

- **Pros**: 1줄 패치.
- **Cons**: 다른 셀 값(예: "12" 진행중) 시각 위계 약화. 모킹업 §2-B 와 다름.
- **Why not**: 시각 위계 손실.

### 3. Grid 2×2 레이아웃

- **Pros**: 셀 폭 두 배. wrap 우려 없음.
- **Cons**: 모킹업 SoT 위반 (§2-B `stats4` 4-col). PO 합의 필요.
- **Why not**: SoT 변경은 별도 의사결정.

### 4. AccountInputSheet 만 h-12 + 15px

- **Pros**: 더 넉넉한 터치 타깃.
- **Cons**: Dialog 세로 점유 증가 (4 row × +4px = 16px + footer +4px = 20px). 작은 viewport(예: iPhone SE 568px) 에서 풋터 잘림 위험.
- **Why not**: WCAG 권장 정확히 만족하는 h-11 이 risk-reward 균형.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test src/app/\(app\)/home/_components/stats-grid.spec.tsx
pnpm dev
```

수동 검증 (iPhone 13 Pro emulation, 390×844):

```bash
# 1. 홈 → totalPenalty=3000 데이터 시드 → StatsGrid 4번째 셀 1줄 유지 확인
# 2. 홈 → totalPenalty=99999 → 여전히 1줄 유지 확인
# 3. 홈 → totalPenalty=125000 → 한국 형식 "125,000원" wrap 발생 가능, 디자인 의도대로 허용 (Out of scope 항목)
# 4. 그룹 상세 → 정산 계좌 추가/변경 → select 탭/Input 입력/저장·취소 버튼 모두 ≥44px tap area
# 5. 동일 화면 → 가상키보드 올라온 상태 → 풋터 버튼 가려지지 않는지 확인
```

### 시나리오

**정상 케이스:**

- `totalPenalty=0` → "0원" 1줄.
- `totalPenalty=3,000` → "3,000원" 1줄, "원" 작은 글씨.
- `totalPenalty=99,999` → "99,999원" 1줄.
- 계좌 추가 시트 진입 → 4개 input, 풋터 2개 버튼 모두 h-11 + 14px → tap miss 줄어듦.

**엣지 케이스:**

- `totalPenalty` 음수(있을 수 없는 값) → `toLocaleString("ko-KR")` 이 "-3,000" → 마이너스 + 원. 본 PR 동작은 그대로(validation 은 read path 책임).
- 계좌 sheet에서 select 미선택 → 검증 메시지 (기존 동작 유지).

## Rollout

1. PR-B 머지 → staging 즉시 검증 (시각 변경만).
2. dogfood 1일.
3. 회귀 없으면 main 머지.

### 롤백

- 단일 PR. revert 1회.

## Out of scope

- 벌금 6자리 이상(10만 원+) 표기 — dogfood 데이터에서 빈도 확인 후 별도 spec (축약 표기 vs 폰트 축소).
- `account-info-sheet.tsx` (계좌 보기) 의 디자인 통일 — 본 PR 은 입력만 손댐.
- StatsGrid 4-cell 레이아웃 자체 변경 (2×2) — 모킹업 SoT 변경 필요.
- 라벨 / 도움말 폰트 크기 조정.

## 용어집

- **AAA / AA**: WCAG 2.2 적합성 등급. 본 PR 은 AA 권장 사항을 충족.
- **CTA**: Call to Action. 사용자에게 다음 동작을 유도하는 버튼.
- **dogfood**: 팀 내부 사용으로 실사용 검증하는 단계.
- **HIG**: Apple Human Interface Guidelines. iOS 디자인 가이드.
- **SoT**: Single Source of Truth. 모킹업은 시각/IA/플로우의 SoT.
- **tabular-nums**: 숫자가 같은 폭으로 정렬되는 OpenType feature.
- **WCAG**: Web Content Accessibility Guidelines. W3C 의 접근성 표준.
