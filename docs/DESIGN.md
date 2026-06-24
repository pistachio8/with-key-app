# 🎨 from.with · 디자인 기준 (Design System)

> **문서 상태**: v1.0 (초판) · **업데이트**: 2026-06-23
> **대상 독자**: 디자이너 · FE 개발자 · AI 코딩 에이전트 · PO
> **이 문서의 역할**: from.with(그룹 운동 각서 앱, 모바일 웹 PWA(Progressive Web App, 설치 가능한 웹 앱))의 **시각 디자인 기준**을 한곳에 모은다. 컬러·타이포·간격·컴포넌트·상태·보이스를 결정하고, 각 항목의 SoT(Single Source of Truth, 중복 없이 기준으로 삼는 단일 원본) 파일을 가리킨다.

이 문서는 "화면이 어떤 색·글자·컴포넌트·말투로 만들어지는가"를 정한다. "화면이 어떻게 이어지고 어떤 상태로 갈라지는가"(전환·플로우)는 [`DESIGN_FLOW.md`](./DESIGN_FLOW.md)가 담당한다 — 둘은 짝 문서다.

---

## 1. 읽는 법 · SoT 체인

각 디자인 값은 한 곳에서만 결정되고 나머지는 그것을 따른다. 추정·눈대중으로 값을 바꾸지 않는다. **왜**: 같은 색이 파일마다 다르면 화면이 미묘하게 어긋나고, 디버깅 비용이 커진다.

```
시각 시안(mockup)  →  구현 토큰(globals.css)  →  Tailwind 토큰  →  UI primitive
hex 팔레트 SoT        OKLCH + AA 보정 SoT        @theme 매핑       components/ui/*
docs/mockups/*.html   apps/web/src/app/globals.css                 컴포넌트 모양 SoT
```

