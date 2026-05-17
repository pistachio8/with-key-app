---
spec: 2026-05-17-pwa-magic-link-routing
title: PWA 설치 유도 + 매직링크 standalone 분기
author: pistachio8
date: 2026-05-17
status: draft
---

## Summary

매직링크 로그인이 끝나고 `/home` 으로 진입할 때 사용자의 PWA 설치 상태를 클라이언트에서 감지해 두 가지 UX를 제공한다.

1. **첫 방문 (PWA 미설치 추정)** — 부드러운 "홈 화면에 추가" 배너(iOS는 공유→홈에 추가 가이드 일러스트, Android는 `beforeinstallprompt` 트리거 버튼). dismiss 시 7일 숨김.
2. **이미 standalone으로 들어와 본 적 있는데 이번엔 브라우저 (≈ PWA 설치돼 있으나 매직링크가 브라우저로 캐치된 경우)** — 백드롭 dim · non-click의 모달로 "**앱으로 열기 / 웹으로 계속**" 선택을 강제. "웹으로 계속" 은 그 세션 동안만 숨김.

Manifest 에 `launch_handler.client_mode = "navigate-existing"` 를 추가해, Android Chrome 에서 매직링크가 설치된 PWA로 전달될 때 기존 PWA 윈도우가 콜백 URL 로 navigate 하도록 한다 (W3C launch_handler 표준). `capture_links` 는 W3C 표준에서 제거되어 추가하지 않으며, OS/브라우저의 PWA 캡처 휴리스틱에 위임한다. iOS Safari는 시스템 한계로 자동 전달이 불가능하므로 위 모달이 차선 UX다.

## Why

- 현재 `manifest.json` · `PwaRegister` 까지는 있으나 "홈에 추가" 유도 UI와 standalone 분기 로직이 전혀 없다. 사용자는 PWA를 설치해도 매직링크를 누르면 항상 브라우저에서 열리고 PWA 컨텍스트로 전환되지 않아 두 세션이 갈라진 경험을 한다.
- 매직링크 발송 시점에 서버는 사용자의 PWA 설치 여부를 알 수 없다. **WHY**: standalone 감지는 `window.matchMedia("(display-mode: standalone)")` 같은 클라이언트 API만 가능 — 분기는 클라이언트에서 일어나야 한다.
- iOS Safari는 매직링크(https) → 설치된 PWA로 자동 핸드오프하는 공식 메커니즘이 없다. **WHY**: 따라서 "앱으로 열기" 모달이 핵심 UX이고, manifest 옵션은 Android 한정 best-effort.
- 같은 origin이라면 브라우저 컨텍스트와 PWA 컨텍스트가 localStorage 를 공유한다 — **단, Android Chrome 한정**. **WHY**: PWA 안에서 `pwa.everInstalled = true` 를 한 번 기록하면, 브라우저로 돌아왔을 때도 "이 사용자는 PWA를 깐 적이 있다"고 추정할 수 있다. iOS Safari 의 standalone PWA 는 storage partition 이 격리될 수 있어 (iOS 16.4 이전 완전 격리, 이후 부분 공유) 이 시그널이 iOS 에서는 신뢰할 수 없다 — §Known Platform Limits 참고.

## Impact Scope

### 변경 경로

- **신규**:
  - `src/components/pwa/use-display-mode.ts` — `display-mode: standalone` 감지 + ever-installed 플래그 관리 훅
  - `src/components/pwa/install-banner.tsx` — `/home` 첫 진입 시 노출되는 소프트 배너 (iOS/Android 분기)
  - `src/components/pwa/open-in-app-modal.tsx` — standalone 아니지만 ever-installed=true 일 때 노출되는 강제 선택 모달
  - `src/app/(app)/home/_components/pwa-gate.tsx` — `/home` 라우트에서 두 컴포넌트 중 적절한 것을 렌더링하는 단일 진입점
