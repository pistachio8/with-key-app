---
plan: 2026-05-21-ui-input-button-h11-sot
title: UI Input·Textarea·Select·시트 Button 높이를 h-11(44px)로 통일 (SoT 확장)
author: pistachio8
date: 2026-05-21
status: draft
---

## 목표

`src/components/ui/input.tsx` default 높이가 **h-8(32px) + 모바일 16px / 데스크탑 14px** 인데 코드베이스에서 호출처마다 `h-11` · `h-12`로 override되어 사용 중. 폼 정합성·터치 타깃·iOS Safari focus zoom 회피를 위해 다음 SoT로 통일한다.

- **Input · Textarea · Select trigger** = `h-11`(44px) + `text-base md:text-sm`
- **시트/다이얼로그 내부 CTA Button** = `h-11`(44px)
- **페이지 단독 sticky CTA Button** = `h-12`(48px) 유지(의도적 무게감 차등)

`docs/superpowers/specs/2026-05-20-home-stats-and-account-input-polish.md` §1·§4·§5 가 `AccountInputSheet` 한정으로 결정한 SoT(line 14·133-157·174)를 앱 전체로 확장한다.

## 배경

WCAG 2.1 SC 2.5.5(Target Size, AAA) · iOS HIG 권장 터치 타깃 44pt · iOS Safari가 input focus 시 폰트가 16px 미만이면 viewport 자동 zoom-in 동작.

현재 코드베이스의 분산 현황:

| 컴포넌트              | 사용처별 height                                                                                                                     | 빈도          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `Input` default       | `h-8`                                                                                                                               | shadcn 기본값 |
| Input override `h-11` | `account-input-sheet.tsx:135,149`                                                                                                   | 시트 안       |
| Input override `h-12` | `login-screen.tsx:186`                                                                                                              | 페이지 폼     |
| CTA Button `h-11`     | `account-input-sheet.tsx:166` · `start-challenge-card.tsx:64`                                                                       | 2곳           |
| CTA Button `h-12`     | `challenge/new` · `action-result-dialog` · `accept-form` · `in-app-browser-guard` · `login-screen` · `account-info-sheet` reveal 등 | 8곳+          |
| raw `<textarea>`      | `action-form.tsx:341`                                                                                                               | 메모 입력     |
| raw `<select>`        | `account-input-sheet.tsx:109`                                                                                                       | 은행 선택     |

## SoT 표 (이 PR의 결정)

| 컨텍스트                          | height                     | font                   | 근거                                                                        |
| --------------------------------- | -------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| Input · Textarea · Select trigger | `h-11`                     | `text-base md:text-sm` | iOS HIG 44pt, iOS Safari focus zoom 회피(16px↑), 데스크탑에서는 14px로 응축 |
| 시트/다이얼로그 내부 CTA Button   | `h-11`                     | `text-sm`              | 폼 정합성(Input과 같은 height로 시각적 짝짓기), 시트 세로 점유 최소화       |
| 페이지 단독 sticky CTA Button     | `h-12`                     | `text-sm`              | "다음 step"의 시각적 무게감 의도 유지                                       |
| Dialog footer 보조 액션(취소)     | `h-11` + `variant="ghost"` | `text-sm`              | primary와 명도 격차 확보 — 색맹 사용자에도 hierarchy 명확                   |

## 영향 범위

- **변경 경로**: `src/components/ui/input.tsx` · `src/components/ui/textarea.tsx`(신규) · `src/components/ui/select.tsx`(신규) · 시트 6~7개 파일 className 정리
- **데이터/RLS 영향**: 없음
- **외부 서비스**: 없음
- **재사용 후보**: `@base-ui/react/select` 풀세트(이미 설치됨 — root, trigger, popup, portal, positioner, value, icon, item, item-text, item-indicator, group, group-label, label, scroll-arrow) · 기존 `dialog.tsx` popover 톤 · 기존 `button.tsx` ghost variant

### 신규 파일

