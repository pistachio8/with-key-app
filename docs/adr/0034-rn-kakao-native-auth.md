# ADR-0034: RN 인증 백본 — 네이티브 Kakao SDK + SecureStore 세션 + invite client orchestration

**Date**: 2026-06-10
**Status**: accepted <!-- accepted / superseded / deprecated -->
**Deciders**: pistachio8 (PO)
**관련**: [04-rn-architecture §4 A6·A7](../migration/04-rn-architecture.md) · [00-rn-conversion-plan §13.4 D-8](../migration/00-rn-conversion-plan.md) · [ADR-0007 token_hash flow](./0007-supabase-env-fail-fast.md) · [ADR-0008 Kakao OAuth 도입](./0008-kakao-oauth-introduction.md) · [ADR-0033 RN target architecture](./0033-rn-target-architecture.md)

> 이 ADR은 **새 결정을 내리지 않는다.** [04-rn-architecture §4](../migration/04-rn-architecture.md)에서 grill-me 인터뷰로 확정된 RN 인증 백본 결정(A6 + 세션·invite 기본값)을 **박제(record)**한다. 이 문서 작성으로 [04 §9 "ADR — RN Kakao 네이티브 인증"](../migration/04-rn-architecture.md)과 [00 §13.4 D-8](../migration/00-rn-conversion-plan.md)("auth/deep-link PoC — ADR 산출물")이 충족되고, Phase 1(Expo Foundation) 진입 게이트 1건이 해제된다. PO 수락 시 Status를 `accepted`로 갱신하고 [04 §0.2 A6](../migration/04-rn-architecture.md) 상태 마커를 본 ADR로 연결한다.

## Context

PWA 인증은 웹 callback 중심이다. **magic link**(`signInWithOtp` + `token_hash` flow, [ADR-0007](./0007-supabase-env-fail-fast.md))와 **Kakao 웹 OAuth**(`signInWithOAuth` → `exchangeCodeForSession`, [ADR-0008](./0008-kakao-oauth-introduction.md)) 모두 `apps/web/src/app/auth/callback/route.ts`가 한 곳에서 세션 성립 + `accept_invite` RPC(Remote Procedure Call) 자동 호출 + 분석 이벤트(`invite_opened`·`user_signed_up`) emit + welcome cushion redirect를 처리하고, 세션은 `@supabase/ssr`가 **cookie**로 유지한다(`apps/web/src/lib/supabase/middleware.ts`).

RN(React Native)은 이 구조를 그대로 쓸 수 없다.

1. **쿠키가 없다** — `@supabase/ssr` cookie flow·middleware 세션 갱신이 RN 앱에는 적용 불가. 토큰 기반 client + 기기 내 저장이 필요하다([00 §13.3](../migration/00-rn-conversion-plan.md): cookie 의존 15개 read가 제거 대상).
2. **웹 callback 의존이 끊긴다** — `/auth/callback`이 담당하던 invite 자동수락·분석 emit·cushion 책임을 클라이언트로 재배치해야 한다([04 §4 머리말](../migration/04-rn-architecture.md)).
3. **일정 리스크가 가장 앞에 있다** — auth/deep link는 [00 §7 Phase 1의 완료 조건 자체](../migration/00-rn-conversion-plan.md)(dev build에서 login/logout/session restore/deep link open 성공)라, 늦게 깨지면 전체 일정이 밀린다([00 §5 리스크 "Auth redirect/session"](../migration/00-rn-conversion-plan.md)).

되돌리기 비용이 큰 이유 — 인증 백본(`src/lib/supabase/**`·`auth/*`)은 [AGENTS.md §4](../../AGENTS.md)의 ADR 필수 트리거 경로이고, Kakao 네이티브 전환은 카카오 콘솔 플랫폼 등록·Supabase provider 구성·앱 번들 식별자까지 외부 설정이 얽혀 사후 변경이 비싸다.

## Decision

RN 인증 백본을 **네이티브 Kakao SDK + `signInWithIdToken`(1차) · magic link(fallback) · SecureStore chunked 세션 · invite 자동수락 client orchestration**으로 구성하고, RN 경로에서 `@supabase/ssr` cookie flow를 폐기한다(cookie 경로는 전환기 PWA용으로 잔존). 아래 4개 결정을 각각 [결정 / 근거 / 트레이드오프 / 출처 인용]으로 기록한다.

### 결정 1 — Kakao 로그인 = 네이티브 Kakao SDK + `signInWithIdToken` (04 A6)

