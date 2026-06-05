# ADR-0033: RN Target Architecture (apps/mobile · packages/domain · PWA 유지범위 · BFF Hybrid)

**Date**: 2026-06-05
**Status**: accepted <!-- accepted / superseded / deprecated -->
**Deciders**: pistachio8 (PO)

> 이 ADR은 **새 결정을 내리지 않는다.** PWA→RN 전환의 target 아키텍처 4개 결정을 이미 확정된 source 문서에서 모아 **박제(record)**한다. 근거는 [04-rn-architecture A1·A8](../migration/04-rn-architecture.md)과 [00-rn-conversion-plan §7·§13.4 D-1](../migration/00-rn-conversion-plan.md)이다. 이 문서 작성으로 [04 §9 ⓐ](../migration/04-rn-architecture.md)의 "A1 ADR 작성으로 확정" 후속이 닫히고, [00 §8 goal 2](../migration/00-rn-conversion-plan.md)("RN target architecture decision")의 산출물이 충족된다.

## Context

[00-rn-conversion-plan §8 goal 2](../migration/00-rn-conversion-plan.md)는 "`apps/mobile`/별도 repo, shared package 위치, PWA 유지 범위, BFF 유지 범위가 ADR 또는 spec으로 결정됨"을 완료 조건으로 요구한다. [04-rn-architecture](../migration/04-rn-architecture.md)는 grill-me 인터뷰로 12개 결정(§0.2)을 확정하며 이 4개를 답했고, 그중 A1(Repo 토폴로지)은 상태가 `⚠️ ADR`(되돌리기 비용이 커 ADR 기록이 선행 게이트), A8(쓰기/BFF)은 `확정`이다. [00 §13.4 D-1](../migration/00-rn-conversion-plan.md)도 모노레포 restructure를 **ADR 산출물**로 명시한다(트리거: 04 A1).

되돌리기 비용이 큰 이유 — restructure는 `src/lib/supabase/**`(인증 백본) 등 전 경로 import를 일괄 이동시키고 Vercel root dir·CI 경로 재설정을 동반한다([AGENTS.md §4](../../AGENTS.md): `src/lib/supabase/**` 변경 → ADR). PWA·BFF 유지 범위는 전환기 동안 PWA·RN이 같은 DB/RPC를 동시에 쓰는 backward-compatibility window를 좌우한다([00 §5 "운영 이중화" 리스크](../migration/00-rn-conversion-plan.md)). 그래서 ADR-lite가 아니라 풀 포맷 ADR로 기록한다.

## Decision

PWA를 **`apps/web`+`apps/mobile`+`packages/domain` 모노레포**로 전면 재구성하고, 모바일은 `apps/mobile`(Expo RN), 공유 순수 도메인은 `packages/domain`에 둔다. PWA는 전환기 동안 fallback + BFF 호스트로 유지하고, 쓰기 경로는 **Hybrid**(RLS-safe = Supabase RPC 직접, secret 필요 = `apps/web` Next API route를 Bearer BFF로)로 나눈다. 아래 4개 결정을 각각 [결정 / 근거 / 트레이드오프 / 출처 인용]으로 기록한다.

### 결정 1 — Expo 앱 위치 = `apps/mobile` (04 A1)

- **결정**: 신규 Expo React Native 앱을 별도 repo가 아니라 현 repo 내부 `apps/mobile`에 둔다. 현 root 단일 Next.js 패키지(`src/` at root)는 `apps/web`으로 이동하고, repo를 `apps/*`+`packages/*` 모노레포로 전면 재구성한다.
- **근거**: 깨끗한 target 구조에서 시작한다. `apps/web`과 `apps/mobile`이 같은 repo·같은 `supabase/`(스키마 SoT)·같은 `packages/domain`(도메인 SoT)·같은 `evals/`(보존 eval 게이트)를 공유해, 비즈니스 로직 드리프트를 1차 방어선(같은 소스·같은 test)으로 막는다. task 실행기는 pnpm `-r`(A3) — 앱 2~3개엔 Turborepo 캐시 이득이 작다.
- **트레이드오프**: restructure가 `src/lib/supabase/**` 등 인증 백본 경로 import를 일괄 바꾸므로 ADR + Vercel root dir·CI 경로 재설정을 동반한다. [harness §3.2](../migration/02-rn-migration-harness.md)의 원래 "모노레포 전면 개편을 선행하지 않는다(점진 이동)"와 상충했으나, [04 §9 ⓐ](../migration/04-rn-architecture.md)에서 harness §3.2를 "전면 restructure 선행 + 내용은 기능 단위로 점진 채움"으로 갱신해 문서 모순을 해소했다(남은 결정 없음).
- **출처 인용**:
  > "전면 restructure → `apps/web` + `apps/mobile` + `packages/domain` | ⚠️ ADR" — [04 §0.2 A1](../migration/04-rn-architecture.md)
  > "Expo 앱 위치를 결정한다: 현 repo 내부 `apps/mobile` 권장, shared TS package를 `packages/domain`으로 분리." — [00 §6.2](../migration/00-rn-conversion-plan.md)

