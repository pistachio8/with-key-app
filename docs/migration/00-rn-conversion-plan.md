# Expo RN Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This document is an analysis and migration plan only; do not edit app code from this document without a follow-up implementation request.

**Goal:** 현재 Next.js PWA를 Expo React Native 앱으로 전환하기 위한 기능 분류, 재사용 경계, 단계별 실행 순서와 완료 조건을 정의한다.

**Architecture:** Supabase Postgres/Auth/Storage/RLS와 서버 전용 AI/Push/cron 책임은 우선 유지하고, 모바일 클라이언트만 Expo Router 기반 RN 앱으로 병행 구축한다. 기존 Server Action은 RN에서 직접 호출할 수 없으므로 Phase별로 Supabase RPC 또는 명시적 BFF API 계약으로 승격한다. PWA는 전환 기간 동안 invite/OG/share fallback과 웹 리다이렉트 호환을 위해 유지한다.

**Tech Stack:** Expo SDK + React Native + Expo Router, TypeScript, Supabase JS, Zod, Expo Notifications, Expo ImagePicker/ImageManipulator, Expo SecureStore 또는 AsyncStorage, 기존 Supabase migrations/RLS/RPC.

---

## 0. 분석 기준

- 기준일: 2026-06-01
- 기준 브랜치: `feat/new-challenge-sign-push`
- 코드 변경 범위: 없음. 이 문서는 `docs/migration/00-rn-conversion-plan.md` 신규 문서다.
- 주요 근거:
  - [`docs/PRD.md`](../PRD.md)
  - [`docs/BE_SCHEMA.md`](../BE_SCHEMA.md)
  - [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)
  - 실제 라우트: `src/app/**/page.tsx`, `src/app/**/route.ts`, `src/app/**/route.tsx`
  - 공용 도메인 로직: `src/lib/**`
  - PWA 플랫폼 코드: `public/manifest.json`, `public/service-worker.js`, `src/components/pwa-register.tsx`
  - Expo/Supabase 공식 문서: Expo Router, Expo Notifications, Expo ImagePicker, Expo SecureStore, Supabase React Native Auth

## 1. 현재 라우트 목록

### 1.1 User-facing pages

| URL                         | 현재 파일                                                | 현재 책임                                                       | RN 전환 분류                                                           |
| --------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `/`                         | `src/app/page.tsx`                                       | 인증 사용자 `/home`, 미인증 사용자 `/login` 리다이렉트          | RN deep link entry와 auth gate로 재작성                                |
| `/login`                    | `src/app/(auth)/login/page.tsx`                          | Kakao OAuth/매직링크 로그인, 인앱브라우저 가드                  | 네이티브 OAuth + deep link callback으로 재작성                         |
| `/invite/[token]`           | `src/app/(auth)/invite/[token]/page.tsx`                 | 익명 초대 preview, 만료/정원 상태, 로그인/수락 CTA, OG metadata | RN invite deep link 화면으로 재작성. 웹 OG fallback은 유지             |
| `/home`                     | `src/app/(app)/home/page.tsx`                            | 홈, 진행 챌린지, 미서명 배너, 통계, 정산 대기, PWA gate         | RN Home screen으로 재작성                                              |
| `/challenge/new`            | `src/app/(flow)/challenge/new/page.tsx`                  | 챌린지 생성 form, owner group 선택/가드                         | RN flow screen으로 재작성                                              |
| `/challenge/new/done/[id]`  | `src/app/(flow)/challenge/new/done/[id]/page.tsx`        | 생성 직후 초대 URL 공유 sheet                                   | RN share sheet flow로 재작성                                           |
| `/challenge/[id]`           | `src/app/(app)/challenge/[id]/(tabs)/page.tsx`           | 챌린지 feed tab, query 기반 dashboard/info redirect, feed read  | RN tab screen으로 재작성                                               |
| `/challenge/[id]/dashboard` | `src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx` | 챌린지 dashboard tab                                            | RN tab screen으로 재작성                                               |
| `/challenge/[id]/info`      | `src/app/(app)/challenge/[id]/(tabs)/info/page.tsx`      | 챌린지/그룹 정보, 초대, 정산 계좌                               | RN tab screen으로 재작성                                               |
| `/challenge/[id]/action`    | `src/app/(app)/challenge/[id]/action/page.tsx`           | 사진 인증, 키워드/직접일기, AI 생성, 제출                       | 네이티브 camera/library/upload flow로 재작성                           |
| `/challenge/[id]/pledge`    | `src/app/(app)/challenge/[id]/pledge/page.tsx`           | 서약서 서명, welcome banner, pending pledge gate                | RN pledge screen으로 재작성                                            |
| `/challenge/[id]/recap`     | `src/app/(app)/challenge/[id]/recap/page.tsx`            | 종료 정산, 사진 갤러리, 공유 이미지/영상                        | RN recap screen으로 재작성. 이미지/영상 생성 endpoint는 우선 서버 유지 |
| `/group/[id]`               | `src/app/(app)/group/[id]/page.tsx`                      | 그룹 상세, 멤버, 계좌, 챌린지 목록                              | RN group detail screen으로 재작성                                      |
| `/me`                       | `src/app/(app)/me/page.tsx`                              | 프로필, 알림 설정, 챌린지 요약, 약관, 로그아웃                  | RN profile/settings screen으로 재작성                                  |
| `/me/challenges`            | `src/app/(app)/me/challenges/page.tsx`                   | 내 챌린지 관리, owner/member/closed 분리                        | RN management screen으로 재작성                                        |
| `/notifications`            | `src/app/(app)/notifications/page.tsx`                   | IndexedDB 기반 알림 센터                                        | RN local DB 또는 Supabase-backed notification center로 재작성          |
| `/legal/privacy`            | `src/app/(app)/legal/privacy/page.tsx`                   | 개인정보처리방침                                                | RN WebView/static screen 또는 웹 링크 유지                             |
| `/legal/terms`              | `src/app/(app)/legal/terms/page.tsx`                     | 이용약관                                                        | RN WebView/static screen 또는 웹 링크 유지                             |

### 1.2 Legacy redirect pages