- **수정**:
  - `public/manifest.json` — `launch_handler.client_mode = "navigate-existing"` 추가
  - `src/app/(app)/home/page.tsx` — `<PwaGate />` 마운트
  - `src/components/pwa-register.tsx` — 등록 직후 standalone 이면 `pwa.everInstalled` 플래그 set (이미 standalone 이라는 건 이미 설치돼 있다는 결정적 증거)

### src/ 영향

- 라우트 콜로케이션 유지: PWA 관련 공용 컴포넌트는 `src/components/pwa/` 묶음으로, `/home` 전용 게이트는 route `_components/` 에. **WHY**: install-banner 와 modal 은 향후 다른 보호 라우트(예: 초대 수락 후 진입)에서도 재사용 가능성이 있어 공용으로 둔다.
- `src/features/` 신설 없음.
- 인증 흐름 (`src/app/auth/callback/route.ts`, `src/lib/supabase/middleware.ts`) **변경 없음**. **WHY**: 세션 교환은 그대로 서버에서 끝내고, PWA 판단은 `/home` 도착 후 클라이언트에서만 한다. 콜백 라우트에 PWA 책임을 섞으면 인증 회귀 위험만 커진다.

### Supabase / RLS / migration 영향

없음.

### 외부 서비스

없음. (Service Worker · manifest 는 정적 파일.)

## Design

### 데이터 흐름

```
[매직링크 클릭]
   ↓ (https)
브라우저 OR PWA (capture)
   ↓
/auth/callback (서버) — 세션 교환 (변경 없음)
   ↓ redirect
/home (서버) — RSC 렌더 (변경 없음)
   ↓
<PwaGate /> (클라이언트) ← display-mode 감지
   ├─ standalone === true        → null (아무것도 안 그림)
   ├─ standalone === false
   │    + ever-installed === true → <OpenInAppModal />  (강제 선택)
   └─ standalone === false
        + ever-installed === false → <InstallBanner />  (소프트, dismissible)
```

### 컴포넌트 분해

**C1. `useDisplayMode()` 훅**

```ts
// src/components/pwa/use-display-mode.ts
type DisplayMode = "standalone" | "browser";

interface DisplayModeState {
  mode: DisplayMode | null; // null = 아직 측정 전 (SSR 또는 mount 직전)
  everInstalled: boolean; // localStorage 영구 플래그
}

export function useDisplayMode(): DisplayModeState;
```

- mount 시 `window.matchMedia("(display-mode: standalone)").matches` 평가.
- standalone === true 이면 즉시 `localStorage.setItem("pwa.everInstalled", "1")`.
- iOS Safari fallback: `navigator.standalone === true` 도 함께 OR.
- `matchMedia` change 리스너 등록 → 런타임에 모드 바뀌면 (이론상 거의 없지만) 따라 갱신.

**C2. `<InstallBanner />`**

- 가시 조건: `mode === "browser"` && `!everInstalled` && `dismissedUntil < now`.
- 플랫폼 분기:
  - `beforeinstallprompt` 이벤트가 잡혔으면 (= Android Chrome) 그 prompt 를 호출하는 버튼 노출.
  - 아니면 (iOS Safari) "공유 버튼 → 홈 화면에 추가" 안내 텍스트.
- **`appinstalled` 이벤트 처리**: 사용자가 Chrome 설치 prompt 를 수락해 설치가 완료되면 그 세션은 여전히 브라우저 컨텍스트라 `everInstalled` 가 false 인 채 배너가 다시 노출되는 회귀가 생긴다. **WHY**: 그래서 `appinstalled` 이벤트를 구독해 즉시 `setHidden(true)` + `pwa.everInstalled = 1` 을 동기로 set 한다.
- **`prompt()` 1회 소비**: BeforeInstallPromptEvent.prompt() 는 한 번만 호출 가능. 호출 후 `setDeferred(null)` 로 버튼을 숨기고, `userChoice` 가 "dismissed" 면 7일 dismiss 도 함께 적용해 사용자를 같은 prompt 로 괴롭히지 않는다.
- dismiss 시 `localStorage.setItem("pwa.banner.dismissedUntil", Date.now() + 7*86400_000)`.
- 위치: `/home` 상단 sticky 또는 첫 카드 위 한 칸. (정확한 디자인은 frontend-design 단계에서.)