| 무엇을 바꾸려면       | 어디를 본다                                                                        |
| --------------------- | ---------------------------------------------------------------------------------- |
| 색·간격·모션 값       | [`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css)                  |
| 컴포넌트 모양·variant | [`apps/web/src/components/ui/`](../apps/web/src/components/ui)                     |
| 화면 시각 시안        | [`docs/mockups/`](./mockups/README.md) (최신 시안·화면 플로우)                     |
| 화면 전환·상태 분기   | [`DESIGN_FLOW.md`](./DESIGN_FLOW.md)                                               |
| 안티-템플릿·품질 기준 | [`../.claude/rules/web/design-quality.md`](../.claude/rules/web/design-quality.md) |

> 이 문서는 위 파일들을 **요약·연결**한다. 실제 값이 충돌하면 `globals.css`(구현 토큰)와 `components/ui/*`(컴포넌트)가 이긴다.

---

## 2. 브랜드

제품명은 **from.with**(소문자, 가운데 점 강조). 콘셉트는 "혼자, 또는 친구와 함께하는 가벼운 운동 내기".

- **워드마크**: `from` + 컬러 점(`.`, `--primary-deep`) + `with`. 점만 강조색을 준다.
  ```html
  <!-- 예: 로고 표기 -->
  <span>from<span style="color:var(--color-primary)">.</span>with</span>
  ```
- **로고 자산**: `/logo-from-with.svg` (워드마크 이미지)
- **목소리**: 친근한 존댓말("~해요"), 부담 제로, 자책 유발 금지. 상세는 §10.
- **금지**: 내부 코드/저장소 이름인 `with-key`·`withkey`를 **사용자 노출 화면에 쓰지 않는다**. **왜**: 사용자에게 보이는 제품명은 from.with 하나로 통일한다(저장소 이름은 개발 내부용).

---

## 3. 컬러 토큰

색은 시안 hex가 SoT이고, 구현은 그 hex를 OKLCH(L·C·H 기반 색 공간, 밝기 조절이 정확함)로 정밀 변환해 `globals.css`에 둔다. `globals.css` 주석 그대로: _"모킹업 v4 팔레트 — hex SoT. OKLCH 값은 hex의 sRGB→OkLab 정밀 변환. 눈대중 추정 금지."_

### 3.1 시맨틱 토큰 (자주 쓰는 것)

색은 의미(semantic)로 쓴다. "파란색"이 아니라 "primary(주요 액션)"로 부른다. **왜**: 톤을 한 번에 바꿀 수 있고, 의도가 코드에 남는다.

| 토큰                     | hex (시안)  | 쓰임                                   |
| ------------------------ | ----------- | -------------------------------------- |
| `--primary`              | `#8AA4FF`   | 주요 액션·진행·강조 (CTA, 선택 상태)   |
| `--primary-deep`         | `#6F8DF5`\* | primary 위 텍스트·딥 강조              |
| `--secondary`            | `#FFD46B`   | 보조 강조·따뜻한 톤 (서약·캘린더 범위) |
| `--accent`               | `#BCA6FF`   | 보라 강조 (정산 계열)                  |
| `--brand-pink`           | `#FFB6C6`   | 인증·온보딩 분홍 포인트                |
| `--background`           | `#F7F8FB`   | 앱 배경                                |
| `--foreground`           | `#22262E`   | 본문 텍스트                            |
| `--card`                 | `#FFFFFF`   | 카드·시트 표면                         |
| `--muted-foreground`     | (AA 보정)\* | 보조 텍스트                            |
| `--border`               | `#E8EBF0`   | 구분선·테두리                          |
| `--destructive`          | `#FF6B6B`   | 위험·삭제·에러                         |
| `--brand-warn`           | `#FF8A4E`   | 경고 (미인증·벌금 위험)                |
| `--brand-success`        | `#52C28C`   | 완료·달성                              |
| `--brand-primary-soft`   | `#E8EDFF`   | 칩·배너 soft 배경                      |
| `--brand-secondary-soft` | `#FFF5DA`   | 보조 soft 배경                         |

\* **AA 보정 (접근성)**: `--muted-foreground`는 시안 `#8B91A1`이 배경 대비 3.6:1로 작은 글씨 AA(WCAG 2.2 대비 4.5:1) 미달이라 `L=0.5`까지 어둡게 보정했다. `--primary-deep`도 onPrimary 대비 확보를 위해 chroma를 낮춘 별도 OKLCH 값을 쓴다. **왜**: 색감은 시안을 따르되, 읽힘(대비)은 양보하지 않는다.

### 3.2 특수 팔레트

- **정산 영수증(청첩장 톤)** `--invite-*`: recap(정산 영수증) 화면 전용 종이색·테라코타·점선. 일반 화면에 쓰지 않는다. **왜**: 영수증만의 아날로그 질감을 위한 격리 팔레트.
- **streak 채도 7단계** `--streak-1`~`--streak-7`: 인증 연속일(streak) 시각화. primary hue를 연→진으로 보간, 7일+는 평탄화.
- **chart-1~5**: 데이터 시각화용 (primary·secondary·accent·pink·success 매핑).

### 3.3 사용 규칙

- 색은 **토큰으로만**. hex를 컴포넌트에 하드코딩하지 않는다. **왜**: 토큰 외 색은 다음 변경에서 누락된다.
- **다크 모드**: 토큰·인프라는 보존하되 POC는 **light-only**. 다크 활성화는 별도 결정.

---

## 4. 타이포그래피

글꼴은 **Pretendard**(한글 가독성 좋은 sans-serif) 하나, 영수증의 숫자/라틴만 모노(`--font-receipt`)로 폴백한다. **왜**: 글꼴 수를 늘리면 로딩·일관성 비용이 크다.

제목은 `globals.css`의 타이포 유틸리티 클래스로 통일한다(직접 px 지정 지양).

| 클래스       | 크기·굵기                     | 쓰임           |
| ------------ | ----------------------------- | -------------- |
| `.t-h1`      | 28px / 800 / tracking -0.02em | 화면 제목      |
| `.t-h2`      | 22px / 700 / -0.01em          | 섹션 제목      |
| `.t-h3`      | 18px / 700 / -0.01em          | 카드·블록 제목 |
| `.t-body`    | 14px / 500 / line-height 1.5  | 본문           |
| `.t-sub`     | 13px / 500 / muted            | 보조 설명      |
| `.t-caption` | 11px / 600 / tracking 0.04em  | 라벨·캡션      |

원칙: 제목은 굵게(700~800) + 좁은 자간(letter-spacing 음수)으로 또렷하게. 본문 줄간격은 1.45~1.5로 넉넉히. **왜**: 한글은 자간이 넓으면 흐려 보이고, 줄간격이 좁으면 답답하다.

---

## 5. 간격 · 라운드 · 모션

부드럽고 둥근 모바일 톤. 값은 `globals.css`가 SoT.

- **라운드**: 기준 `--radius: 0.875rem`(14px). 파생: `sm`(0.6×)·`md`(0.8×)·`lg`(1×)·`xl`(1.4×)·`2xl`(1.8×)·`3xl`(2.2×). 카드·시트는 크게(xl~3xl), 칩·작은 버튼은 작게.
- **모션 지속**: `--motion-fast` 120ms · `--motion-base` 200ms · `--motion-slow` 320ms · `--motion-stamp` 520ms.
- **이징**: `--ease-out-soft` `cubic-bezier(0.2,0.8,0.2,1)` (등장), `--ease-in-soft` (퇴장).
- **접근성**: `prefers-reduced-motion: reduce`면 모든 모션 토큰을 1ms로 강제. **왜**: 멀미·전정 장애 사용자 보호(움직임 최소화).
- **시그니처 모션**:
  - `animate-stamp-in`: 정산 도장이 회전하며 찍히는 효과(scale+rotate).
  - `animate-invite-dot`: 초대 수락 후 "이동 중" 5점 wave.

---

## 6. 아이콘

두 갈래를 의도적으로 섞는다.

- **lucide-react**(선 아이콘): 기능·네비게이션·상태(뒤로·알림·설정·에러·새로고침 등). 기본 크기 `size-4`, 빈/에러 상태 일러스트는 `size-10`.
- **emoji**: 활동 종류(🏋️🏃🧘🍽)·감정 키워드·축하(🎉👑💪🔥💯). **왜**: 감정·활동은 이모지가 더 빠르고 친근하게 읽힌다. 기능 UI에는 이모지 대신 lucide.

---

## 7. 레이아웃 원칙

한 손에 들어오는 모바일 세로 화면이 전제다.

- **모바일 우선 375pt** 기준. PWA 세로형, 한 손 엄지 도달 범위 우선.
- **터치 타깃**: 주요 CTA(Call To Action, 핵심 행동 버튼)는 높이 ≥44px로 키운다(`Button` primitive 위에 className 보정). **왜**: 모바일 탭 정확도.
- **route colocation**: 화면 UI는 해당 라우트 `_components/`에 둔다(앱 아키텍처와 1:1). 디자인 프레임 네이밍도 라우트와 맞추면 개발과 매칭된다.
- **하단 행동 영역**: FAB(Floating Action Button, 떠 있는 동작 버튼) 또는 BottomNav로 핵심 동작을 하단에 고정.

---

## 8. 핵심 컴포넌트

새 화면은 아래 primitive를 **조합**해 만든다. 모양 SoT는 `components/ui/*`이며, 임의 inline 스타일로 같은 것을 다시 만들지 않는다. **왜**: primitive를 우회하면 톤·접근성·상태 처리가 제각각이 된다.

| 컴포넌트                    | 역할               | variant · prop (실제)                                                                                          | SoT 파일                         |
| --------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `Button`                    | 모든 버튼          | variant: `default`·`outline`·`secondary`·`ghost`·`destructive`·`link` / size: `default`·`xs`·`sm`·`lg`·`icon*` | `ui/button.tsx`                  |
| `Chip`                      | 작은 상태/태그     | tone: `neutral`·`primary`·`secondary`·`success`·`danger`                                                       | `ui/chip.tsx`                    |
| `Card`                      | 표면 컨테이너      | —                                                                                                              | `ui/card.tsx`                    |
| `Input`·`Textarea`·`Select` | 입력               | —                                                                                                              | `ui/{input,textarea,select}.tsx` |
| `Fab`                       | 하단 떠있는 동작   | —                                                                                                              | `ui/fab.tsx`                     |
| `EmptyState`                | 빈 상태            | `icon`·`title`·`description?`·`action?`                                                                        | `ui/empty-state.tsx`             |
| `ErrorState`                | 에러 상태          | `title`·`description`·`onRetry`·`retryLabel`                                                                   | `ui/error-state.tsx`             |
| `ConfirmDialog`·`Dialog`    | 확인·모달          | —                                                                                                              | `ui/{confirm-dialog,dialog}.tsx` |
| `ShareCard`                 | 서약·공유 카드     | —                                                                                                              | `ui/share-card.tsx`              |
| `Stamp`                     | 정산 도장          | —                                                                                                              | `ui/stamp.tsx`                   |
| `KeywordDonut`              | 키워드 도넛 게이지 | —                                                                                                              | `ui/keyword-donut.tsx`           |
| `Skeleton`                  | 로딩 자리표시      | —                                                                                                              | `ui/skeleton.tsx`                |

- **버튼 마이크로 인터랙션**: 눌림 시 `translate-y-px`, 포커스 시 `ring-3`. base-ui primitive 위에 둔다. **왜**: 일관된 눌림 피드백 + 키보드 접근성.

---

## 9. 상태 패턴 (default · loading · empty · error · limited)

데이터를 그리는 화면은 다섯 상태를 **같은 파일에 조건부로** 모두 갖춘다. 화면별 적용 표는 [`DESIGN_FLOW.md §4`](./DESIGN_FLOW.md)(화면별 상태 체크리스트).

- **loading**: `Skeleton`. AI 일기 생성 중은 "AI가 일기를 쓰는 중..."처럼 무엇을 기다리는지 알린다.
- **empty**: `EmptyState`(아이콘 + 제목 + 설명 + **CTA**). 예: "아직 인증이 없어요 / 첫 번째 인증을 올려보세요".
- **error**: `ErrorState`(기본 카피 "문제가 발생했어요 / 잠시 후 다시 시도해 주세요" + "다시 시도").
- **limited**: 권한·정원·횟수 제한 상태(예: 초대 만료·정원 초과·다시 뽑기 0/5).
- **핵심 원칙 — 막다른 길에도 다음 행동**: empty·error·limited 어디서든 사용자가 누를 다음 버튼(CTA)을 둔다. 시각 예시는 [`docs/mockups/2026-06-23-screen-flow.html` §D-1](./mockups/README.md)(빈·에러 variant 모음). **왜**: 끝난 화면처럼 보이면 사용자가 이탈한다.

---

## 10. 역할 분기 (운영자 vs 일반 멤버)

같은 화면도 보는 사람의 역할에 따라 갈린다. 분기 기준은 코드의 `isOwner`(그룹장 여부) 게이트.

| 동작                          | 운영자(그룹장) | 일반 멤버            |
| ----------------------------- | :------------: | -------------------- |
| 친구 초대 링크 만들기         |       ✅       | 숨김                 |
| 챌린지 종료·삭제              |       ✅       | 숨김 (나가기만 가능) |
| 그룹 이름 변경·삭제·새 챌린지 |       ✅       | 숨김 (읽기 전용)     |
| 정보·계좌·멤버 열람           |       ✅       | ✅ (열람 동일)       |

- **표시 원칙**: 멤버에게는 버튼을 **숨긴다**(비활성 회색이 아니라 미노출). 필요하면 한 줄 안내("친구 초대는 운영자만 할 수 있어요"). 서버는 우회 시도에 friendly 카피("그룹장만 초대 링크를 만들 수 있어요")로 거절.
- 시각 예시: [`docs/mockups/2026-06-23-screen-flow.html` §D-2](./mockups/README.md)(운영자/멤버 짝 variant).

---

## 11. 보이스 · 마이크로카피

부드러운 존댓말로, 사용자가 자책하지 않게 쓴다.

- **말투**: "~해요"체. 짧고 친근하게. 예: "비밀번호 없이, 메일로 받은 링크만 누르면 바로 로그인돼요."
- **전문용어 풀어쓰기**: 사용자 화면에서 jargon을 피한다. 예: "매직링크" → "이메일 링크 로그인". **왜**: 모르는 단어는 진입 장벽이 된다.
- **자책 금지**: 미달·실패도 격려로 마무리. 예: 정산 미달 footer "오늘도 인증, 수고했어요 😜" / 달성 "끝까지 해냈어요 👏".
- **AI 폴백은 성공처럼**: AI 일기가 타임아웃·실패해도 템플릿 폴백을 매끄럽게 보여준다(사용자에겐 성공 체감). 근거: PRD(Product Requirements Document) §5.3 (AI 일기 — 4.5초 타임아웃, 키워드 커버리지 부족 시 폴백).
- **에러는 무엇+다음 행동**: 원인 한 줄 + 다음 버튼. 예: 초대 만료 "이 초대 링크는 72시간이 지나 만료됐어요. 그룹장에게 새 링크를 요청해 주세요." + "홈으로 가기".

| 상황           | 카피 (실제)                                    |
| -------------- | ---------------------------------------------- |
| 빈 인증 피드   | 아직 인증이 없어요. 첫 번째 인증을 올려보세요. |
| 초대 정원 초과 | 그룹이 가득 찼어요 (최대 4명).                 |
| 정산 달성      | 달성 🎉                                        |
| 정산 미달      | 미달 😅 (금액은 terra색 강조)                  |
| 삭제 확인      | 삭제된 챌린지는 복구할 수 없어요. …            |

---

## 12. 디자인 품질 · 접근성 기준

기본 톤은 부드러운 light이지만 "템플릿 같은" 결과물은 지양한다. 상세 안티-템플릿 정책: [`../.claude/rules/web/design-quality.md`](../.claude/rules/web/design-quality.md)(균일 카드 그리드·스톡 히어로 등 금지, 위계·리듬·깊이·의미 있는 색 요구).

- **대비(AA)**: 작은 글씨는 배경 대비 4.5:1 이상(§3.1 보정 참고).
- **모션 최소화 존중**: `prefers-reduced-motion`에서 애니메이션 1ms.
- **아이콘 접근성**: 장식 아이콘은 `aria-hidden`, 의미 있는 아이콘은 라벨.
- **검증**: 변경 화면은 모바일 viewport(DevTools 또는 실기)에서 주요 플로우를 눈으로 확인.

---

## 13. 변경 절차

- **토큰 변경**(색·간격·모션): `globals.css`를 고치고, 대응 시안(mockup)과 동기화. 색 변경 시 AA 대비를 재검증한다.
- **새 컴포넌트**: 먼저 `components/ui/*` primitive 조합으로 해결 가능한지 본다. 새 primitive는 토큰만 사용.
- **분석에 영향 주는 변경**(예: 키워드 풀): PO 승인 필요(분석 편향 방지). 근거: 가드레일 [`AGENTS.md` §키워드 풀](../AGENTS.md).

---

## 14. 출처 (SoT 파일)

| 영역                | 파일                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- |
| 색·간격·모션·타이포 | [`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css)                  |
| 컴포넌트            | [`apps/web/src/components/ui/`](../apps/web/src/components/ui)                     |
| 화면 시안·플로우    | [`docs/mockups/`](./mockups/README.md)                                             |
| 화면 전환·상태      | [`DESIGN_FLOW.md`](./DESIGN_FLOW.md)                                               |
| 품질·안티-템플릿    | [`../.claude/rules/web/design-quality.md`](../.claude/rules/web/design-quality.md) |

---

## 15. 용어집

본문 약어·도메인 용어. 가나다·영문 순.

- **AA (WCAG 2.2 레벨 AA)**: 웹 접근성 대비 기준. 작은 글씨는 배경과 4.5:1 이상 대비.
- **AC (Acceptance Criteria)**: 인수 기준.
- **CTA (Call To Action)**: 사용자가 누를 핵심 행동 버튼.
- **FAB (Floating Action Button)**: 화면 위에 떠 있는 주요 동작 버튼.
- **OKLCH**: 밝기(L)·채도(C)·색상(H)로 색을 다루는 색 공간. 밝기 조절이 정확해 AA 보정에 유리.
- **PWA (Progressive Web App)**: 브라우저로 설치 가능한 웹 앱.
- **PRD (Product Requirements Document)**: 제품 요구사항 문서.
- **primitive**: 더 큰 화면을 조립하는 최소 UI 단위 컴포넌트(`components/ui/*`).
- **RSC (React Server Component)**: 서버에서 렌더되는 React 컴포넌트. 이 앱의 기본.
- **SoT (Single Source of Truth)**: 중복 없이 기준으로 삼는 단일 원본.
- **streak**: 인증을 끊기지 않고 이어간 연속일.
- **token (디자인 토큰)**: 색·간격 같은 값을 의미 이름으로 둔 변수(예: `--primary`).

---

## 16. Changelog

- **v1.0** (2026-06-23) — 초판. 화면 플로우 공유 문서(`docs/mockups/2026-06-23-screen-flow.html`) 작업 중 수집한 디자인 시스템(`globals.css` 토큰 · `components/ui/*` primitive · mockup 팔레트 · 보이스·상태·역할 분기)을 단일 기준으로 직렬화. `DESIGN_FLOW.md`(흐름)와 짝.
  </content>
  </invoke>