| URL          | 현재 파일                          | 현재 동작                                                          | RN 처리                                    |
| ------------ | ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `/action`    | `src/app/(app)/action/page.tsx`    | active challenge가 있으면 `/challenge/[id]/action`, 없으면 `/home` | RN에서는 제거. deep link 호환 alias만 유지 |
| `/feed`      | `src/app/(app)/feed/page.tsx`      | active challenge가 있으면 `/challenge/[id]`, 없으면 `/home`        | RN에서는 제거. deep link 호환 alias만 유지 |
| `/pledge`    | `src/app/(app)/pledge/page.tsx`    | pending pledge가 있으면 `/challenge/[id]/pledge`, 없으면 `/home`   | RN에서는 제거. deep link 호환 alias만 유지 |
| `/recap`     | `src/app/(app)/recap/page.tsx`     | 최신 recap이 있으면 `/challenge/[id]/recap`, 없으면 `/home`        | RN에서는 제거. deep link 호환 alias만 유지 |
| `/group/new` | `src/app/(app)/group/new/page.tsx` | `/challenge/new` redirect                                          | RN에서는 제거                              |
| `/settings`  | `src/app/(app)/settings/page.tsx`  | `/me` redirect                                                     | RN에서는 제거                              |

### 1.3 Route handlers, metadata, PWA endpoints

| URL                                | 현재 파일                                           | 현재 책임                                                          | RN 전환 분류                                              |
| ---------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| `/auth/callback`                   | `src/app/auth/callback/route.ts`                    | Supabase OAuth callback, invite 자동 수락, signup/invite analytics | RN native deep link callback으로 대체. 웹 fallback은 유지 |
| `/auth/dev-login`                  | `src/app/auth/dev-login/route.ts`                   | 개발 로그인 callback                                               | RN dev build 전용 auth shortcut로 별도 설계               |
| `/api/me`                          | `src/app/api/me/route.ts`                           | 현재 user id/email JSON                                            | RN에서는 Supabase client로 직접 대체 가능                 |
| `/api/push`                        | `src/app/api/push/route.ts`                         | push callback placeholder/health                                   | Expo push token 등록 API로 재설계 필요                    |
| `/api/cron/deadline-push`          | `src/app/api/cron/deadline-push/route.ts`           | deadline push 발송, active 만기 auto-close                         | 서버 유지. Expo token 대상 발송으로 내부 교체             |
| `/api/cron/cleanup-kudos-push-log` | `src/app/api/cron/cleanup-kudos-push-log/route.ts`  | `kudos_push_log` TTL cleanup                                       | 서버 유지                                                 |
| `/api/og/recap-card`               | `src/app/api/og/recap-card/route.tsx`               | recap 공유 이미지 생성                                             | 우선 서버 유지. RN은 파일 fetch 후 native share           |
| `/api/share/recap-clip`            | `src/app/api/share/recap-clip/route.ts`             | recap MP4 clip 생성                                                | 우선 서버 유지. RN은 파일 fetch 후 native share           |
| `/invite/[token]/opengraph-image`  | `src/app/(auth)/invite/[token]/opengraph-image.tsx` | 초대 OG 이미지                                                     | 웹 공유 fallback용으로 유지                               |
| `/manifest.json`                   | `public/manifest.json`                              | PWA install metadata                                               | RN에서는 폐기. 앱 아이콘/app.json으로 재정의              |
| `/service-worker.js`               | `public/service-worker.js`                          | Web Push 수신, 알림 IDB 저장, notification click navigation        | RN에서는 폐기. Expo Notifications handler로 재작성        |

## 2. 핵심 기능 목록

| 기능                   | 현재 구현 근거                                                                                 | RN 전환 대상                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 인증/세션              | `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/auth/*`, `/auth/callback` | Supabase RN auth client, secure persisted session, OAuth deep link  |
| 초대 링크/가입         | `/invite/[token]`, `accept_invite` RPC, `fetchInvitePreview`, `AcceptForm`                     | Universal/App Links, invite preview, login 후 자동 수락             |
| 홈/앱 셸               | `(app)/layout.tsx`, `AppHeader`, `FabMenu`, `/home`                                            | Expo Router root layout, safe area, header, FAB/CTA navigation      |
| 챌린지 생성            | `/challenge/new`, `createChallenge`, `create_challenge` RPC                                    | RN form + RPC/API mutation                                          |
| 서약서/시작            | `/challenge/[id]/pledge`, `signPledge`, `start_challenge_with_signed_participants` RPC         | RN pledge UI + mutation                                             |
| 그룹/계좌              | `/group/[id]`, `updateGroupAccount`, `renameGroup`, `deleteGroup`, `createInvite`              | RN group screens + encrypted account mutations                      |
| 인증 기록              | `/challenge/[id]/action`, `submitActionLog`, `action_logs`, Storage `action-photos`            | Native image picker/manipulation/upload + server AI write path      |
| 키워드/AI 일기         | `src/lib/keywords/*`, `src/lib/ai/*`, `actionLogInputSchema`                                   | Keyword logic reusable. OpenAI call remains server-only             |
| 피드/대시보드/정보 탭  | `/challenge/[id]`, `/dashboard`, `/info`, `fetchChallengeFeed`, `fetchChallengeDetail`         | RN challenge tab navigator + read queries                           |
| Kudos                  | `toggleKudos`, `kudosInputSchema`, `kudos` table                                               | RN optimistic toggle + same backend contract                        |
| Push/알림 설정         | `src/lib/push/*`, `push_subscriptions`, `notification_prefs`, `/me`                            | Expo Notifications token model + revised token table/API            |
| 알림 센터              | `service-worker.js`, `src/lib/notifications/store.ts`, `/notifications`                        | RN local SQLite/AsyncStorage or server notification table           |
| 정산/recap/share       | `/challenge/[id]/recap`, `fetchRecap`, `fetchChallengePhotos`, OG/clip routes                  | RN UI rewrite, share asset generation initially server-backed       |
| Analytics              | `src/lib/analytics/schema.ts`, `track.ts`, `events` table                                      | Event schema reusable. client/server emitters need RN-safe wrappers |
| Legal/profile/settings | `/me`, `/legal/*`                                                                              | Native settings screens or WebView-backed legal pages               |

## 3. 재사용 가능한 타입/API/비즈니스 로직

### 3.1 거의 그대로 재사용