- **결정**: 카카오톡 앱 SSO(Single Sign-On)로 id token을 획득한 뒤 `supabase.auth.signInWithIdToken({ provider: 'kakao', token })`으로 Supabase 세션을 성립한다. 웹 OAuth redirect(`signInWithOAuth` → `exchangeCodeForSession`)는 RN 1차 경로로 쓰지 않는다.
- **근거**: 카카오톡 원탭 SSO가 한국 사용자 UX 최상 — 브라우저 왕복 없이 설치된 카카오톡 앱에서 바로 동의·복귀한다. Supabase 표준 메서드(`signInWithIdToken`)를 쓰므로 RLS(Row Level Security) 백본의 `auth.uid()` 일관성은 ADR-0008과 동일하게 유지된다(자체 OAuth 핸들러 없음).
- **트레이드오프**: 비용은 사업자등록이 아니라(이메일 필수동의 → 비즈앱 전환은 웹 OAuth도 공통, 개인 비즈앱은 사업자번호 없이 전환 가능) **네이티브 설정**이다 — 카카오 콘솔 플랫폼 등록(Android keyhash·iOS bundle id), `EXPO_PUBLIC_KAKAO_NATIVE_KEY`(공개 가능 키, 콘솔에서 패키지 식별자로 제한), Kakao SDK config plugin, Supabase의 Kakao id token 신뢰 구성. APP_VARIANT별 bundle id 분리([04 A12](../migration/04-rn-architecture.md))만큼 콘솔 등록도 환경별로 늘어난다.
- **출처 인용**:
  > "A6 Kakao OAuth | 네이티브 Kakao SDK + `signInWithIdToken`(카카오톡 SSO) | ADR" — [04 §0.2 A6](../migration/04-rn-architecture.md)
  > "**네이티브 Kakao SDK + `signInWithIdToken`**: 카카오톡 앱 SSO로 id token 획득 → `supabase.auth.signInWithIdToken(...)`. **왜**: 카카오톡 원탭 SSO가 한국 사용자 UX 최상." — [04 §4 A6](../migration/04-rn-architecture.md)

### 결정 2 — magic link = fallback 유지, `emailRedirectTo`는 universal link (04 §4)

- **결정**: magic link(`signInWithOtp`, token_hash flow)를 RN에서도 fallback 경로로 유지한다. `emailRedirectTo`는 custom scheme(`fromwith://`)이 아니라 **universal link**(`https://<도메인>/auth/callback?token_hash=`)로 둔다.
- **근거**: Kakao 계정이 없거나 SSO가 실패하는 사용자의 우회로가 필요하다(PRD §3.3 AC-3의 두 경로 인정, [ADR-0008](./0008-kakao-oauth-introduction.md)과 동일 원칙). 이메일 클라이언트가 custom scheme 링크를 신뢰하지 않으므로 https universal link만 앱을 열 수 있다.
- **트레이드오프**: universal link 호스팅(`/.well-known/apple-app-site-association`·`assetlinks.json`)을 `apps/web`이 담당해야 하고([04 A7](../migration/04-rn-architecture.md)), 미설치 기기에서 링크를 열면 웹 PWA callback으로 떨어진다 — 전환기에는 의도된 fallback이다([ADR-0033 결정 3](./0033-rn-target-architecture.md): PWA = 전환기 fallback 호스트).
- **출처 인용**:
  > "**magic link**: RN에서도 fallback으로 유지. `emailRedirectTo`는 universal link — 이메일 클라이언트가 custom scheme을 신뢰하지 않으므로 https로." — [04 §4 A6](../migration/04-rn-architecture.md)

### 결정 3 — 세션 저장 = SecureStore chunked adapter, RN에서 cookie flow 폐기 (04 §4 기본값 · 00 D-8)