**C3. `<OpenInAppModal />`**

- 가시 조건: `mode === "browser"` && `everInstalled === true` && **이번 세션에 한 번도 "웹으로 계속" 또는 "앱으로 열기" 를 누르지 않음**. (iOS storage 격리 가능성 때문에 실질적으로 이 모달은 Android 사용자에게만 노출됨 — §Known Platform Limits.)
- shadcn `<Dialog />` 기반. `onPointerDownOutside` / `onEscapeKeyDown` 모두 preventDefault → 백드롭 dim · non-click 강제. **WHY**: "선택 강제" 가 요구사항.
- 액션:
  - **"앱으로 열기"** — `writeSessionDismissed()` 를 먼저 호출한 뒤 `window.location.assign("/home")` 로 같은 URL 재진입. **WHY**: launch_handler 가 same-tab navigation 을 캡처하지 못해 그냥 새로고침으로 끝나면, 새로고침된 /home 에서 모달이 다시 뜨는 무한 루프가 발생. 세션 dismiss 를 먼저 set 해 같은 탭에선 한 번만 시도하고 끝낸다. 새 탭에서 매직링크를 다시 받으면 sessionStorage 가 비어 있으므로 다시 시도.
  - **"웹으로 계속"** — `sessionStorage.setItem("pwa.modal.thisSession", "dismissed")` 후 모달 닫기. 그 세션 동안 다시 안 뜸.
- **카피**: "iOS 라면 홈 화면 아이콘으로 다시 열어주세요" 같은 iOS 가정 문구는 사용하지 않는다 (어차피 iOS storage 격리로 모달 자체가 안 뜸). Android 관점 — "한 번만 앱으로 열면 다음부터 자동으로 앱이 열려요" 같은 카피가 더 정확.

**C4. `<PwaGate />`** (route-scoped)

- 위 3개를 받아 단순 분기만 한다. /home 외에는 마운트 안 함 (POC 단계).
- 서버에서는 항상 null 반환 (RSC 깜빡임 방지 — 첫 페인트에는 안 보이고, 클라이언트 hydrate 후 등장).

### manifest 변경

```json
{
  "launch_handler": { "client_mode": "navigate-existing" }
}
```

- `navigate-existing`: 기존 PWA 윈도우가 있으면 그 윈도우가 새 URL 로 **navigate**. 없으면 새 인스턴스를 띄우고 그 URL 로 진입. **WHY**: 매직링크 URL 은 `/auth/callback?code=...` — PWA 가 그 URL 로 navigate 해야 Supabase 코드 교환이 일어남. `focus-existing` 은 navigate 하지 않으므로 사용 불가.
- `capture_links` 는 **추가하지 않는다**. **WHY**: W3C 매니페스트 표준에서 빠진 키이고 Chromium origin trial 단계의 비표준 값들만 존재했다. Android 의 외부 링크 캡처는 launch_handler + OS 의 "Open in app" 휴리스틱이 처리하므로 매니페스트 추가 키 없이도 동작.
- iOS Safari 는 `launch_handler` 를 무시 (호환 키 — 에러 없음). 그 환경에선 OpenInAppModal 의 가이드 문구가 유일한 UX.

### 결정 사항 (모두 "왜" 동반)

- **PWA 판단은 클라이언트에서만**. **WHY**: standalone 감지가 서버에서 불가능 + 인증 회귀 위험을 격리.
- **콜백 라우트는 안 건드린다**. **WHY**: PWA UX 실험 도중 매직링크 인증이 깨지면 dogfood 자체가 막힌다.
- **everInstalled 는 영구, modal dismiss 는 세션, banner dismiss 는 7일**. **WHY**: 강도가 다른 세 시그널을 같은 수명으로 두면 한쪽이 다른 쪽을 가리는 회귀가 생긴다.
- **iOS 자동 전달은 시도하지 않는다**. **WHY**: Universal Links 같은 우회는 별도 앱 ID/도메인 검증 인프라가 필요하고 POC 범위를 크게 벗어남. 모달의 안내 문구로 처리.