| 경로                                                                               | 재사용 내용                                                                               | 주의                                                              |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/lib/validators/challenge.ts`                                                  | 챌린지 입력/상태 Zod schema, `ChallengeInput`, `ChallengeStatus`                          | RN form validation에 그대로 사용 가능                             |
| `src/lib/validators/action-log.ts`                                                 | action log 입력 schema, photo size 상수, activity type validation                         | `File`/FormData 경계는 RN용 adapter 필요                          |
| `src/lib/validators/group.ts`                                                      | 그룹명/계좌 all-or-nothing validation                                                     | 계좌 암호화는 서버 유지                                           |
| `src/lib/validators/kudos.ts`                                                      | Kudos emoji enum/input                                                                    | 그대로 사용                                                       |
| `src/lib/validators/push.ts`                                                       | notification prefs shape                                                                  | `pushSubscriptionSchema`는 Expo token schema로 교체 필요          |
| `src/lib/keywords/pool.ts`                                                         | `ACTIVITY_TYPES`, `KEYWORD_POOL`, `KEYWORD_POOL_VERSION`                                  | freeze 정책 유지                                                  |
| `src/lib/keywords/shuffle.ts`                                                      | initial/reroll keyword selection, `REROLL_LIMIT`                                          | 그대로 사용                                                       |
| `src/lib/challenge/*.ts`                                                           | done day, duration, frequency, lifecycle, penalty, pledge range, settlement, streak tiers | 날짜/timezone 테스트를 RN에서도 유지                              |
| `src/lib/bank/*.ts`                                                                | 은행 코드/계좌 표시 format                                                                | 그대로 사용                                                       |
| `src/lib/groups/default-name.ts`                                                   | 자동 그룹명 preview                                                                       | 그대로 사용                                                       |
| `src/lib/invite/share-url.ts`                                                      | invite URL 생성 규칙                                                                      | 웹 URL + app link 정책에 맞게 origin 주입만 변경                  |
| `src/lib/share/period.ts`, `src/lib/share/seed.ts`, `src/lib/share/seeded-pick.ts` | recap share 기간/seed/pick 로직                                                           | UI render는 재작성                                                |
| `src/lib/actions/response.ts`, `src/lib/actions/error-messages.ts`                 | action result/error shape                                                                 | Server Action 이름 제거 후 API/RPC wrapper 결과형으로 재사용 가능 |

### 3.2 서버에서 유지하거나 API로 감싸 재사용

| 경로/API                                                                                                       | 유지 이유                                                   | RN에서 필요한 계약                                                                 |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `supabase/migrations/**`                                                                                       | 데이터 모델, RLS, RPC, trigger가 제품 권한의 SoT            | 그대로 유지. RN client는 anon/authenticated key로 RLS 통과                         |
| `src/types/supabase.ts`                                                                                        | Supabase generated DB type                                  | RN app/shared package에서 import하거나 별도 generate                               |
| `create_challenge`, `accept_invite`, `sign_and_maybe_activate`, `start_challenge_with_signed_participants` RPC | 트랜잭션/상태 전이/권한 로직                                | Supabase RPC 직접 호출 또는 BFF endpoint                                           |
| `src/lib/ai/diary.ts`, `src/lib/ai/prompts.ts`, `src/lib/ai/cost.ts`                                           | OpenAI key, cost budget, fallback은 서버 전용               | RN은 `submitActionLog` API를 호출하고 AI 본문/키를 직접 다루지 않음                |
| `src/lib/analytics/schema.ts`                                                                                  | 분석 event shape SoT                                        | RN client emitter와 server emitter를 같은 schema로 검증                            |
| `src/lib/analytics/track.ts`                                                                                   | 현재는 service-role insert                                  | RN 직접 호출 금지. `/events` API 또는 RLS-safe insert helper 필요                  |
| `src/lib/push/dispatch.ts`                                                                                     | 수신자 선정, quiet hours, dedup, notification event logging | Web Push sender를 Expo push sender로 교체                                          |
| `src/app/api/cron/*`                                                                                           | Vercel cron 운영 책임                                       | Expo token 대상 dispatch로 내부 변경 후 유지 가능                                  |
| `src/app/api/og/recap-card`, `src/app/api/share/recap-clip`                                                    | 공유 카드/영상 생성은 서버 CPU/ffmpeg 의존                  | RN은 다운로드/공유만 담당                                                          |
| `src/lib/db/reads/*.ts`                                                                                        | read query shape와 view model                               | `next/cache`, cookies, admin hydrate cache 제거 후 shared query builder/BFF로 분리 |

### 3.3 부분 재사용

| 경로                                                          | 재사용 가능                           | 재작성 필요                                                                                           |
| ------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/lib/image/prepare-upload.ts`, `resize-to-jpeg.ts`        | 5MB/1920px/JPEG 0.85 정책             | Browser `File`, `canvas`, `createImageBitmap`, `heic2any` 구현은 Expo ImageManipulator/Asset으로 교체 |
| `src/lib/storage/action-photos.ts`                            | Storage path 규칙, bucket policy 가정 | RN upload payload, mime inference, URI/blob 변환 adapter                                              |
| `src/lib/notifications/store.ts`                              | 알림 record type 일부                 | IndexedDB/idb 구현은 RN storage로 교체                                                                |
| `src/lib/auth/in-app-browser.ts`                              | 인앱브라우저 회피 정책의 제품 의도    | RN에서는 외부 브라우저 가드가 아니라 AuthSession/deep link handling                                   |
| `src/lib/supabase/auth.ts`, `require-user.ts`, `with-user.ts` | user required pattern                 | Next server cookie 기반 구현은 폐기. RN hook/service로 재작성                                         |

## 4. 재작성해야 할 UI/라우팅/플랫폼 코드

> 아래 표는 _무엇을_ 재작성하나의 인벤토리다. _각 레이어를 어떤 라이브러리·패턴으로_ 옮길지의 규칙(레이어별 매핑·권장 스택·판단 기준)은 [03-rn-migration-rules](./03-rn-migration-rules.md)를 따른다.

| 범주                                      | 현재 경로                                                                                     | RN에서 할 일                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Next App Router pages/layouts             | `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `loading.tsx`                                 | Expo Router route tree로 재작성                                       |
| Server Components/RSC/Suspense data fetch | 모든 async page/layout                                                                        | RN screen effect/query/service 호출로 전환                            |
| Server Actions                            | `src/app/**/_actions.ts`                                                                      | Supabase RPC 또는 explicit API endpoint로 승격                        |
| Next cache directives                     | `src/lib/db/reads/*`의 `"use cache"`, `cacheTag`, `cacheLife`                                 | RN client cache 또는 server cache 전략으로 재설계                     |
| Next auth middleware                      | `proxy.ts`, `src/lib/supabase/middleware.ts`, `@supabase/ssr` cookie flow                     | RN session persistence + deep link recovery                           |
| DOM/Tailwind/shadcn UI                    | `src/components/ui/*`, route `_components/*`                                                  | React Native components, styling system, safe area, keyboard handling |
| Browser PWA                               | `public/manifest.json`, `public/service-worker.js`, `PwaRegister`, `PwaGate`, install banners | Expo app config, native permissions, notification handlers            |
| Browser push subscription                 | `PushManager`, VAPID endpoint/p256dh/auth                                                     | Expo push token/APNs/FCM token registration                           |
| IndexedDB notification center             | `src/lib/notifications/store.ts`, service worker DB write                                     | SQLite/AsyncStorage or server notification table                      |
| Web image upload                          | hidden file input, `File`, canvas resize, HEIC browser conversion                             | Expo ImagePicker/ImageManipulator/FileSystem upload pipeline          |
| Clipboard/share APIs                      | `navigator.clipboard`, `navigator.share`, DOM download anchor                                 | Expo Clipboard/Share APIs                                             |
| Next Image/font/OG                        | `next/image`, `next/font/local`, `next/og`                                                    | RN Image/font loading; OG endpoints remain server-side if needed      |
| Browser-only tests                        | Testing Library DOM specs, Playwright web flows                                               | RN Testing Library/Detox or Maestro smoke tests                       |

## 5. RN 전환 리스크

| 리스크                   | 영향                                                         | 완화                                                                    |
| ------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Server Action 의존       | RN은 `_actions.ts`를 호출할 수 없어 모든 write path가 막힘   | RPC/BFF 계약을 먼저 정의하고 route별 mutation matrix 작성               |
| Auth redirect/session    | Kakao OAuth, invite 자동 수락, magic link가 웹 callback 중심 | Expo AuthSession/deep link PoC를 Phase 1에서 완료 조건으로 둠           |
| RLS/admin boundary       | PWA는 서버에서 service-role/admin hydrate cache를 일부 사용  | RN client는 RLS 직접 접근만 허용. admin 필요 작업은 서버 API로 격리     |
| Push token 모델          | Web Push endpoint/p256dh/auth와 Expo push token이 다름       | `push_subscriptions` 확장 또는 `device_push_tokens` 신설 ADR 필요       |
| 알림센터 데이터          | 현재 알림은 service worker가 IDB에만 저장                    | RN 로컬 저장소로 재현하거나 서버 notification table로 전환              |
| 사진 처리                | HEIC/JPEG 변환, 1920px clamp, 5MB 제한이 browser canvas 기반 | native module 검증, 실제 iOS/Android 샘플 이미지 회귀 테스트            |
| Storage signed URL/cache | Next 서버 cache/hydrate read가 signed URL 수명과 맞물림      | RN은 URL refresh 정책과 이미지 cache expiration을 별도 설계             |
| 공유 카드/영상           | `next/og`, ffmpeg-static, server route에 의존                | 초기에는 서버 endpoint 유지, RN은 share/download client만 구현          |
| UI parity                | 모바일 웹 max-width/Tailwind와 native layout 차이            | 핵심 플로우별 screenshot/interaction acceptance criteria 작성           |
| 딥링크 호환              | 기존 카카오 초대 URL, push targetUrl이 웹 path 기준          | URL path를 앱 route로 매핑하는 compatibility table 유지                 |
| App Store 권한/정책      | 카메라, 사진, 알림, tracking/privacy copy 필요               | Phase 6에서 권한 문구와 privacy manifest/review checklist 작성          |
| 운영 이중화              | PWA와 RN이 같은 DB/RPC를 동시에 사용                         | migration 전후 backward compatibility window를 Phase별 완료 조건에 포함 |

## 6. 추천 태스크 순서

1. 현재 route/action/read dependency matrix를 freeze한다.
2. Expo 앱 위치를 결정한다: 현 repo 내부 `apps/mobile` 권장, shared TS package를 `packages/domain`으로 분리.
3. Supabase RN auth PoC를 만든다: Kakao OAuth, magic link fallback, invite deep link 복귀, persisted session.
4. Expo Router route skeleton을 만든다: 현재 user-facing route를 RN screen group으로 매핑.
5. `validators`, `keywords`, `challenge`, `bank`, `share` 순서로 pure domain module을 shared package로 이동한다.
6. read path를 정리한다: `fetchCurrentChallenges`, `fetchChallengeDetail`, `fetchChallengeFeed`, `fetchRecap`, `fetchGroupDetail`, `fetchMyChallenges`의 RN-safe contract를 만든다.
7. write path를 정리한다: Server Action별로 RPC 직접 호출/새 API/서버 유지 중 하나를 결정한다.
8. 인증/초대/홈/read-only 챌린지 상세을 먼저 구현한다.
9. 챌린지 생성/서약/그룹/계좌 mutations를 구현한다.
10. 사진 인증/AI 일기/Storage upload를 구현한다.
11. Kudos/feed invalidation/push notifications를 구현한다.
12. Recap/share/legal/profile/settings를 구현한다.
13. RN E2E smoke, 실기기 push/photo/auth 회귀, PWA fallback 검증 후 dogfood를 시작한다.

## 7. Phase별 계획, 리스크, 완료 조건

| Phase                                 | 범위                     | 주요 작업                                                                                                        | 주요 리스크                                                        | 완료 조건                                                                   |
| ------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Phase 0. Inventory & Architecture     | 코드 이동 전 설계 확정   | route/action/read matrix, shared module 후보, API/RPC 승격 기준, push token schema ADR 초안                      | 분석 누락으로 후속 Phase 재작업                                    | 모든 user-facing route와 Server Action이 RN 처리 방식으로 분류됨            |
| Phase 1. Expo Foundation              | RN 앱 부트스트랩         | Expo Router, TypeScript, Supabase client, auth storage, deep link config, env 분리                               | Auth/deep link가 늦게 깨지면 전체 일정 지연                        | iOS/Android dev build에서 login/logout/session restore/deep link open 성공  |
| Phase 2. Shared Domain Extraction     | 순수 TS 재사용           | validators/keywords/challenge/bank/share utilities shared package화, unit test 이전                              | Next alias/서버 전용 import가 섞여 빌드 실패                       | Web과 RN 양쪽 typecheck/unit test가 같은 domain tests를 통과                |
| Phase 3. Read-only App Parity         | 읽기 화면                | Home, challenge feed/dashboard/info, group detail, me/challenges, recap read models                              | Next cache/read 함수의 cookie/admin 의존                           | RN에서 RLS 사용자로 핵심 read 화면이 실데이터를 표시                        |
| Phase 4. Mutations                    | 쓰기 기능                | create challenge, accept invite, sign pledge, start/end/leave/delete challenge, group account, kudos             | Server Action에서 숨긴 service-role 작업 노출 위험                 | 모든 mutation이 RPC/API 계약으로 통과하고 RLS 우회가 없음                   |
| Phase 5. Native Photo & AI Action Log | 인증 제출                | ImagePicker, resize/compress, Storage upload, AI diary server call, action_logged/ai_generated events            | iOS HEIC/권한/업로드 실패, OpenAI secret 노출                      | 실제 iOS/Android에서 사진 인증 1건 생성, AI fallback 포함, feed 반영        |
| Phase 6. Notifications                | push/notification center | Expo push token registration, notification prefs, deadline/friend/kudos/start dispatch, local notification store | APNs/FCM credentials, quiet hours, duplicate/dropped notifications | 실기기에서 start/deadline/friend/kudos push 수신 및 알림 탭 navigation 성공 |
| Phase 7. Recap/Share & Polish         | 종료/공유/설정           | recap UI, share image/video endpoint integration, legal/profile/settings, accessibility, crash logging           | 공유 파일 다운로드/권한, 앱 심사 privacy copy                      | Happy path E2E와 주요 failure path가 RN에서 통과                            |
| Phase 8. Cutover                      | 운영 전환                | PWA fallback 정책, invite URL app link 우선, analytics cohort 비교, dogfood GO/NO-GO                             | 기존 PWA 사용자와 RN 사용자 데이터 호환                            | dogfood cohort가 RN으로 1주 챌린지 생성→인증→정산 완료                      |

## 8. 첫 10개 goal 목록과 완료 조건

> **의존 순서 (depends-on — 구 `06-rn-goal-map.md` §1 DAG 흡수):** G2←G1 · G3←G2 · G4←G3 · G5←G2·G3 · G6←G2 · G7←G6 · G8←G5·G7 · G9←G8 · G10←G9. 직렬 임계경로 `G1→G2→G3→G5→G8→G9→G10`; G4(G3 후)·G6(G2 후)는 병렬 가능. 골 번호는 아래 표 `#`와 1:1. **순서 게이트는 각 eval task의 `Blocked-by` frontmatter로 인코딩**하고 실행은 `implement-agent-task` workflow로 한다 — 별도 `/goal` 실행 맵(폐기된 06)은 두지 않는다.

| #   | Goal                               | 완료 조건                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Route/action/read inventory freeze | 이 문서의 라우트 표에 각 route의 RN 처리 방식이 있으며, 모든 `_actions.ts` export가 RPC/API/폐기 중 하나로 분류된 보조 matrix가 작성됨                                                                                                                                                                                |
| 2   | RN target architecture decision    | `apps/mobile`/별도 repo, shared package 위치, PWA 유지 범위, BFF 유지 범위가 ADR 또는 spec으로 결정됨                                                                                                                                                                                                                 |
| 3   | Supabase RN auth PoC               | dev build에서 Kakao OAuth 또는 magic link로 로그인, 앱 재시작 후 session restore, logout 성공                                                                                                                                                                                                                         |
| 4   | Invite deep link PoC               | **설치된 앱**: universal/app link(https) 또는 `fromwith://invite/<token>`로 앱이 열리고, 미인증이면 token stash → 로그인 후 같은 token 수락으로 **자동 복귀**. **미설치**: 웹 랜딩 → 스토어 → 설치 후 **같은 링크 재탭**으로 수락(자동 deferred 아님 — Firebase Dynamic Links 종료, [04 A7](./04-rn-architecture.md)) |
| 5   | Expo Router skeleton               | `/login`, `/invite/[token]`, `/home`, `/challenge/[id]`, `/challenge/[id]/action`, `/challenge/[id]/pledge`, `/challenge/[id]/recap`, `/me`에 해당하는 RN route가 존재하고 auth gate가 동작                                                                                                                           |
| 6   | Shared domain package build        | validators/keywords/challenge/bank/share pure modules가 RN과 Next에서 import 가능하고 unit tests가 양쪽에서 통과                                                                                                                                                                                                      |
| 7   | Read model contract                | Home/challenge/group/recap/me read contract가 RN-safe 함수 또는 API로 정의되고 service-role/cache 의존 여부가 명시됨                                                                                                                                                                                                  |
| 8   | Home + challenge read-only screens | RN에서 로그인 사용자 기준 홈, 챌린지 feed/dashboard/info가 실 Supabase 데이터로 렌더됨                                                                                                                                                                                                                                |
| 9   | Challenge lifecycle mutations      | RN에서 create challenge, invite accept, pledge sign, signed participants start가 성공하고 기존 PWA에서도 같은 DB 상태를 정상 표시                                                                                                                                                                                     |
| 10  | Native action log MVP              | RN에서 사진 선택/압축/업로드/AI 일기 생성/action_logs insert/feed 반영까지 한 번에 성공                                                                                                                                                                                                                               |

## 9. Server Action 승격 후보

| 현재 Server Action                                                                                                                                     | 파일                                              | RN 대상 계약                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `requestMagicLink`, `markOnboarded`                                                                                                                    | `src/app/(auth)/login/_actions.ts`                | Supabase RN auth 직접 호출 + user profile update API/RPC                                  |
| `acceptInvite`                                                                                                                                         | `src/app/(auth)/invite/[token]/_actions.ts`       | `accept_invite` RPC 직접 호출 또는 BFF                                                    |
| `createChallenge`                                                                                                                                      | `src/app/(flow)/challenge/new/_actions.ts`        | `create_challenge` RPC + invite 생성 + push side effect API                               |
| `markFeedSeen`                                                                                                                                         | `src/app/(app)/_actions.ts`                       | user profile update direct/RPC                                                            |
| `registerPushSubscription`, `unregisterPushSubscription`, `clearMyPushSubscriptions`, `updateNotificationPrefs`, `signOut`                             | `src/app/(app)/me/_actions.ts`                    | Expo push token API + Supabase auth signOut + prefs update                                |
| `signPledge`                                                                                                                                           | `src/app/(app)/challenge/[id]/pledge/_actions.ts` | `sign_and_maybe_activate` RPC + owner nudge side effect                                   |
| `submitActionLog`                                                                                                                                      | `src/app/(app)/challenge/[id]/action/_actions.ts` | server API 권장. Storage write, AI, analytics, push side effect를 한 트랜잭션 경계로 유지 |
| `toggleKudos`, `markActionStarted`, `revealAccountNumber`, `endChallenge`, `startChallengeWithSignedParticipants`, `deleteChallenge`, `leaveChallenge` | `src/app/(app)/challenge/[id]/_actions.ts`        | 권한/RLS 민감도별로 RPC 또는 BFF. `revealAccountNumber`는 서버 전용                       |
| `updateGroupAccount`, `renameGroup`, `deleteGroup`, `createInvite`                                                                                     | `src/app/(app)/group/[id]/_actions.ts`            | 계좌 암호화는 서버 API, 단순 rename/delete/invite는 RPC/API                               |
| `createGroup`                                                                                                                                          | `src/app/(app)/group/new/_actions.ts`             | 현재 UI는 redirect-only지만 RPC는 유지 가능                                               |

## 10. 권장 target route map

| RN route                                | 대응 PWA route              | 비고                                               |
| --------------------------------------- | --------------------------- | -------------------------------------------------- |
| `/(auth)/login`                         | `/login`                    | AuthSession/deep link callback 포함                |
| `/(auth)/invite/[token]`                | `/invite/[token]`           | 웹 OG URL과 token 규칙 공유                        |
| `/(app)/home`                           | `/home`                     | initial route                                      |
| `/(app)/(flow)/challenge/new`           | `/challenge/new`            | AppHeader 없는 flow 유지 (auth gate 안, EVAL-0014) |
| `/(app)/(flow)/challenge/new/done/[id]` | `/challenge/new/done/[id]`  | native share sheet                                 |
| `/(app)/challenge/[id]/index`           | `/challenge/[id]`           | feed tab                                           |
| `/(app)/challenge/[id]/dashboard`       | `/challenge/[id]/dashboard` | dashboard tab                                      |
| `/(app)/challenge/[id]/info`            | `/challenge/[id]/info`      | info tab                                           |
| `/(app)/challenge/[id]/action`          | `/challenge/[id]/action`    | modal/stack flow 검토                              |
| `/(app)/challenge/[id]/pledge`          | `/challenge/[id]/pledge`    | pending gate                                       |
| `/(app)/challenge/[id]/recap`           | `/challenge/[id]/recap`     | share endpoint integration                         |
| `/(app)/group/[id]`                     | `/group/[id]`               | group stack                                        |
| `/(app)/me/index`                       | `/me`                       | profile/settings                                   |
| `/(app)/me/challenges`                  | `/me/challenges`            | management                                         |
| `/(app)/notifications`                  | `/notifications`            | local/server notification center                   |

## 11. 공식 문서 확인 포인트

- Expo Router는 파일 기반 라우팅과 deep linking을 제공하므로 현재 App Router route inventory를 RN route skeleton으로 옮기기 좋다.
- Expo Notifications는 remote push를 위해 native credentials와 device/project token 모델을 사용한다. 현재 VAPID Web Push table과 호환되지 않는다.
- Expo ImagePicker/ImageManipulator는 현재 hidden file input/canvas resize를 대체할 후보지만, HEIC와 용량 제한은 실기기 검증이 필요하다.
- Supabase React Native auth는 session persistence storage와 deep link callback 설정이 핵심이다. 현재 `@supabase/ssr` cookie flow는 RN에서 재사용하지 않는다.

확인한 공식 문서:

- [Expo file-based routing](https://docs.expo.dev/develop/file-based-routing/)
- [Expo Router core concepts](https://docs.expo.dev/router/basics/core-concepts/)
- [Expo AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- [Expo ImageManipulator](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Supabase Auth with React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native)

## 12. 결론

RN 전환의 핵심은 UI 변환이 아니라 "Next Server Action/RSC/PWA 플랫폼 책임을 어떤 API와 native capability로 치환할지"를 먼저 고정하는 것이다. Supabase schema/RLS/RPC, Zod validators, keyword/challenge/share domain logic은 큰 자산이므로 유지하고, Next route tree와 브라우저 플랫폼 코드는 대부분 새로 쓴다. 첫 실사용 milestone은 "RN에서 초대 링크로 가입한 사용자가 챌린지에 서명하고 사진 인증을 1건 남겨 기존 PWA feed에서도 보이는 것"이다.

## 13. Phase 0 인벤토리 freeze (EVAL-0004)

이 섹션은 [`evals/tasks/0004-rn-phase0-inventory-freeze.md`](../../evals/tasks/0004-rn-phase0-inventory-freeze.md)의 실행 결과를 고정(freeze)한 것이다. §1·§3.2·§9의 서술형 인벤토리를 **실제 코드와 대조해 검증한 결정론 매트릭스**로 옮겨, 이후 `EVAL-0005+` 기능 포팅 task가 이 섹션을 Parent 인벤토리로 인용할 수 있게 한다.

- 기준일: 2026-06-05 · 기준 브랜치: `feat/rn-goal-map` · **코드 변경 없음**(문서 freeze, Non-goals 봉인).
- 분류 용어:
  - **RPC direct** — RN이 Supabase Postgres 함수(RPC)를 supabase-js `rpc()`로 직접 호출. RLS/트랜잭션이 권한을 보장.
  - **BFF API** — 서버 endpoint(Backend-for-Frontend)가 필요. service-role(`adminClient`) · 서버 키(계좌 암복호화) · OpenAI secret · 서버 push dispatch가 핵심 경로라 RN client가 직접 못 함.
  - **RN direct client** — RN supabase-js로 `auth.*` 또는 RLS self-row(본인 행) read/write를 직접. RPC·서버 불필요.
  - **deprecated/alias** — RN에서 제거하거나 deep-link 호환 alias만 남김.
- 분류 규칙(코드 근거): action 본문에 `adminClient`/`encrypt|decrypt`/`generateDiary`(OpenAI) 가 **핵심 경로**면 BFF, 핵심 write가 `rpc()`면 RPC direct, `auth.*`/RLS self-row만이면 RN direct client. 부수적 push dispatch·`track()` 분석 이벤트는 cross-cutting으로 보고(별도 decision debt D-2·D-3) 핵심 분류를 바꾸지 않는다.

### 13.1 Route 매트릭스 freeze

`src/app/**/page.tsx` 24개가 §1.1(user-facing 18) + §1.2(legacy redirect 6)에 **1:1로 모두 매핑**되어 누락 route가 없다. 검증: `find src/app -name 'page.tsx'` 결과를 §1 표와 대조(diff 0건).

| 구분                 | §1 표 행 수 | 실제 `page.tsx` | 누락  |
| -------------------- | ----------- | --------------- | ----- |
| §1.1 user-facing     | 18          | 18              | 0     |
| §1.2 legacy redirect | 6           | 6               | 0     |
| **합계**             | **24**      | **24**          | **0** |

route handler(`route.ts`/`route.tsx`) 8개도 §1.3에 전부 존재(`/auth/callback`·`/auth/dev-login`·`/api/me`·`/api/push`·`/api/cron/deadline-push`·`/api/cron/cleanup-kudos-push-log`·`/api/og/recap-card`·`/api/share/recap-clip`). 누락 0건.

### 13.2 Action 매트릭스 freeze

`_actions.ts` 10개 파일의 **Server Action export 24개**(`export type` 3개 제외)를 §9 서술을 코드로 검증해 4분류로 고정한다. 매트릭스 행 수(24) = export 수(24).

| #   | Server Action                          | 파일                                      | 분류             | 코드 근거                                                                                                                  |
| --- | -------------------------------------- | ----------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | `requestMagicLink`                     | `(auth)/login/_actions.ts`                | RN direct client | `supabase.auth.signInWithOtp`                                                                                              |
| 2   | `markOnboarded`                        | `(auth)/login/_actions.ts`                | RN direct client | `users` self-row update(`auth.getUser`)                                                                                    |
| 3   | `acceptInvite`                         | `(auth)/invite/[token]/_actions.ts`       | RPC direct       | `rpc("accept_invite")`                                                                                                     |
| 4   | `createChallenge`                      | `(flow)/challenge/new/_actions.ts`        | RPC direct       | `rpc("create_challenge")`(+`create_group_with_owner`·`sign_and_maybe_activate`); push→서버, 다단계 orchestration           |
| 5   | `markFeedSeen`                         | `(app)/_actions.ts`                       | deprecated/alias | **현재 호출자 없음**(헤더 dot이 IDB unread로 이전); 제거 follow-up                                                         |
| 6   | `toggleKudos`                          | `(app)/challenge/[id]/_actions.ts`        | RN direct client | `kudos` insert/delete(RLS self); 친구 kudos push→서버                                                                      |
| 7   | `markActionStarted`                    | `(app)/challenge/[id]/_actions.ts`        | BFF API          | `adminClient()` events(service_role) idempotency 조회                                                                      |
| 8   | `revealAccountNumber`                  | `(app)/challenge/[id]/_actions.ts`        | BFF API          | `decryptAccountNumber`(서버 키)+`adminClient()` (§9 서버 전용)                                                             |
| 9   | `endChallenge`                         | `(app)/challenge/[id]/_actions.ts`        | BFF API          | `adminClient()` — `challenges` DELETE RLS 정책 없음                                                                        |
| 10  | `startChallengeWithSignedParticipants` | `(app)/challenge/[id]/_actions.ts`        | RPC direct       | `rpc("start_challenge_with_signed_participants")`; push→서버                                                               |
| 11  | `deleteChallenge`                      | `(app)/challenge/[id]/_actions.ts`        | BFF API          | `adminClient()` — `challenges` DELETE RLS 정책 없음                                                                        |
| 12  | `leaveChallenge`                       | `(app)/challenge/[id]/_actions.ts`        | BFF API          | `adminClient()` — `challenge_participants` DELETE RLS 정책 없음                                                            |
| 13  | `submitActionLog`                      | `(app)/challenge/[id]/action/_actions.ts` | BFF API          | `generateDiary`(OpenAI)+Storage upload+`rpc("update_action_log_photo_path")`+push (§9 server API 권장, 단일 트랜잭션 경계) |
| 14  | `signPledge`                           | `(app)/challenge/[id]/pledge/_actions.ts` | RPC direct       | `rpc("sign_and_maybe_activate")`; owner nudge push→서버                                                                    |
| 15  | `updateGroupAccount`                   | `(app)/group/[id]/_actions.ts`            | BFF API          | `encryptAccountNumber`(서버 키)                                                                                            |
| 16  | `renameGroup`                          | `(app)/group/[id]/_actions.ts`            | RN direct client | `groups` update(RLS owner `.eq("owner_id")`)                                                                               |
| 17  | `deleteGroup`                          | `(app)/group/[id]/_actions.ts`            | RN direct client | `groups` delete(RLS owner + 멤버/챌린지 가드)                                                                              |
| 18  | `createInvite`                         | `(app)/group/[id]/_actions.ts`            | RN direct client | `invites` insert(RLS `invites_insert_owner`)                                                                               |
| 19  | `createGroup`                          | `(app)/group/new/_actions.ts`             | BFF API          | `encryptAccountNumber`(계좌 시 서버 키)+`rpc("create_group_with_owner")`; page는 redirect-only(D-9)                        |
| 20  | `signOut`                              | `(app)/me/_actions.ts`                    | RN direct client | `supabase.auth.signOut`                                                                                                    |
| 21  | `registerPushSubscription`             | `(app)/me/_actions.ts`                    | RN direct client | `push_subscriptions` upsert(RLS self); Web Push→Expo token 스키마 교체(D-2)                                                |
| 22  | `unregisterPushSubscription`           | `(app)/me/_actions.ts`                    | RN direct client | `push_subscriptions` delete(RLS self)                                                                                      |
| 23  | `clearMyPushSubscriptions`             | `(app)/me/_actions.ts`                    | RN direct client | `push_subscriptions` delete(RLS self)                                                                                      |
| 24  | `updateNotificationPrefs`              | `(app)/me/_actions.ts`                    | RN direct client | `users.notification_prefs` update(RLS self)                                                                                |

분류 합계: RN direct client 11 · BFF API 8 · RPC direct 4 · deprecated/alias 1 = **24**.

### 13.3 Read 매트릭스 freeze

`src/lib/db/reads/` 비-spec 모듈 **21개**를 RN-safe 여부로 분류하고 service-role/cache/cookie 의존을 표시한다(§3.2를 함수 단위로 확장). `admin`(service-role `adminClient`)이 있으면 RN client 직접 호출 불가 → **server-only/BFF**. `cookie`(`createClient()` 세션)·`cache`(`"use cache"`)만이면 토큰 client + cache 재설계로 **RN-safe(RLS)**.

| read 모듈                            | 대표 함수(§6·§8 핵심)     | service-role | cache | cookie | 분류            |
| ------------------------------------ | ------------------------- | ------------ | ----- | ------ | --------------- |
| `challenge-feed.ts`                  | `fetchChallengeFeed`      | ✅           | -     | -      | server-only/BFF |
| `action-log-hydrate.ts`              | (feed hydrate)            | ✅           | ✅    | -      | server-only/BFF |
| `photo-signed-url.ts`                | (signed URL hydrate)      | ✅           | ✅    | -      | server-only/BFF |
| `kudos-counts.ts`                    | (feed hydrate)            | ✅           | ✅    | -      | server-only/BFF |
| `kudos-viewer.ts`                    | (viewer-keyed hydrate)    | ✅           | ✅    | -      | server-only/BFF |
| `invite.ts`                          | `fetchInvitePreview`      | ✅           | -     | -      | server-only/BFF |
| `current-challenges.ts`              | `fetchCurrentChallenges`  | -            | ✅    | ✅     | RN-safe(RLS)    |
| `challenge-detail.ts`                | `fetchChallengeDetail`    | -            | -     | ✅     | RN-safe(RLS)    |
| `group-detail.ts`                    | `fetchGroupDetail`        | -            | ✅    | ✅     | RN-safe(RLS)    |
| `my-challenges.ts`                   | `fetchMyChallenges`       | -            | ✅    | ✅     | RN-safe(RLS)    |
| `recap.ts`                           | `fetchRecap`              | -            | -     | ✅     | RN-safe(RLS)    |
| `list-visible-action-log-ids.ts`     | (Layer 1 visibility gate) | -            | ✅    | ✅     | RN-safe(RLS)    |
| `active-challenge.ts`                | `fetchActiveChallenge`    | -            | -     | ✅     | RN-safe(RLS)    |
| `challenge-photos.ts`                | `fetchChallengePhotos`    | -            | -     | ✅     | RN-safe(RLS)    |
| `me.ts`                              | `fetchMe`                 | -            | ✅    | ✅     | RN-safe(RLS)    |
| `my-groups.ts`                       | `fetchMyGroups`           | -            | -     | ✅     | RN-safe(RLS)    |
| `notification-prefs.ts`              | `fetchNotificationPrefs`  | -            | -     | ✅     | RN-safe(RLS)    |
| `owner-groups-for-challenge-form.ts` | `fetchOwnerGroups…`       | -            | -     | ✅     | RN-safe(RLS)    |
| `pledge.ts`                          | `fetchPledge`             | -            | -     | ✅     | RN-safe(RLS)    |
| `unread-kudos.ts`                    | `fetchUnreadKudos`        | -            | -     | ✅     | RN-safe(RLS)    |
| `visibility-version.ts`              | (cache tag version)       | -            | -     | ✅     | RN-safe(RLS)    |

분류 합계: server-only/BFF 6 · RN-safe(RLS) 15 = **21**.

- **service-role 6개는 ADR-0024 admin hydrate 경계**다 — Layer 1 visibility gate(`list-visible-action-log-ids`, RLS) 통과 _이후_ 호출되는 viewer-agnostic/viewer-keyed hydrate. Next-server 한정 결정이라 RN 계약은 D-4에서 재결정.
- **cookie 의존(15개)은 제거 가능** — `@supabase/ssr` cookie 세션 → RN은 토큰 기반 client. cache 디렉티브도 RN/server cache 전략으로 교체(§4).

### 13.4 Decision debt (Phase 1 진입 전 필요한 ADR/spec)

freeze 과정에서 드러난, Phase 1(Expo Foundation) 진입 전 결정이 필요한 항목이다. §5 리스크표를 ADR/spec 산출물로 구체화했다.

| ID  | 항목                                                                                                                                                                   | 산출물 | 트리거(코드)                                          | 왜 Phase 1 전                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------- | ------------------------------------------------------ |
| D-1 | 모노레포 restructure(`apps/web`·`apps/mobile`·`packages/domain`)                                                                                                       | ADR    | 02 §3.2, 04 A1                                        | Phase 1 부트스트랩이 이 레이아웃 위에서 시작           |
| D-2 | push token 모델(Web Push `endpoint/p256dh/auth` → Expo device token)                                                                                                   | ADR    | `push_subscriptions`, `registerPushSubscription`(#21) | 알림 register 경로·테이블이 auth 직후 필요(§5 리스크)  |
| D-3 | analytics emission 경로(`track.ts` service-role → `/events` API 또는 RLS-safe helper)                                                                                  | spec   | `track.ts`, `markActionStarted`(#7) 등                | RN client는 events 직접 insert 불가(RLS), 전 화면 공통 |
| D-4 | ADR-0024 admin hydrate read의 RN 계약(13.3 service-role 6개를 BFF vs RLS 재설계, signed URL 수명 포함) — [ADR-0036](../adr/0036-rn-admin-hydrate-bff-contract.md) 확정 | ADR    | reads admin 6개                                       | read 패리티(Phase 3) 설계 기준                         |
| D-5 | service-role mutation → RPC 승격(`deleteChallenge`·`leaveChallenge`·`endChallenge`: DELETE RLS 정책 없음)                                                              | ADR    | adminClient action 3개(#9·#11·#12)                    | RN은 admin 직접 호출 불가 → 쓰기 패리티(Phase 4) 차단  |
| D-6 | 계좌 암호화 BFF 경계(`updateGroupAccount`·`createGroup`·`revealAccountNumber`)                                                                                         | ADR    | `crypto/account-cipher`(#8·#15·#19)                   | 서버 키가 client에 노출되면 안 됨 — BFF 필수 확정      |
| D-7 | `submitActionLog` BFF 계약(Storage+OpenAI+RPC+push 단일 트랜잭션 경계 endpoint shape) — [spec](../superpowers/specs/2026-06-13-d-7-submit-action-log-bff.md) (draft)   | spec   | `action/_actions.ts`(#13)                             | 사진/AI(Phase 5) 핵심 write의 endpoint 형태 필요       |
| D-8 | auth/deep-link PoC(Kakao OAuth·magic link·invite 자동수락, `@supabase/ssr` cookie flow 폐기)                                                                           | ADR    | `supabase/middleware.ts`, `auth/*`                    | Phase 1 완료 조건 자체(§7 Phase 1)                     |
| D-9 | deprecation 정리(`markFeedSeen` 호출자 없음·`createGroup` page redirect-only·§1.2 legacy 6)                                                                            | spec   | `markFeedSeen`(#5), §1.2                              | RN route skeleton에서 제거 vs alias 결정               |

`EVAL-0005+` 기능 포팅 task는 자신이 건드리는 행을 위 매트릭스(13.2·13.3)에서 인용하고, 막힌 결정은 위 D-1~D-9 ID로 참조한다.