### 결정 2 — 공유 TS 패키지 = `packages/domain` (04 A1)

- **결정**: 양 앱이 공유하는 순수 도메인 로직(validators·keywords·challenge·bank·share + 공유 unit test)을 `packages/domain`에 둔다. `@withkey/domain` workspace 패키지로만 참조(상대경로 import 금지). 패키지는 `dist` 없이 `./src/index.ts`를 export하고, `apps/web`은 `transpilePackages`, `apps/mobile`은 Metro `watchFolders`로 TS source를 직접 해석한다(A2).
- **근거**: build step 0 — `.ts` 수정이 양 앱에 즉시 반영되어 "같은 소스·같은 test"([harness §3.2](../migration/02-rn-migration-harness.md) 드리프트 1차 방어선) 마찰을 최소화한다. `packages/domain`은 **순수 유지**(서비스/네트워크/RN·Next 전용 코드 미포함)하고, `apps/mobile/features/*`는 도메인 로직을 재구현하지 않고 소비만 한다.
- **트레이드오프**: 순수성을 강제하려면 계층 의존 규칙(eslint boundary)과 "도메인 로직 재구현 금지" 리뷰 규율이 필요하다 — 벌금/정산/done day/keyword 계산이 feature에 새면 드리프트가 재발한다. 공유 디자인 토큰(`packages/tokens`)·DB 타입 공유는 이 패키지에 넣지 않고 cutover 후 재검토(A10).
- **출처 인용**:
  > "packages/ └─ domain/ # validators·keywords·challenge·bank·share + 공유 unit test" — [04 §1 트리](../migration/04-rn-architecture.md)
  > "A2 domain TS source 직접 (확정): `packages/domain`이 `dist` 없이 `./src/index.ts`를 export … 도메인은 `@withkey/domain` workspace 패키지로만 참조(상대경로 import 금지)." — [04 §1](../migration/04-rn-architecture.md)

### 결정 3 — PWA 유지 범위 = 전환기 fallback + BFF 호스트 (00 §7)

- **결정**: PWA(`apps/web`)를 cutover 전까지 폐기하지 않고 전환기 동안 유지한다. 유지 범위는 (1) invite/OG/share fallback과 웹 리다이렉트 호환, (2) 미설치 deferred 복구의 웹 랜딩 경유(재탭), (3) `apps/web` Next API route를 RN의 BFF 호스트로 겸임(결정 4), (4) 기존 PWA 사용자 backward-compatibility window. PWA 축소·폐기는 cutover 후 별도 결정한다.
- **근거**: invite 링크는 카카오톡으로 https로 공유되므로 Universal/App Links가 앱을 열되, 미설치 사용자에겐 웹 랜딩 + OG 카드 + 스토어 유도가 필요하다([04 A7](../migration/04-rn-architecture.md): Firebase Dynamic Links 2025-08-25 종료로 자동 deferred 수단 부재 → 재탭). 공유 카드/영상은 `next/og`·ffmpeg 서버 의존이라 RN은 다운로드/공유만 담당한다. 전환기엔 PWA·RN이 같은 Supabase DB/RPC를 동시에 써야 한다.
- **트레이드오프**: 전환기 동안 PWA·RN 이중 운영 비용을 받아들인다 — 두 클라이언트가 같은 DB/RPC를 쓰므로 Phase별 backward-compatibility window를 완료 조건에 포함해야 한다([00 §5 "운영 이중화"](../migration/00-rn-conversion-plan.md)). PWA를 즉시 폐기하면 초대·공유·미설치 진입 경로가 깨지므로 폐기는 dogfood GO 이후로 미룬다.
- **출처 인용**:
  > "PWA는 전환 기간 동안 invite/OG/share fallback과 웹 리다이렉트 호환을 위해 유지한다." — [00 Architecture 머리말](../migration/00-rn-conversion-plan.md)
  > "Phase 8. Cutover … PWA fallback 정책, invite URL app link 우선, analytics cohort 비교, dogfood GO/NO-GO" — [00 §7](../migration/00-rn-conversion-plan.md)

