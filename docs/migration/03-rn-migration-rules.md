# fromwith RN MVP — Migration Rules (마이그레이션 규칙)

> **Author**: pistachio8 (PO) · **Date**: 2026-06-04 · **Status**: Draft v0.1
> **Stakeholders**: FE(RN) · BE(Supabase) · QA · AI 코딩 에이전트(Claude Code · Codex · Cursor)
>
> **Pre-read** (이 문서를 읽기 전에):
>
> - [00-rn-conversion-plan](./00-rn-conversion-plan.md) — *무엇을* 재사용/재작성하나(라우트·액션·재사용 매트릭스 인벤토리)
> - [01-rn-mvp-prd](./01-rn-mvp-prd.md) — RN MVP가 *무엇을* 만드나(P0 포팅 + P1 정산 + P2 자동검증)
> - [02-rn-migration-harness](./02-rn-migration-harness.md) — 기능 1건을 *어떻게* 반복 빌드·검증하나(루프 + eval 게이트)
> - [supabase-keys 규칙](../../.claude/rules/common/supabase-keys.md) — 신규 키 체계(`sb_publishable_*` / `sb_secret_*`). RN 환경변수 네이밍의 SoT(Single Source of Truth)
> - [AGENTS.md §3 가드레일](../../AGENTS.md) — RLS·secret·keyword freeze·analytics parity 등 절대 원칙
>
> **이 문서의 역할**: 00 plan이 *어떤 코드를 재작성하나*(인벤토리)라면, 이 문서는 **각 코드를 어떤 레이어 책임으로 재배치하고, 어떤 라이브러리·패턴으로 옮기는가**의 규칙 레퍼런스다. [harness §4 마이그레이션 루프](./02-rn-migration-harness.md)의 **porter 단계**(도메인 추출 + RN UI/route 작성 + 쓰기 경로 승격)가 기능마다 이 문서를 참조한다. 코드 변경은 없는 설계 문서다.

---

## 0. 기본 원칙

Next.js/PWA(Progressive Web App, 브라우저로 설치 가능한 웹 앱) 코드를 React Native(이하 RN)/Expo로 옮길 때는 **1:1 치환을 목표로 하지 않는다.** Next.js의 책임을 다음 다섯 레이어로 분해한 뒤 RN 구조에 맞게 **재배치**한다.

1. **Routing / Navigation** — 화면 이동·딥링크·인증 전후 분기
2. **Screen / UI Component** — 화면 단위 표현·인터랙션
3. **Data Fetching / Service Layer** — API 호출·서버 책임 분리
4. **Client State / Cache** — 클라이언트 상태·서버 응답 캐시
5. **Native Capability** — 카메라·푸시·저장소·딥링크 등 기기 기능

특히 App Router의 `page` · `layout` · Server Component · Route Handler · `metadata` · `next/image` · `next/link` 와 Web API(`window` · `document` · `localStorage` 등) 의존 코드는 **그대로 옮기지 않는다.**

### 0.1 with-key 불변 제약 (레이어 규칙보다 우선)

아래 4개는 어떤 레이어를 옮기든 **항상 먼저** 지킨다. 위반 가능성이 보이면 멈추고 확인한다([AGENTS.md §3](../../AGENTS.md)).

| 제약 | 내용 | 왜 |
| --- | --- | --- |
| **RLS(Row Level Security, 행 단위 접근 제어)** | RN client는 publishable key로 Supabase에 직접 접근한다. RLS가 **유일한 권한 방어선**이다. service-role/admin 결과를 앱에 노출하지 않는다. | anon/publishable 키는 클라이언트에 노출되므로 DB-level 권한 외에는 막을 수단이 없다 |
| **Secret 격리** | `sb_secret_*` · `OPENAI_API_KEY` · `VAPID_PRIVATE_KEY` 등 서버 전용 키는 **앱 번들에 절대 포함 금지**. RN은 `EXPO_PUBLIC_*` 공개값만 갖는다(§10). | 앱 번들은 디컴파일 가능 — 번들에 들어간 secret은 유출로 간주 |
| **Keyword pool freeze** | `src/lib/keywords/pool.ts`(v1.1, 2026-05-22 freeze)는 **그대로 재사용**. RN에서 값을 바꾸지 않는다. `KEYWORD_POOL_VERSION`을 `keywords_shown`·`action_logged` 이벤트에 계속 inject. | PRD §4.6 — 분석 편향 방지(데이터 일관성). 변경은 PO 승인 + VALIDATION 재논의 |
| **Analytics parity** | `AnalyticsEvent` 유니온은 PRD §9.1 이벤트 표와 1:1. RN client emitter와 server emitter가 **같은 Zod schema**(`src/lib/analytics/schema.ts`)로 검증된다. 임의 이벤트 추가 금지. | 분석 파이프라인 SoT는 PRD. 코드는 그 미러(§14) |