- **결정**: Supabase Auth storage adapter를 `expo-secure-store` 기반 **chunked adapter**(SecureStore 값 크기 제한 대비 분할 저장)로 구현한다. RN 경로에서 `@supabase/ssr` cookie flow·middleware 세션 갱신은 쓰지 않는다(폐기). cookie 경로는 전환기 PWA 전용으로 잔존하고 cutover 후 정리한다. 로그아웃 시 SecureStore의 민감 데이터를 제거한다.
- **근거**: RN에는 쿠키 컨테이너가 없고, JWT(JSON Web Token) 세션은 기기 내 암호화 저장소가 표준이다. SecureStore는 항목당 값 크기 제한이 있어 JWT가 크면 저장이 실패할 수 있으므로 chunking을 처음부터 둔다([03 §6](../migration/03-rn-migration-rules.md)).
- **트레이드오프**: 전환기 동안 인증 저장소가 두 갈래(web cookie · RN SecureStore)로 공존한다 — 같은 Supabase Auth를 쓰므로 세션 자체는 호환되지만, `apps/web` BFF(Backend for Frontend)는 cookie와 `Authorization: Bearer` 두 검증 경로를 함께 지원해야 한다([ADR-0033 결정 4](./0033-rn-target-architecture.md)).
- **출처 인용**:
  > "**세션**: `expo-secure-store` 기반 Supabase Auth storage adapter. … **chunked adapter**로 분할 저장. 로그아웃 시 민감 데이터 제거." — [04 §4 세션 저장](../migration/04-rn-architecture.md)
  > "D-8 | auth/deep-link PoC(Kakao OAuth·magic link·invite 자동수락, `@supabase/ssr` cookie flow 폐기) | ADR" — [00 §13.4](../migration/00-rn-conversion-plan.md)

### 결정 4 — invite 자동수락 = client-side orchestration (04 §4 기본값)

- **결정**: 웹 `/auth/callback`이 하던 invite 수락 책임을 **RN 경로에서는** `authService`로 재배치한다(웹 `/auth/callback`의 서버 orchestration은 전환기 PWA용으로 그대로 유지 — 결정 3의 cookie 경로 잔존과 동일 원칙). deep link로 받은 `<token>`을 stash(미인증이면 SecureStore에 보관 후 로그인 라우팅) → 세션 성립(Kakao SSO 또는 magic link) 후 `accept_invite` RPC 호출 + `invite_opened`·`user_signed_up` 분석 emit + welcome cushion 네비게이션을 클라이언트가 orchestrate한다.
- **근거**: `accept_invite`는 RLS-safe RPC라 클라이언트가 직접 호출할 수 있다 — 웹 callback 의존을 제거하면서 ADR-0008의 "한 번의 카카오 탭으로 가입까지 완결" UX를 RN에서 보존한다. 분석 이벤트 emit 경로는 [00 §13.4 D-3](../migration/00-rn-conversion-plan.md)(analytics spec)을 따른다.
- **트레이드오프**: orchestration이 클라이언트로 오면 중간 이탈(수락 전 앱 종료) 시 재시도 로직이 클라이언트 책임이 된다 — token stash가 남아 있으므로 다음 실행에서 재개 가능해야 한다. 분석 이벤트의 정확성(중복 emit 방지)도 클라이언트 구현 품질에 의존한다.
- **출처 인용**:
  > "**invite 자동수락(client-side)**: deep link로 받은 `<token>`을 stash → 세션 성립 후 RN `authService`가 `accept_invite` RPC 호출 + 분석 emit + welcome cushion 네비게이션. **왜**: `accept_invite`는 RLS-safe RPC라 클라가 직접 호출 가능 → web callback 의존 제거." — [04 §4](../migration/04-rn-architecture.md)

## Alternatives Considered

### 1. 웹 OAuth 재사용 (in-app browser + `exchangeCodeForSession`)

- **Pros**: 기존 ADR-0008 웹 flow·`/auth/callback`을 거의 그대로 재사용, 카카오 콘솔 네이티브 설정 불필요.
- **Cons**: 카카오톡 원탭 SSO 불가 — 브라우저 시트가 열리고 계정 입력/동의 왕복이 생겨 모바일 앱 UX가 웹보다 나빠진다. 브라우저 ↔ 앱 세션 전달(쿠키 → 앱 토큰)이 또 다른 끊김 지점이 된다.
- **Why not**: RN 전환의 핵심 동기가 네이티브 UX인데 1차 로그인에서 브라우저로 돌아가는 것은 본말전도. [04 A6](../migration/04-rn-architecture.md)가 네이티브 SDK를 확정.

### 2. 웹 `/auth/callback`을 웹뷰로 감싸 orchestration 유지

- **Pros**: invite 수락·분석 emit·cushion 로직 재구현 0.
- **Cons**: 웹뷰의 cookie 세션과 앱의 토큰 세션이 분리된다 — callback이 성립시킨 세션을 앱이 못 받는다. 웹뷰 의존은 앱 심사·UX 모두에 부채.
- **Why not**: 세션 경계가 깨지는 구조적 문제. 책임을 클라이언트로 재배치(결정 4)하는 편이 명확하다.

### 3. 세션을 AsyncStorage에 저장