## Alternatives Considered

1. **콜백 자체를 `page.tsx` 로 전환해 클라이언트에서 PWA 판단 후 라우팅**
   - 장점: 관심사가 한 파일에 모임.
   - 기각: 기존 `route.ts` 의 세션 교환 + onboarded 분기 로직과 충돌. 인증 회귀 위험 대비 이득이 작다.

2. **redirect query `?from=callback` 를 붙여 /home 진입 시 강제 모달 트리거**
   - 장점: "콜백 직후" 와 "일반 진입" 을 구분해 모달 노출 빈도를 줄일 수 있음.
   - 기각: 현재 채택안은 `everInstalled + browser` 이미 만족 시에만 모달이라 빈도 자체가 자연스럽게 낮다. 쿼리 추가로 인한 콜백 라우트 수정/공유 링크 오염 비용이 더 크다.

3. **Server Worker `Clients.matchAll` 로 이미 열린 PWA 창으로 raw 메시지 전달**
   - 장점: 진짜 "자동 전환" 에 가장 근접.
   - 기각: iOS 에선 동작 안 함 + 매직링크가 SW 가 통제하지 못하는 메일 클라이언트에서 시작됨. 비대칭 동작 + 디버깅 비용.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### 시나리오

**정상 케이스**

1. 신규 사용자 데스크톱 Chrome — 매직링크 클릭 → /home, 배너 노출, 설치 버튼 클릭 → 설치되고 standalone 진입, 배너 사라짐, `everInstalled=1`.
2. Android Chrome 에 PWA 설치된 사용자 — 매직링크 클릭 → 자동으로 PWA가 캡처 → standalone 으로 /home → 모달/배너 모두 안 뜸.
3. iOS Safari 에 홈 화면 추가한 사용자 — 매직링크 클릭 → Safari 로 열림 → /home, `everInstalled=1` 이미 set → 모달 노출 → "앱으로 열기" 안내 텍스트 + "웹으로 계속" 선택지.

**엣지 케이스**

4. 배너 dismiss 후 7일 내 재방문 → 배너 안 뜸, 8일째 다시 노출.
5. 모달 "웹으로 계속" 클릭 → 같은 탭에서 새로고침/이동 시 안 뜸, 새 탭에서 매직링크 재진입 시 다시 뜸.
6. localStorage 차단된 환경 (시크릿 모드) — `everInstalled` 가 매번 false → 모달 절대 안 뜸, 배너만 매번 뜸. 회귀 없음.
7. SSR 첫 페인트 — `<PwaGate />` 가 null 반환 → 모달/배너 깜빡임 없음, hydrate 후에만 등장.
8. 사용자가 매니페스트 변경 전 이미 PWA 깐 상태 — `everInstalled` 가 없어 첫 standalone 진입 시 한 번 set 되므로 두 번째 콜백부터 정상 동작.

**수동 검증**

- Chrome DevTools > Application > Manifest 로 `launch_handler.client_mode = "navigate-existing"` 인식 확인.
- DevTools 모바일 에뮬레이션 + "Add to Home Screen" 으로 standalone 시뮬레이션.
- 실기 (iOS Safari, Android Chrome) 1대씩 dogfood 확인 — 매직링크는 wjaden0107@gmail.com 테스트 계정 사용.

## Rollout

1. Spec 머지 → implementation plan (writing-plans 스킬) 작성.
2. Phase 1 — manifest 변경 + `useDisplayMode` 훅 + `<InstallBanner />`. 콜백 회귀 없음 확인.
3. Phase 2 — `<OpenInAppModal />` + `<PwaGate />` /home 결선.
4. Dogfood 1주 — 모달 노출 빈도가 짜증을 유발하면 dismiss 정책 (세션 → 24h) 재논의.

### 롤백

- `<PwaGate />` 마운트 한 줄을 `/home/page.tsx` 에서 제거하면 모든 PWA UX 비활성. 1 commit revert.
- manifest 변경은 별도 commit으로 분리해 두면 Android 자동 캡처만 끄고 UX 는 유지하는 부분 롤백도 가능.