- `src/components/ui/textarea.tsx` — base-ui 별도 `<Textarea>` primitive가 없으므로 native `<textarea>` + Input과 동일 className 패턴. `min-h-11` baseline, 호출처에서 `min-h-*` override 허용
- `src/components/ui/select.tsx` — `@base-ui/react/select`를 shadcn 패턴(슬롯 분리)으로 wrapper

### 수정 파일

| 파일                                                                                | 변경                                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/ui/input.tsx`                                                       | default `h-8` → `h-11`. `text-base md:text-sm`는 이미 있어 유지                                                                                                                |
| `src/app/(auth)/login/_components/login-screen.tsx:186`                             | Input `className="h-12"` override 제거(default 적용)                                                                                                                           |
| `src/app/(app)/challenge/new/page.tsx:119`                                          | override 없음 → 자동 h-11. 시각 확인만                                                                                                                                         |
| `src/app/(app)/group/[id]/_components/account-input-sheet.tsx`                      | raw `<select>` → 신규 `<Select>` 컴포넌트로 교체. Input className override 제거. 풋터 Button `h-11` 유지(이미 시트 룰 부합)                                                    |
| `src/app/(app)/challenge/[id]/action/_components/action-form.tsx:341`               | raw `<textarea>` → 신규 `<Textarea>` 컴포넌트로 교체. 메모는 `min-h-20` 유지. 페이지 submit Button `h-12` 유지(페이지 단독 CTA)                                                |
| `src/app/(app)/challenge/[id]/_components/account-info-sheet.tsx`                   | reveal Button `h-12 w-full` → `h-11 w-full`(spec line 174의 후속 적용)                                                                                                         |
| `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx:70,73,78` | dialog 내부 3개 Button `h-12` → `h-11`                                                                                                                                         |
| (스캔 결과) 시트·다이얼로그 안의 추가 Button `h-12` 사용처                          | `pledge-sheet` · `group-switcher-sheet` · `creation-complete-sheet` · `confirm-dialog` · `open-in-app-modal` 등을 PR 작업 시점에 grep 한 번 더 → 시트 내부 CTA만 `h-11`로 통일 |

### 변경하지 않는 항목(의도적)

- `<input type="checkbox">` 2곳(`push-settings.tsx:162` · `pledge-sheet.tsx:70`) — height 무관, 별도 컴포넌트화는 본 PR 범위 외
- `<input type="file">` 2곳(`action-form.tsx:414,427`) — hidden/sr-only, 시각 영향 없음
- 페이지 단독 sticky CTA Button(`challenge/new` "다음" · `accept-form` · `login-screen` submit · `in-app-browser-guard` · `start-challenge-card`) — `h-12` 유지
- `Button` 컴포넌트의 `size` variants 정의 자체 — 변경 없음. 페이지/시트 구분은 호출처에서

## base-ui Select 설계

기존 native `<select>`가 OS 기본 dropdown(iOS bottom sheet picker · macOS native list · Windows dropdown)을 띄워 디자인 시스템 일관성이 깨지던 문제 해결. `@base-ui/react/select`를 shadcn 패턴(슬롯 분리·합성 export)으로 wrapper.

### Export 슬롯

```tsx
// src/components/ui/select.tsx
export {
  Select, // = base-ui Select.Root
  SelectTrigger, // Trigger + Value + Icon(chevron) — Input과 같은 외관
  SelectValue, // 현재 값 표시 (placeholder 지원)
  SelectContent, // Portal + Positioner + Popup + List 묶음
  SelectItem, // Item + ItemText + ItemIndicator(check)
  SelectGroup, // 옵션 그룹화(은행 카테고리 등)
  SelectLabel, // 그룹 헤더
  SelectSeparator, // 옵션 — hr 구분선
};
```

### 스타일링 토큰 (기존 디자인 시스템 차용)

| 슬롯                  | className 핵심                                                                                                                                                                                                                                                                                                                                                                                                                             | 출처                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Trigger               | `flex h-11 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-base md:text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground` | `input.tsx`와 1:1 매칭                                  |
| Trigger Icon(chevron) | lucide `ChevronDown` `size-4 text-muted-foreground`                                                                                                                                                                                                                                                                                                                                                                                        | lucide 컨벤션                                           |
| Popup                 | `rounded-xl border border-border/60 bg-popover p-1 text-popover-foreground shadow-[0_8px_24px_rgba(20,24,36,0.08),0_2px_6px_rgba(20,24,36,0.04)] ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 max-h-[60vh] overflow-auto`                                                                                   | `dialog.tsx:56` Dialog popup 톤 + Card border-border/60 |
| Popup width           | `min-width: var(--anchor-width)` (base-ui Positioner 변수)                                                                                                                                                                                                                                                                                                                                                                                 | Trigger와 같은 폭 보장                                  |
| Item                  | `relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none transition-colors data-highlighted:bg-muted data-highlighted:text-foreground data-selected:bg-primary/10 data-selected:text-primary disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:text-primary`                                                                                                  | `button.tsx` ghost variant + 선택 시그널                |
| ItemIndicator         | lucide `Check` `size-4 text-primary` 우측 정렬                                                                                                                                                                                                                                                                                                                                                                                             | Dialog close X와 동일 컨벤션                            |
| Motion duration       | `style={{ transitionDuration: "var(--motion-fast)" }}` 또는 tailwind `duration-100`                                                                                                                                                                                                                                                                                                                                                        | globals.css `--motion-fast: 120ms`                      |
| Radius 계층           | Trigger `rounded-lg` → Popup `rounded-xl` → Item `rounded-md`                                                                                                                                                                                                                                                                                                                                                                              | Input → Popup → 내부 row 계층적 응축                    |

### z-index / Portal / Dialog 안 nested overlay

- `Select.Portal`로 body에 portal — Dialog(z-50) 위에 떠야 함
- Popup className에 `z-[60]` 명시 검토 (Dialog overlay z-50과 충돌 방지)
- Dialog의 focus trap 내부에서 Select가 다시 nested trap — base-ui가 정상 처리하는지 검증 항목에 포함

### 사용처 교체

`src/app/(app)/group/[id]/_components/account-input-sheet.tsx:109`의 `<select>` 은행 선택을 다음과 같이 교체:

```tsx
// 변경 전
<select className="border-border bg-card h-11 rounded-lg border px-3 text-sm">
  {BANKS.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
</select>

// 변경 후
<Select value={bankCode} onValueChange={setBankCode}>
  <SelectTrigger><SelectValue placeholder="은행 선택" /></SelectTrigger>
  <SelectContent>
    {BANKS.map((b) => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)}
  </SelectContent>
</Select>
```

className override 모두 제거 — default가 `h-11 + border-input` 이미 적용.

## Textarea 설계

base-ui에 별도 `<Textarea>` primitive가 없으므로 native `<textarea>` + Input과 동일 className 패턴을 cn으로 합성.

```tsx
// src/components/ui/textarea.tsx
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-11 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base md:text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}
```

- baseline `min-h-11` — single-row일 때 Input과 동일 키 시각
- 호출처에서 `min-h-20`(action-form memo) 등 override 자유
- iOS zoom 회피 + 데스크탑 응축 동일 패턴

## DialogContent 안전망 (spec line 167)

Input height 12px 증가 × 시트 안 5요소 = 약 60px 추가. iPhone SE(667px) + 가상 키보드 시나리오에서 dialog가 viewport 초과 시 clip 위험.

영향 받는 `DialogContent`에 다음 className 추가:

```tsx
<DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-sm">
```

`svh`(small viewport height)는 iOS Safari 가상 키보드 표시 시점 기준 viewport 높이 — 동적 viewport.

적용 대상:

- `account-input-sheet.tsx`(가장 빠듯, 5요소)
- `account-info-sheet.tsx`
- `action-result-dialog.tsx`
- `pledge-sheet.tsx`
- (확장) `creation-complete-sheet.tsx` · `group-switcher-sheet.tsx` · `confirm-dialog.tsx` · `open-in-app-modal.tsx` — 시각 점검 후 필요한 곳만

## UX 디자이너 체크리스트

### 시각 위계

- 라벨은 `t-caption`(13px) 유지 — 입력 박스와 위계 분리
- input value/placeholder는 `text-base md:text-sm`
- footer Button text는 `text-sm`
- 시트 footer 보조 액션(취소)은 `variant="ghost"` 우선 — primary와 명도 격차로 hierarchy 명확
- 페이지 CTA(`h-12`)와 시트 CTA(`h-11`) 차등은 의도적 무게감 차이

### 시각 리듬

- 시트 안 5요소가 모두 `h-11`로 쌓이는 "사다리" 단조로움은 `dialog.tsx:105`의 기존 footer 구분선(`border-t bg-muted/50`)으로 자연 해결 — 신규 작업 없이 유지·검증
- 라벨/도움말은 작은 폰트로 입력 박스와 시각 분리

### 상태

- focus/aria-invalid `ring-3`이 `h-11` 박스에서 비례 어색하지 않은지 시각 점검 — 어색하면 ring-4 검토는 별도 PR
- account-input-sheet 진입 시 첫 요소에 autoFocus 또는 명시적 focus 이동 확인
- 키보드 tab 순서가 라벨 시각 순서와 일치

### Select 전용

- placeholder는 `text-muted-foreground` / 선택값은 `text-foreground` — Input과 동일 톤 위계
- 선택 표시는 **우측 Check icon + 행 highlight 이중 시그널**(`data-selected:bg-primary/10 data-selected:text-primary`) — 색맹 a11y에 유리
- Popup `min-width = var(--anchor-width)`로 Trigger와 같은 폭 보장 — 시각 alignment

## 데스크탑/모바일 viewport 검증 매트릭스

with-key는 `(app)/layout.tsx`의 `max-w-screen-sm`(640px) 컨테이너로 데스크탑에서도 모바일 캔버스. 다만 `(auth)` 그룹(`login` · `invite/[token]`)은 자체 max-width 없음 — 본 PR 범위 외(height 변경 0).

| Viewport   | 기기 가정         | 확인                                                         |
| ---------- | ----------------- | ------------------------------------------------------------ |
| 375 × 667  | iPhone SE         | 시트 5요소 + 가상 키보드 띄움 시 clip 없이 스크롤되는지      |
| 430 × 932  | iPhone 14 Pro Max | 정상                                                         |
| 768 × 1024 | iPad mini         | `dialog.tsx`의 `sm:max-w-sm` 발동 → 384px 폭                 |
| 1280 × 800 | Desktop           | 좌우 여백 + 모바일 캔버스 정상, `md:text-sm`(14px) 적용 확인 |

각 viewport에서 점검할 시트/다이얼로그: `account-input-sheet` · `account-info-sheet` · `action-result-dialog` · `pledge-sheet` · `creation-complete-sheet` · `group-switcher-sheet`.

추가 점검:

- iOS Safari 시뮬레이션: input focus 시 viewport zoom 미발생(text-base 16px이 핵심)
- 키보드 typeahead(예: "ㅋ" → 카카오뱅크 점프) 데스크탑에서 동작
- Dialog + Select nested overlay focus trap 정상

## 작업 단계

1. **신규 `src/components/ui/textarea.tsx` 작성** — 검증: `pnpm typecheck`
2. **신규 `src/components/ui/select.tsx` 작성** — base-ui Select wrapping, 위 스타일 토큰 적용. 검증: `pnpm typecheck`
3. **`src/components/ui/input.tsx` default `h-8` → `h-11`** — `md:text-sm`는 그대로. 검증: `pnpm typecheck && pnpm lint`
4. **호출처 className override 정리** — `login-screen.tsx` · `account-input-sheet.tsx`의 Input override 제거. 검증: 영향 화면 dev에서 시각 확인
5. **raw `<textarea>` · `<select>` 교체** — `action-form.tsx` · `account-input-sheet.tsx`. 검증: 기존 동작 동일(memo 입력 · 은행 선택·저장)
6. **시트 내부 Button `h-12` → `h-11` 일괄** — `account-info-sheet` · `action-result-dialog` 등. 검증: 시각 위계 유지 확인
7. **DialogContent 안전망 `max-h-[85svh] overflow-y-auto`** — 영향 시트에 추가. 검증: iPhone SE 시뮬레이션 + 키보드 시나리오
8. **viewport matrix 수동 시각 확인** — 4 viewport × 6 시트 매트릭스
9. **신규 컴포넌트 spec(`.spec.tsx`) 작성** — Textarea · Select 기본 렌더·a11y·키보드 동작. 검증: `pnpm test`

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
```