### 0.2 이 문서 사용법 (porter 절차)

기능 1건을 옮길 때:

1. **[§16 판단 기준](#16-마이그레이션-판단-기준-decision-tree)** 질문에 먼저 답한다(UI/서버/네이티브 책임 구분, secret 유무, 권한 차이 등).
2. 해당 기능이 건드리는 레이어(§1~§14)의 규칙을 적용한다.
3. **[§15 QA 체크](#15-qa-체크-기준)** 와 **[§17 eval 게이트](#17-eval-게이트-연결-harness-5)** 를 통과해야 "완료"로 인정한다.

---

## 0.3 권장 스택 + 결정 상태 (핵심)

스택을 한 표에 모은다. **상태** 열이 핵심이다 — `확정`은 PRD/harness가 이미 정한 규칙, `권장`은 이 문서가 제안하되 별도 산출물(ADR/spec)로 확정해야 하는 항목이다. porter는 `권장` 항목을 임의로 고정하지 말고, 해당 산출물이 나오기 전까지는 "권장안 따름 + 결정 필요" 주석을 코드/PR에 남긴다.

> 아래 "권장" 항목 다수는 [04-rn-architecture](./04-rn-architecture.md)에서 grill-me 인터뷰로 **구체 결정**(예: Kakao 네이티브 SDK, BFF=apps/web, `device_push_tokens` 신설, mobile-local 토큰)으로 확정됐다. 신규 RN 프로젝트 아키텍처 전체 청사진은 04를 참조.

> ADR(Architecture Decision Record, 되돌리기 비용 큰 결정 기록) vs spec(설계 결정) 구분은 [AGENTS.md §4](../../AGENTS.md) spec-required 경로 매핑을 따른다.

| 영역 | 권장 | 상태 | 근거 / 확정 산출물 |
| --- | --- | --- | --- |
| Framework | Expo | **확정** | PRD §6.1 · harness §3.2 |
| Navigation | Expo Router | **확정** | PRD §6.1. App Router 경험 재사용, React Navigation 위 파일 기반 라우팅 |
| Language | TypeScript | **확정** | 기존 스택 동일 |
| 모노레포 | `apps/mobile` + `packages/domain` | **확정** | harness §3.2. 도메인 "공유"가 드리프트 1차 방어선 |
| 쓰기 경로 | Supabase RPC 직접 호출 또는 BFF(Backend for Frontend) API | **확정** | PRD §6.1 · 00 plan §9. Server Action 승격 |
| 카메라/사진 처리 | `expo-image-picker` · `expo-camera` · `expo-image-manipulator` | **확정** | PRD §6.3 |
| Push | Expo Notifications(Expo push token) | **확정** | PRD §6.3 |
| Backend / Storage | Supabase 유지 + Supabase Storage(private bucket + signed URL) | **확정** | 00 plan §3.2. RLS·RPC가 SoT |
| **Server state** | **TanStack Query** | **권장 → spec** | RN out-of-the-box 지원. RSC 캐시 사고를 client cache로 단순화(§3·§12) |
| **Client state** | **Zustand** | **권장 → spec** | 경량 전역 UI 상태. Redux Toolkit은 POC에 과함(§12) |
| **Image 렌더** | **`expo-image` 우선** (정적 아이콘만 RN `Image`) | **권장 → spec** | 피드·인증 사진 성능·캐싱. `next/image` 최적화 손실 보완(§4) |
| **Styling** | **StyleSheet + design token 우선** (NativeWind는 대안, Tamagui는 장기 옵션) | **권장 → spec** | POC 디버깅 비용 최소화. 토큰 먼저 정의(§5) |
| **Form** | **react-hook-form + zod** (zod schema 재사용은 확정) | **권장 → spec** | 로그인·초대코드·프로필 입력. 단순 input 1~2개는 local state(§13) |
| **Token/세션 저장** | **`expo-secure-store`** | **권장 → spec** | 토큰류는 암호화 저장소 필수. AsyncStorage 금지(§6) |
| **일반 로컬 저장** | AsyncStorage (성능 필요 시 `react-native-mmkv` 도입) | **권장 → spec** | MMKV는 New Architecture 연동 이슈 가능 — 필요 시 도입(§6) |
| **배포** | EAS Build · EAS Update · TestFlight · Android internal testing | **권장 → spec** | dogfood는 정식 심사보다 internal 채널이 현실적(§9) |
| **Push token 테이블** | `device_push_tokens` 신설 또는 `push_subscriptions` 확장 | **권장 → ADR** | migration 경로 → ADR 필수. PRD §6.3·Q에 이미 flag(§8) |
| **데이터 모델 델타** | `point_ledger` · `settlements` · `action_logs` 검증 컬럼 | **확정 → ADR 필요** | PRD §6.2. 금전성·immutability 예외 → migration ADR |

**porter 1차 스택 (가장 현실적인 출발점):**

```txt
Expo + Expo Router
TanStack Query + Zustand
StyleSheet + design tokens
expo-image
expo-image-picker / expo-camera / expo-image-manipulator
expo-secure-store + AsyncStorage
Expo Notifications
EAS Build / EAS Update
Supabase (RPC/BFF + Storage + RLS)
react-hook-form + zod
```

**POC에 과한 선택 (초기 도입 금지):** 초기부터 Redux Toolkit · Tamagui 풀세팅 · MMKV 전면 도입 · React Navigation 직접 구성.

---

## 1. Routing / Navigation

웹 URL 중심 사고에서 **모바일 화면 흐름 중심** 사고로 전환하는 레이어다. 라우트 인벤토리·target route map은 [00 plan §10](./00-rn-conversion-plan.md)에 있으니 여기서는 변환 규칙만 정의한다.

| Next.js/PWA | RN/Expo | 마이그레이션 규칙 |
| --- | --- | --- |
| `next/link` | `expo-router`의 `Link` · `router.push` · `router.replace` | 단순 이동은 `Link`, 이벤트 기반 이동은 `router.push`, 로그인/온보딩 완료 등 뒤로가기 방지가 필요한 이동은 `router.replace` |
| App Router route segment | Expo Router file-based route | 기존 URL 구조를 최대한 유지하되 모바일 UX에 맞게 탭/스택으로 재설계 |
| `app/page.tsx` | `app/index.tsx` 또는 Screen | 화면 단위 이전 |
| `app/challenge/[id]/page.tsx` | `app/challenge/[id].tsx` 또는 `.../[id]/index.tsx` | 동적 파라미터는 Expo Router params로 |
| `layout.tsx` | `_layout.tsx` | Stack · Tabs · Drawer 네비게이터 구조로 변환 |
| Parallel/Intercepting Route | Modal Stack / presentation modal | 웹 모달 라우팅을 복제하지 말고 RN modal screen 패턴으로 재설계 |
| `not-found.tsx` | `+not-found.tsx` 또는 fallback screen | 미존재 라우트 처리 |

### 규칙

- 하단 탭, 인증 전/후 분기, 모달, 딥링크는 `_layout.tsx`에서 구조화한다.
- **with-key 딥링크 호환**: 기존 Kakao 초대 URL과 push `targetUrl`은 웹 path 기준이다([00 plan §5 리스크 "딥링크 호환"](./00-rn-conversion-plan.md)). 웹 path ↔ 앱 route 매핑 compatibility table을 유지하고, `fromwith://invite/<token>` 같은 scheme/universal link로 진입 가능해야 한다.
- 챌린지 상세의 feed/dashboard/info는 탭, action/pledge는 modal 또는 stack flow로 검토([00 plan §10](./00-rn-conversion-plan.md) 비고 참조).

---

## 2. Page / Screen 전환

`page.tsx`를 복사하지 않는다. **Screen → Container Hook → Presentational Component**로 분리한다.

| Next.js/PWA | RN/Expo | 마이그레이션 규칙 |
| --- | --- | --- |
| `page.tsx` | Screen | 화면 단위로 이전 |
| `layout.tsx` | Navigator Layout | 공통 UI보다 네비게이션 구조 중심 |
| Server Component | Screen + hook + service | 서버 주입 데이터를 클라이언트 fetch로 전환(§3) |
| Client Component | RN Component | 이벤트·상태·인터랙션 중심 |
| `loading.tsx` | Suspense fallback / local loading state | 화면별 skeleton·loading |
| `error.tsx` | Error Boundary / 화면 내 error state | RN은 화면별 에러 UI를 명시 |
| `metadata` | App config / native metadata | SEO 메타는 제거. 앱 이름·아이콘·스플래시·딥링크 설정으로 이동(§10) |

### 규칙

- 화면 진입 시 필요한 데이터는 client 상태/캐시 계층(§12)에서 관리한다.
- `window` · `document` · `localStorage` · `navigator` · `File` · `Blob` · DOM 이벤트 의존 코드는 RN 호환 API로 대체한다(§11).
- 서버 렌더링 전제 코드는 제거한다.

---

## 3. Server Component / Data Fetching

Server Component 안의 비즈니스 로직을 RN 화면으로 직접 옮기지 않는다. **service/repository 레이어로 분리** 후 client query로 호출한다.

| Next.js/PWA | RN/Expo (권장) | 마이그레이션 규칙 |
| --- | --- | --- |
| Server Component fetch | `services/*.ts` + **TanStack Query** | 데이터 접근을 service로 분리, 화면은 `useQuery`로 호출 |
| Server Action | Supabase RPC / BFF API / service function | 보안 로직은 서버 유지(00 plan §9 승격 매트릭스) |
| Route Handler | 기존 API 유지 또는 Supabase direct call | 단순 read는 direct call 가능. **결제/초대/관리자/검증은 서버 유지** |
| `cookies()` | SecureStore / Supabase session | 쿠키 인증 → 모바일 세션 저장(§6) |
| `headers()` | fetch header / device info | 필요한 값만 명시 전달 |
| `revalidate` · cache option | TanStack Query `staleTime` · `gcTime` · `invalidateQueries` | Next 캐시 정책을 client 캐시 정책으로 변환(§12) |

### 규칙 (with-key)

- **RLS 전제**: Supabase direct call이 가능해도 RLS를 전제로 한다. service-role key·관리자 API key·비공개 secret은 앱에 넣지 않는다.
- **AI 일기는 서버 전용**: `src/lib/ai/*`(OpenAI key, 4.5s 타임아웃, fallback, 본문 미로깅)는 RN으로 옮기지 않는다. RN은 `submitActionLog` API/RPC를 호출하고 **AI 본문·키를 직접 다루지 않는다**([00 plan §3.2](./00-rn-conversion-plan.md)).
- **자동검증·정산**: `point_ledger`·`settlements`·`action_logs` 검증 컬럼은 **서버 write 전용**(클라 INSERT/UPDATE 차단, PRD §6.2). RN은 결과를 read만 한다.
- 기존 Route Handler가 보안 경계 역할을 하면 유지한다(`revealAccountNumber`처럼 서버 전용인 액션은 RPC가 아니라 서버 API).

추천 service 구조:

```txt
src/
  features/
    challenge/
      api/      challengeService.ts     # Supabase RPC/BFF 호출
      hooks/    useChallengeQuery.ts     # TanStack Query
      components/ChallengeHeader.tsx
  shared/
    api/      supabase.ts httpClient.ts
```

---

## 4. Image / Media

`next/image`의 자동 최적화·lazy loading·responsive image를 RN에서 기대하지 않는다. 이미지 크기·캐싱·placeholder·실패 UI를 **명시적으로 구현**한다.

| 용도 | 권장 | 규칙 |
| --- | --- | --- |
| 피드·인증·썸네일 원격 이미지 | **`expo-image`** | 크로스플랫폼 고성능 렌더·캐싱·포맷 지원 |
| 단순 로컬 아이콘/정적 이미지 | RN `Image` 가능 | |
| `fill` layout | 부모 View + width/height/aspectRatio | RN은 명시적 크기 계산 필요 |
| `object-fit: cover` | `contentFit="cover"` / `resizeMode="cover"` | 비율 처리 명시 |
| blur placeholder | `expo-image` placeholder / blurhash | 로딩 UX 별도 구현 |
| 캐싱 정책 | `expo-image` cachePolicy + Supabase image transform | |

### 규칙 (with-key 사진 인증 파이프라인)

- **인증 사진은 핵심 기능**이다. `선택 → 크롭/압축 → 업로드 → 미리보기 → 실패 재시도` 흐름을 별도 유스케이스로 설계한다.
- 기존 정책 **5MB / 1920px clamp / JPEG 0.85**(`src/lib/image/prepare-upload.ts`·`resize-to-jpeg.ts`)는 유지하되, Browser `File`·`canvas`·`createImageBitmap`·`heic2any` 구현은 **`expo-image-manipulator`/Asset으로 교체**한다([00 plan §3.3](./00-rn-conversion-plan.md)).
- Supabase Storage는 **private bucket + pre-signed URL만**(public 버킷 금지, AGENTS.md §Supabase). RN은 signed URL 수명·이미지 cache expiration을 별도 설계한다([00 plan §5 리스크](./00-rn-conversion-plan.md)).
- EXIF 회전, HEIC/JPEG, Android/iOS 파일 URI 차이를 실기기 샘플로 검증한다.

---

## 5. Styling

웹 CSS를 RN StyleSheet로 기계적으로 번역하지 않는다. **디자인 토큰을 먼저 정의**한 뒤 컴포넌트를 옮긴다.

| Next.js/PWA | RN/Expo | 규칙 |
| --- | --- | --- |
| CSS Module | `StyleSheet` | 정적 스타일 중심이면 기본 선택지 |
| Tailwind CSS | NativeWind(대안) | 기존 Tailwind 토큰을 많이 재사용하고 싶을 때 |
| shadcn/ui | 직접 구현 / Tamagui(장기) | 웹 컴포넌트 그대로 이전 불가 |
| CSS variable | theme object / design token | 색상·spacing·radius·typography를 JS token으로 |
| media query | `useWindowDimensions` / responsive util | 모바일 화면 기준 재설계 |
| hover style | press/focus/active state | 터치 인터랙션으로 변경 |
| fixed/sticky | absolute / header / tab navigator | 네이티브 레이아웃 방식 |

### 규칙

- `px`·`rem`·`vw`·`vh` 기준을 RN의 dp·flex·safe area 기준으로 바꾼다.
- **Safe Area · 키보드 회피 · 스크롤 영역 · 하단 CTA 위치**를 모든 주요 화면에서 검증한다(§13·§15).
- 도입 순서(권장): `StyleSheet + tokens` → (개발 속도/일관성 부족 시) `NativeWind` → (웹/RN 공통 디자인 시스템 필요 시) `Tamagui`. **상태: 권장 → spec**(§0.3).

---

## 6. Storage / Auth Session

AsyncStorage는 **암호화 저장소가 아니다.** 토큰·민감정보를 여기 저장하지 않는다.

| 저장 대상 | 권장 | 규칙 |
| --- | --- | --- |
| access token / refresh token | **`expo-secure-store`** | 기기 내 암호화 저장. 탈취 리스크 최소화 |
| Supabase session | SecureStore 기반 storage adapter | RN용 Supabase Auth storage adapter 명시 구성 |
| 온보딩 완료 여부 · UI preference | AsyncStorage (또는 MMKV) | 민감하지 않은 값 |
| draft/form 임시 캐시 | AsyncStorage / MMKV | 복구가 필요한 입력값 |
| 피드 임시 캐시 | TanStack Query persist + MMKV(선택) | |
| 대량/고성능 key-value | `react-native-mmkv` (필요 시) | New Architecture 연동 이슈 가능 — 필요할 때 도입 |

### 규칙 (with-key)

- **Supabase 키 네이밍은 신규 체계 고정**([supabase-keys 규칙](../../.claude/rules/common/supabase-keys.md)). RN env는 `EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(`sb_publishable_*`)만 갖는다. `sb_secret_*`는 **앱에 절대 포함 금지**. 레거시 `*_ANON_KEY`/`*_SERVICE_ROLE_KEY` 명칭은 사용하지 않는다.
- **Kakao OAuth / magic link**: 쿠키·웹 callback 기반 구현(`src/lib/supabase/auth.ts`·`require-user.ts`·`with-user.ts`)은 폐기하고 Expo AuthSession + deep link recovery로 재작성한다([00 plan §3.3](./00-rn-conversion-plan.md)).
- **앱 재설치 · 로그아웃 · 토큰 만료 · refresh 실패** 시나리오를 별도 QA 케이스로 둔다(§15). 로그아웃 시 SecureStore의 민감 데이터를 제거한다.

---

## 7. Camera / File / Upload

사진 인증은 웹 `<input type=file>` 대체가 아니라 **네이티브 촬영/선택 플로우로 다시 설계**한다.

| 용도 | 권장 |
| --- | --- |
| 갤러리 선택 | `expo-image-picker` |
| 앱 내 직접 촬영 | `expo-camera` |
| 압축/리사이즈/회전 보정 | `expo-image-manipulator` |
| 업로드 | Supabase Storage / API FormData (URI/mime/name 명시) |
| 권한 관리 | Expo permission API + 설정 앱 이동 안내 |

### 규칙

- 권한 요청 **시점**, 권한 **거부 UI**, 설정 앱 이동 안내를 반드시 포함한다(iOS/Android 권한 UX 분리).
- 업로드 전 이미지 압축, 파일 크기 제한(5MB, §4), 네트워크 실패 재시도 정책을 둔다.
- RN은 파일 객체 대신 **local uri 기반**으로 처리한다(`File`/`Blob` 경계 제거).
- "촬영 인증"이 핵심이면 `expo-image-picker`만으로 부족하다 — `expo-camera` 별도 플로우를 설계한다.

---

## 8. Push Notification

Web Push 구독 모델을 그대로 쓰지 않는다. **토큰 저장 모델 · 앱 상태별 수신 · 알림 클릭 딥링크**까지 함께 설계한다.

| Next.js/PWA | RN/Expo | 규칙 |
| --- | --- | --- |
| Web Push subscription | Expo push token | `PushManager`/VAPID/p256dh/auth → Expo token |
| Service Worker push handler | notification received/response listener | foreground/background/killed 상태별 처리 |
| notification click URL | Expo Router deep link | 알림 클릭 시 특정 Screen 이동(§1) |
| browser permission | iOS/Android native permission | 권한 UX 분리 |

### 규칙 (with-key)

- **토큰 테이블은 ADR 대상**(상태: 권장 → ADR). `device_push_tokens` 신설 또는 `push_subscriptions` 확장([PRD §6.3](./01-rn-mvp-prd.md)). 권장 shape:

  ```txt
  device_push_tokens
  - id
  - user_id
  - device_id
  - expo_push_token
  - platform: ios | android
  - app_version
  - last_seen_at
  - disabled_at
  ```

- 사용자 1명이 여러 기기를 가질 수 있으므로 `user_id × device_id` 매핑을 둔다.
- 토큰 갱신·로그아웃·앱 재설치 시 토큰 무효화 정책을 둔다.
- 기존 dispatch 로직(`src/lib/push/dispatch.ts` — 수신자 선정·quiet hours·dedup·event logging)은 유지하고 **sender만 Web Push → Expo push로 교체**한다([00 plan §3.2](./00-rn-conversion-plan.md)).
- start/deadline/friend/kudos 알림을 **실기기에서** foreground/background/killed 각각 테스트한다(§15·§17).

---

## 9. PWA Install / Distribution

Expo 프로젝트이므로 EAS(Expo Application Services) 기준으로 배포 채널을 재설계한다.

| PWA | RN/Expo | 규칙 |
| --- | --- | --- |
| Vercel preview | Expo Go / Dev Build | 개발 중 확인 |
| PWA install prompt | TestFlight / Android internal testing | dogfood 배포 |
| Service Worker update | EAS Update | 빠른 JS 수정 배포 |
| Production deploy | EAS Build → App Store / Play Store | 정식 배포 |
| Web URL 공유 | Universal Link / App Link / deep link | 초대 링크 유지 |

### 규칙

- **dogfood 단계는 `TestFlight + Android internal testing + EAS Update`** 조합이 현실적이다(정식 심사 대기 회피). **상태: 권장 → spec**.
- 초대 링크는 앱 **미설치/설치** 상태를 모두 고려한다. 미설치 사용자는 설치 페이지로 보내고, 설치 후 초대 컨텍스트가 복구되어야 한다(§1 딥링크, [00 plan §8 goal 4 invite deep link PoC](./00-rn-conversion-plan.md)).
- PWA 설치 유도 문구·`manifest.json`·`service-worker.js`는 제거하고 앱 설치/테스트 참여 플로우로 대체한다([00 plan §4 "Browser PWA"](./00-rn-conversion-plan.md)).

---

## 10. Environment / Config

공개 가능한 값과 비밀 값을 명확히 분리한다.

| Next.js/PWA | RN/Expo | 규칙 |
| --- | --- | --- |
| `.env.local` | Expo env / app config | 공개/비밀 분리 |
| `NEXT_PUBLIC_*` | `EXPO_PUBLIC_*` | **앱 번들에 포함되어도 되는 값만** |
| server-only env | 서버 API / Supabase Edge Function | 앱 포함 금지 |
| `next.config.js` | `app.json` / `app.config.ts` | 앱 이름·scheme·권한·아이콘·splash |
| Vercel env | EAS env / CI secret | 빌드 환경 별도 구성 |

### 규칙

- `EXPO_PUBLIC_*`는 **클라이언트에 노출되는 값**으로 간주한다. secret key·service role key·관리자 키는 넣지 않는다(§0.1).
- 딥링크 scheme, bundle identifier, package name은 **초기에 확정**한다(변경 비용 큼).
- 새 env 추가 시 `.env.example` 주석 동기화(웹 규칙과 동일 원칙).

---

## 11. Web API 의존성 제거

웹 전용 API는 마이그레이션 **전에 목록화**한다. RN 미지원 API는 polyfill보다 **네이티브 방식으로 재설계**한다.

| Web API | RN/Expo 대체 |
| --- | --- |
| `window` · `document` | 사용 금지, 플랫폼 유틸로 대체 |
| `navigator.userAgent` | `expo-device` · `Platform` |
| `localStorage` | AsyncStorage / SecureStore(§6) |
| `URL.createObjectURL` | local uri 기반 처리 |
| `IntersectionObserver` | `FlatList` `onEndReached` / visibility 이벤트 |
| `ResizeObserver` | `onLayout` · `useWindowDimensions` |
| Service Worker | native background / notification / update 체계 |
| Clipboard API | `expo-clipboard` |
| Web Share API | `expo-sharing` / `Share` |
| IndexedDB(알림센터) | RN 로컬 저장소 또는 서버 notification table |

### 규칙

- 무한 스크롤·이미지 lazy loading·viewport 감지는 **`FlatList` 중심**(필요 시 `FlashList`)으로 재구성한다.
- 알림센터(`src/lib/notifications/store.ts`, IDB write)는 RN storage로 재현하거나 서버 notification table로 전환한다([00 plan §4](./00-rn-conversion-plan.md)).

---

## 12. State / Cache

서버 캐시와 클라이언트 캐시를 **혼동하지 않는다.** RSC fetch 캐시 사고를 버리고 client cache로 단순화한다.

| Next.js/PWA | RN/Expo (권장) | 규칙 |
| --- | --- | --- |
| RSC fetch cache / `revalidate` | **TanStack Query** cache (`staleTime`·`gcTime`·invalidation) | 화면 단위 client cache |
| Router Cache | Navigation state | 동일 개념으로 보지 않는다 |
| Server prefetch + Hydration | initial query / optimistic loading | 모바일은 진입 후 fetch가 기본 |
| React Context | Context / **Zustand** | 전역성 기준으로 재선택 |
| URL search params state | route params + local state | 모바일 화면 상태로 재설계 |

### 규칙

| 상태 종류 | 권장 |
| --- | --- |
| 서버 데이터 | TanStack Query |
| 로그인 유저의 가벼운 전역 UI 상태 | Zustand |
| 모달 · 임시 플래그 · selected tab | Zustand 또는 local state |
| 복잡한 도메인 이벤트/대규모 앱 | Redux Toolkit 고려(현재 POC엔 과함) |

- query key 규칙을 정한다(리스트/상세/프로필/그룹/인증).
- **invalidate 규칙 문서화**: 사진 업로드 후 피드 갱신, 챌린지 인증 후 상세 갱신, 정산 후 잔액 갱신 등.
- 오프라인/느린 네트워크에서 보여줄 stale data 정책을 정한다.
- **상태: TanStack Query · Zustand 모두 권장 → spec**(§0.3).

---

## 13. Form / Keyboard UX

Next.js/PWA가 HTML form·browser validation에 기대던 부분은 RN에서 **직접 처리**한다.

| Next.js/PWA | RN/Expo (권장) | 규칙 |
| --- | --- | --- |
| HTML form | controlled input 또는 **react-hook-form** | 제출 이벤트 직접 구현 |
| zod schema | **zod 유지** | `src/lib/validators/*`를 그대로 재사용(확정) |
| browser validation | zod + form error UI | validation 직접 구현 |
| input type email/number | `keyboardType` · `textContentType` · `autoComplete` | 모바일 키보드 타입 지정 |
| submit button | `Pressable` / `Button` | loading/disabled 상태 명시 |
| viewport keyboard issue | `KeyboardAvoidingView` / `ScrollView` (필요 시 `react-native-keyboard-controller`) | 키보드 회피 레이아웃 필수 |

### 규칙

- 로그인·초대 코드 입력·프로필 수정 화면은 **키보드 회피 QA 필수**(§15). iOS/Android 키보드 높이·safe area 차이를 모두 확인한다.
- 입력 화면의 하단 CTA는 키보드에 가려지지 않아야 한다.
- 단순 input 1~2개면 local state로 충분하다. `react-hook-form` 도입은 입력 화면 복잡도 기준으로 결정한다. **상태: 권장 → spec**.

---

## 14. Analytics / 이벤트 (with-key 추가 레이어)

ChatGPT 원본에 없던 with-key 필수 레이어다. 분석 이벤트는 RN 전환의 **숨은 회귀 지점**이다 — 화면이 동작해도 이벤트가 빠지면 분석 파이프라인이 조용히 깨진다.

| Next.js/PWA | RN/Expo | 규칙 |
| --- | --- | --- |
| `track.ts` (service-role insert) | `/events` API 또는 RLS-safe insert helper | **RN client 직접 호출 금지** — service-role을 앱에 노출 못 함 |
| server emitter | server emitter 유지 | 동일 Zod schema로 검증 |
| `AnalyticsEvent` 유니온 | 변경 없이 재사용 | PRD §9.1과 1:1, 임의 추가 금지(PO 승인 필요) |

### 규칙 (with-key)

- `src/lib/analytics/schema.ts`(이벤트 shape SoT)와 `src/lib/analytics/track.ts`를 그대로 옮기지 말고, **RN client emitter와 server emitter가 같은 schema로 검증**되게 한다([00 plan §3.2](./00-rn-conversion-plan.md)).
- `keywords_shown`·`action_logged`에 `KEYWORD_POOL_VERSION` inject를 **유지**한다(freeze 정책 marker, §0.1).
- 신규 이벤트(`settlement_triggered`·`auto_verify_result` 등 PRD §6.4 후보)는 PO 승인 + spec 후 union에 추가한다(AGENTS.md §AnalyticsEvent).

---

## 15. QA 체크 기준

마이그레이션된 화면은 다음을 통과해야 한다(§17 eval 게이트의 수동 보강).

- [ ] iOS/Android에서 화면 진입 가능
- [ ] 뒤로가기(iOS 제스처 + **Android 물리 back 버튼**) 자연스러움
- [ ] 로딩 / 에러 / 빈 상태가 있음
- [ ] 네트워크 실패 시 복구 가능
- [ ] 이미지 로딩 실패 UI가 있음
- [ ] 키보드가 input/CTA를 가리지 않음 · safe area 침범 없음
- [ ] 앱 재시작 후 인증 상태 유지 · 로그아웃 후 민감 데이터 제거
- [ ] 알림 클릭 시 의도한 화면으로 이동
- [ ] 초대 링크가 앱 설치/미설치 상태에서 모두 동작
- [ ] 사진 업로드 실패/재시도 가능 (EXIF/HEIC/URI 차이 검증)
- [ ] iOS 권한 거부/재요청 UX 확인
- [ ] (with-key) 정산·잔액 표시가 `point_ledger` SUM과 일치, 자동검증 status가 서버 값과 일치

---

## 16. 마이그레이션 판단 기준 (decision tree)

기능을 옮길 때마다 먼저 답한다. 답이 모이면 적용할 레이어(§1~§14)가 정해진다.

1. 이 코드는 **UI 책임**인가, **서버 책임**인가, **네이티브 기능 책임**인가? → §2 / §3 / §7·§8
2. 웹 브라우저 API에 의존하는가? → §11에서 대체 확인
3. 앱에 포함되면 안 되는 **secret**이 있는가? → §0.1·§10 (있으면 서버에 격리)
4. **RLS로 충분한가, 서버 경계가 필요한가?** → §3 (결제/초대/관리자/검증은 서버 유지)
5. 모바일 UX에서 같은 흐름이 자연스러운가? → §1·§5
6. iOS/Android **권한 차이**가 있는가? → §7·§8
7. 오프라인/느린 네트워크에서 어떻게 동작해야 하는가? → §12
8. 앱 재시작 후 **상태가 유지**되어야 하는가? → §6
9. **딥링크/알림 클릭**으로 진입할 수 있어야 하는 화면인가? → §1·§8
10. (with-key) 이 변경이 **데이터 모델/마이그레이션**을 건드리는가? → ADR 필요(§0.3)
11. (with-key) 분석 **이벤트**가 걸려 있는가? → §14 parity 확인

---

## 17. eval 게이트 연결 (harness §5)

이 규칙을 따라 옮긴 결과는 **글로 고정된 기준**으로 회귀 검증해야 "완료"다([harness §5 보존 eval](./02-rn-migration-harness.md)).

- **보존 eval (regression, pass^3 = 100%)**: 도메인 규칙·UX 의도가 포팅 후에도 동일한가. 예: 벌금 누적·정산 분배·done day 산정·키워드 버전 inject가 PWA와 동일.
- **capability eval (pass@3 ≥ 90%)**: 새 RN 기능이 동작하는가. 예: 사진 선택→압축→업로드→AI 일기→feed 반영 1회 성공.
- porter는 기능 1건을 옮긴 뒤 §15 QA + eval task([harness §5.4 템플릿](./02-rn-migration-harness.md))를 돌리고 `evals/results/agent-results.json`의 `runs[]`에 append한다(append-only).

> **왜 분리**: 화면이 *동작*하는 것과 *의도대로* 동작하는 것은 다르다(harness §1-②). 이 규칙 문서는 "어떻게 옮기나", eval 게이트는 "옳게 옮겼나"를 담당한다.

---

## 용어집

- **ADR**: Architecture Decision Record — 되돌리기 비용이 큰 결정을 보존하는 짧은 기록(`docs/adr/`)
- **BFF**: Backend for Frontend — 프론트 전용 서버 API 계층(여기선 RN ↔ Supabase 사이 보안 경계)
- **dogfood**: 팀이 직접 제품을 써보며 검증하는 단계
- **EAS**: Expo Application Services — Expo의 빌드·업데이트·배포 클라우드(EAS Build / EAS Update)
- **Expo Router**: Expo의 파일 기반 라우팅. React Navigation 위에 구성되며 typed route·deep link 지원
- **MMKV**: `react-native-mmkv` — 고성능 네이티브 key-value 저장소
- **OAuth**: 외부 인증 위임 프로토콜(여기선 Kakao 로그인)
- **PWA**: Progressive Web App — 브라우저로 설치 가능한 웹 앱(현재 fromwith의 형태)
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어. Supabase에서 활성화
- **RN**: React Native
- **RSC**: React Server Component — 서버에서 렌더되는 React 컴포넌트
- **SecureStore**: `expo-secure-store` — 기기 내 암호화 저장소(토큰류용)
- **SoT**: Single Source of Truth — 중복 없이 기준으로 삼는 단일 원본
- **TanStack Query**: 서버 상태(원격 데이터) 관리·캐시 라이브러리(구 React Query)
- **Zustand**: 경량 클라이언트 상태 관리 라이브러리