### 결정 4 — BFF 범위 = Hybrid (RPC direct + `apps/web` Bearer BFF) (04 A8)

- **결정**: 쓰기/읽기 경로를 둘로 나눈다. **RLS-safe**(`create_challenge`·`accept_invite`·`sign_and_maybe_activate`·`toggle_kudos`·`rename_group` 등 + RLS read)는 RN이 Supabase RPC/PostgREST를 직접 호출한다. **secret 필요**(`submitActionLog`의 Storage+AI+push·`revealAccountNumber`·계좌 암호화·push register·정산 trigger)는 기존 `apps/web` Next API route를 BFF로 재사용한다. BFF 인증은 cookie가 아니라 `Authorization: Bearer <Supabase access token>`을 받아 `supabase.auth.getUser(token)`으로 검증한다(cookie 경로는 PWA용 유지).
- **근거**: OpenAI·crypto·push는 secret이라 client RPC로 불가하다. BFF를 기존 `apps/web`으로 두면 `src/lib/{ai,push,storage}`·암호화·analytics server emitter를 Node→Deno 포팅 없이 그대로 쓰고 Vercel 배포를 유지한다. Edge Function 이전은 Deno 재작성 비용이 커 POC엔 과하다 → cutover 후 재검토. RN은 쿠키가 없어 `@supabase/ssr` cookie flow를 못 쓰므로 Bearer로 검증한다.
- **트레이드오프**: `apps/web`이 cookie(PWA)·Bearer(RN) 두 인증 경로를 동시에 지원해야 한다(`require-user`/`with-user`를 Bearer 경로로 보강). BFF를 Vercel·`apps/web`에 묶어두는 결합을 받아들이는 대신 포팅 비용 0을 택했다 — Edge Function 분리는 보류한다. service-role mutation(`deleteChallenge`·`leaveChallenge`·`endChallenge`: DELETE RLS 정책 없음) 등 세부 BFF vs RPC 승격은 [00 §13.4 D-4·D-5·D-6·D-7](../migration/00-rn-conversion-plan.md)에서 후속 결정한다.
- **출처 인용**:
  > "A8 쓰기/BFF | Hybrid: RPC direct + apps/web Next API as BFF(Bearer) | 확정" — [04 §0.2 A8](../migration/04-rn-architecture.md)
  > "A8 Hybrid (확정): BFF는 기존 `apps/web` Next API route 재사용 … Edge Function 이전은 Deno 재작성 비용이 커 POC엔 과함 → cutover 후 재검토." — [04 §5](../migration/04-rn-architecture.md)

## Alternatives Considered

### 1. 모바일을 별도 repo로 분리

- **Pros**: web과 mobile의 의존·CI를 완전 격리.
- **Cons**: `supabase/` 스키마·`packages/domain` 도메인 로직을 두 repo가 공유하려면 publish/버전 핀 또는 git submodule이 필요 → 드리프트·동기화 비용 증가.
- **Why not**: 같은 소스·같은 test로 드리프트를 막는 1차 방어선이 깨진다. [00 §6.2](../migration/00-rn-conversion-plan.md)가 현 repo 내부 `apps/mobile`을 권장(결정 1).

### 2. 점진 이동 (모노레포 전면 개편 선행 없이)

- **Pros**: 큰 일괄 변경 없이 점진적.
- **Cons**: `apps/web`/`apps/mobile`/`packages/domain` 경계가 늦게 잡혀 import 경로가 두 번 바뀌고, 부트스트랩이 불안정한 레이아웃 위에서 시작.
- **Why not**: [harness §3.2 ⓐ 갱신](../migration/04-rn-architecture.md)으로 "전면 restructure 선행 + 내용은 기능 단위로 점진 채움"으로 확정(결정 1 트레이드오프).