수동 확인:

- [ ] iPhone SE(375×667) viewport에서 account-input-sheet 진입 → 키보드 띄움 → 풋터 버튼 도달 가능
- [ ] iOS Safari 시뮬레이션에서 Input focus 시 viewport zoom 미발생
- [ ] Desktop(1280) viewport에서 dialog `sm:max-w-sm` 384px 폭 정상
- [ ] base-ui Select dropdown이 Dialog(z-50) 위에 정상 표시
- [ ] Select 키보드 typeahead 데스크탑 동작
- [ ] Select 선택 시 우측 Check + 행 highlight 이중 시그널
- [ ] focus/aria-invalid ring이 `h-11` 박스에 어색하지 않음
- [ ] 시트 안 5요소의 시각 단조로움이 footer 구분선으로 분리되어 인지 부담 없음

## 비범위 (이 PR에 포함하지 않음)

- `Button` 컴포넌트의 `size` variants 정의 자체 재구성(예: `lg`를 `h-11`로 변경) — Button 전역 의존성이 넓어 별도 PR
- `<input type="checkbox">` 별도 `Checkbox` 컴포넌트화 — height와 무관, 디자인 결정 추가 필요
- `<input type="file">` wrapping — sr-only로 시각 영향 없음
- `(auth)` 그룹 페이지의 컨테이너 max-width 정합성 — height 변경 0, 별도 작업
- Select `combobox`(검색 입력) 변형 — 별도 PR
- shadcn CLI(`npx shadcn add select`) 표준 코드 도입 — 우리 코드베이스가 base-ui 변형이라 표준 코드 호환 안 됨. **base-ui로 직접 작성하되 shadcn의 슬롯 분리 패턴을 따른다.**