## Known Platform Limits

본 design 의 한계 — 코드로 해결 불가, 별도 spec 또는 운영 결정 필요.

1. **iOS Safari standalone PWA 의 storage partition 격리**: iOS 16.4 이전엔 PWA 와 Safari 브라우저의 localStorage/sessionStorage/쿠키가 완전히 분리되고, 이후에도 부분 공유에 그친다. 결과:
   - `pwa.everInstalled` 가 PWA 안에서 set 돼도 Safari 브라우저에서 보이지 않을 수 있음 → **iOS 사용자에게 OpenInAppModal 이 사실상 안 뜸**.
   - 이 한계는 design 결함이 아니라 플랫폼 제약. iOS UX 는 InstallBanner 한 가지로 수렴.

2. **iOS Safari + PWA 의 매직링크 데드락**:
   - iOS 메일 앱은 매직링크를 항상 Safari 브라우저로 연다 (PWA 로 핸드오프 불가).
   - PWA 와 Safari 의 세션 쿠키가 격리되므로, Safari 에서 매직링크로 받은 세션은 PWA 아이콘으로 진입하면 보이지 않음.
   - 사용자: PWA 아이콘 탭 → 세션 없음 → /login → 매직링크 → Safari 로 열림 → 세션은 Safari 에만 → PWA 아이콘 탭 → 또 /login → … 무한 반복.
   - **결론**: iOS 사용자에게 매직링크는 "Safari 안에서 로그인 → 그 Safari 에서 홈 화면 추가 → 그 후엔 Safari 안에서만 사용" 패턴이 유일. PWA 안에서 매직링크 인증을 완료할 방법은 본 spec 으로 해결 불가.
   - 향후 결정: (a) iOS 사용자에게 처음부터 "Safari 에서 로그인하고 홈에 추가" 가이드, (b) OAuth/SIWA(Sign in with Apple) 같은 in-app 인증 방법 도입을 별도 spec 으로 검토.

3. **launch_handler 의 same-tab navigation 적용 범위 모호**: `navigate-existing` 이 "외부 trigger 로 들어온 navigation" 만 캡처하는지, 같은 탭의 `window.location.assign("/home")` 도 캡처하는지가 명세상 불분명. 후자가 트리거되지 않으면 OpenInAppModal 의 "앱으로 열기" 는 Android 에서도 사실상 그냥 새로고침으로 끝남. **검증**: Phase 2 dogfood Android 1대로 실측. 실패하면 버튼 카피를 "홈 화면 아이콘으로 다시 들어와 주세요" 로 변경하고 자동 navigate 자체를 제거하는 대안 spec 으로 후속.

## Out of scope

- iOS Universal Links 또는 별도 Native shell.
- PWA 설치율 분석 이벤트 — 본 spec 머지 후 별도 PR에서 `pwa_install_prompt_shown` · `pwa_install_accepted` · `pwa_open_in_app_clicked` 를 PRD §9.1 검토 후 추가.
- 데스크톱 PWA 의 별도 UX (현재 POC 는 모바일 PWA 우선).
- Push subscribe 흐름과의 결합 (별도 spec).
- iOS in-app 인증 (OAuth / SIWA) — §Known Platform Limits §2 의 후속 결정 사항.

## 용어집

- **capture_links**: 같은 origin 의 외부 링크를 설치된 PWA로 가로채는 manifest 키.
- **display-mode**: 브라우저가 페이지를 standalone / browser / fullscreen / minimal-ui 중 어떻게 렌더하는지를 나타내는 CSS 미디어 쿼리.
- **ever-installed 플래그**: localStorage `pwa.everInstalled` — 한 번이라도 standalone 으로 진입한 적이 있는지를 기록하는 추정 시그널.
- **launch_handler**: PWA가 새 URL을 받았을 때 새 윈도우를 띄울지 기존 윈도우로 포커스할지 정하는 manifest 키.
- **standalone**: PWA가 브라우저 chrome 없이 독립 윈도우에서 실행되는 상태.