### 3. BFF를 Supabase Edge Function(Deno)으로 신설

- **Pros**: web과 독립된 RN 전용 서버 경계.
- **Cons**: `src/lib/{ai,push,storage}`·암호화·analytics emitter를 Node→Deno로 재작성해야 함 — POC 기간 대비 비용 과다.
- **Why not**: 포팅 0인 `apps/web` API route 재사용을 택함. Edge Function 이전은 cutover 후 재검토([04 A8](../migration/04-rn-architecture.md), 결정 4).

### 4. PWA 즉시 폐기 (RN 단독 전환)

- **Pros**: 이중 운영 비용 제거.
- **Cons**: invite/OG/share fallback·미설치 웹 랜딩·웹 리다이렉트 호환·기존 사용자 backward compat가 모두 깨짐.
- **Why not**: 전환기 fallback + BFF 호스트로 유지하고 폐기는 dogfood GO 이후로([00 §7 Phase 8](../migration/00-rn-conversion-plan.md), 결정 3).

## Consequences

### 긍정적

- target 모노레포 레이아웃(`apps/web`+`apps/mobile`+`packages/domain`)이 고정되어 Phase 1(Expo Foundation) 부트스트랩이 안정된 구조 위에서 시작한다.
- `packages/domain` 공유 + 보존 eval로 비즈니스 로직 드리프트를 막는 1차 방어선이 선다.
- BFF를 기존 `apps/web`으로 재사용해 AI·암호화·push 서버 코드의 포팅 비용이 0이다.
- [00 §8 goal 2](../migration/00-rn-conversion-plan.md)와 [00 §13.4 D-1](../migration/00-rn-conversion-plan.md)이 충족되어 Phase 1 진입 게이트 1건이 해제된다.

### 부정적 / 비용

- restructure가 `src/lib/supabase/**` 등 인증 백본 import를 일괄 이동시키고 Vercel root dir·CI 경로 재설정을 동반한다.
- 전환기 동안 PWA·RN 이중 운영 — 같은 DB/RPC를 쓰는 backward-compatibility window를 Phase별로 관리해야 한다.
- `apps/web`이 cookie·Bearer 두 인증 경로를 동시에 지원해야 한다.

### 후속 영향

- [04 §0.2 A1](../migration/04-rn-architecture.md)의 `⚠️ ADR` 상태 마커를 본 ADR(0033)로 연결한다(이 PR에서 1줄 갱신).
- 본 ADR이 닫지 **않는** 세부 결정은 [00 §13.4](../migration/00-rn-conversion-plan.md)의 후속 ADR/spec으로 남는다 — D-2(push token), D-3(analytics 경로), D-4(admin hydrate read의 RN 계약), D-5(service-role mutation → RPC 승격), D-6(계좌 암호화 BFF), D-7(`submitActionLog` BFF 계약), D-8(auth/deep-link PoC).
- 본 ADR은 Repo 토폴로지·PWA·BFF 경계만 박제한다. 인증 백본(Kakao 네이티브, [04 A6](../migration/04-rn-architecture.md))·push 테이블([04 A9](../migration/04-rn-architecture.md))은 별도 ADR 대상이다.

## 용어집

- **BFF**: Backend for Frontend — RN ↔ Supabase 사이 보안 경계 서버(여기선 `apps/web` Next API route). secret(OpenAI·암호화 키·push)이 필요한 경로를 대신 수행
- **CNG / Expo / EAS / Universal·App Links**: [04 용어집](../migration/04-rn-architecture.md) 참조
- **cutover**: PWA에서 RN으로 운영을 최종 전환하는 시점. 이 전까지가 "전환기"
- **monorepo restructure**: 단일 패키지 repo를 `apps/*`+`packages/*` 다중 패키지로 재구성
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어(Supabase). RLS-safe 경로는 RN client가 RPC를 직접 호출 가능
- **RPC**: Remote Procedure Call — Supabase Postgres 함수. supabase-js `rpc()`로 호출, RLS/트랜잭션이 권한 보장
- **transpilePackages**: Next.js가 workspace 패키지 소스를 직접 트랜스파일하게 하는 설정(`packages/domain`을 `dist` 없이 소비)