## 리스크 / 미해결

- **base-ui Select Portal의 z-index**: Dialog 안에서 nested overlay 시 `z-[60]` 명시가 필요할 수 있음. PR 작업 시 dev에서 실측.
- **Select dropdown의 OS 의존성 제거 트레이드오프**: iOS Safari에서 native bottom sheet picker가 한 손 조작감은 더 좋을 수 있다는 의견 가능. 다만 은행 옵션 5~15개 규모라 inline dropdown으로 충분, dogfood 피드백 후 재평가.
- **Textarea의 `min-h-11`이 single-row 텍스트에서 너무 작아 보일 가능성** — 호출처가 거의 multi-line이라 실제 single-row 사용은 드물 것. 발생 시 호출처에서 `min-h-*` override.
- **시트 footer Button `h-11` 통일 후 hierarchy 약화** — `variant="ghost"` 컨벤션으로 완화. 부족하면 별도 디자인 결정.

## Spec 참조

- 본 PR의 기반 결정: `docs/superpowers/specs/2026-05-20-home-stats-and-account-input-polish.md` §1·§4·§5(line 14·133-157·174 — `AccountInputSheet` SoT, "향후 view sheet도 h-11 통일은 별도 작업" 명시)
- 디자인 토큰 SoT: `src/app/globals.css`(`--motion-fast`: 120ms · `--color-popover` · radius)
- 디자인 가이드라인: `docs/mockups/2026-05-14-ui-revision.html`(.btn 42px · .btn-pill 34px) — input height는 모킹업에 명시 없음, 본 PR이 SoT 신규 정의