- **Pros**: 크기 제한 없음, 구현 단순(chunking 불필요).
- **Cons**: 평문 저장 — JWT·refresh token이 기기 내 비암호화로 남는다.
- **Why not**: 인증 토큰은 암호화 저장이 기준([03 §6](../migration/03-rn-migration-rules.md) 보안 규칙). 크기 제한은 chunked adapter로 해결한다.

### 4. invite 수락을 BFF(서버) orchestration으로 유지

- **Pros**: 분석 emit·중복 방지를 서버에서 일괄 보장.
- **Cons**: RLS-safe RPC 하나를 위해 BFF endpoint를 신설 — [ADR-0033 결정 4](./0033-rn-target-architecture.md)의 Hybrid 원칙(RLS-safe는 RPC 직접)에 어긋나고 round trip이 늘어난다.
- **Why not**: `accept_invite`는 secret이 필요 없는 RLS-safe 경로다. BFF는 secret 필요 작업에만 쓴다.

## Consequences

### 긍정적

- [00 §7 Phase 1](../migration/00-rn-conversion-plan.md) 완료 조건(login/logout/session restore/deep link open)의 설계 기준이 고정되어, [00 §8 goal 3(Supabase RN auth PoC)·goal 4(Invite deep link PoC)](../migration/00-rn-conversion-plan.md)를 바로 착수할 수 있다.
- [00 §13.4 D-8](../migration/00-rn-conversion-plan.md) ADR 산출물이 충족되어 Phase 1 진입 게이트 1건이 해제된다.
- RLS 백본(`auth.uid()`) 일관성이 웹·RN에서 동일하게 유지된다 — provider가 달라도 Supabase Auth 표준 메서드만 쓴다.

### 부정적 / 비용

- 카카오 콘솔 네이티브 플랫폼 등록(Android keyhash·iOS bundle id, APP_VARIANT별) + Supabase Kakao id token 신뢰 구성이라는 외부 설정 의존이 생긴다 — PoC 전에 콘솔 작업이 선행되어야 한다.
- 전환기 동안 인증 경로 이중화(web cookie · RN token)를 운영해야 한다 — BFF의 cookie/Bearer 병행 지원 포함.
- invite orchestration·분석 emit이 클라이언트 책임이 되어 재시도·중복 방지 구현 품질이 데이터 정확성에 직결된다.

### 후속 영향

- **PO 수락 시**: Status를 `accepted`로 갱신하고 [04 §0.2 A6](../migration/04-rn-architecture.md) 상태 마커(`ADR`)와 [04 §9 산출물 표](../migration/04-rn-architecture.md)를 본 ADR 링크로 연결한다(본 PR에서 §9 표는 draft 링크로 선반영).
- 구현 산출물: SecureStore chunked adapter(`apps/mobile` services), Kakao SDK config plugin + `EXPO_PUBLIC_KAKAO_NATIVE_KEY` env(`.env.example` 동기화), RN `authService`(invite stash·수락·emit). 분석 emit 경로의 세부는 [D-3 spec](../migration/00-rn-conversion-plan.md)에서 확정.
- **본 ADR이 닫지 않는 것**: A7 딥링크의 미설치 deferred = **재탭 UX의 MVP 수용 여부**는 별도 PO 제품 판단으로 남아 있다([04 §9 ⓑ](../migration/04-rn-architecture.md)). push 테이블(A9 — `device_push_tokens`)은 별도 ADR(D-2 — [ADR-0041](./0041-rn-push-token-model.md))로 확정됐다.

## 용어집

- **BFF**: Backend for Frontend — RN ↔ Supabase 사이 보안 경계 서버(여기선 `apps/web` Next API route)
- **chunked adapter**: 저장소의 항목당 크기 제한을 피하려고 값을 여러 key로 분할 저장하는 어댑터
- **id token / `signInWithIdToken`**: 외부 provider(Kakao)가 발급한 신원 토큰을 Supabase 세션으로 교환하는 인증 메서드
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어(Supabase). RLS-safe RPC는 클라이언트가 직접 호출 가능
- **SecureStore**: `expo-secure-store` — 기기 내 암호화 key-value 저장소(토큰·세션용)
- **SSO**: Single Sign-On — 설치된 카카오톡 앱의 로그인 상태로 동의만 받아 즉시 인증하는 방식
- **token stash**: 미인증 상태에서 받은 invite token을 임시 보관했다가 로그인 후 꺼내 쓰는 패턴
- **universal link / App Links**: iOS·Android의 OS 내장 딥링크 — https URL이 앱을 직접 엶(미설치 시 웹 fallback)
