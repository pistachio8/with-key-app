# 디버깅용 개발자 로그인 모드 (카카오 우회) — 설계

> 상태: Draft · 작성일 2026-06-19 · grill 반영 2026-06-19 · 대상 앱: `apps/web`(PWA) + `apps/mobile`(RN)
>
> 이 문서는 brainstorming 세션의 산출물이다. 카카오 SSO·매직링크가 모두 막히는 실기기/Preview 환경에서, 숨긴 진입점으로 미리 정의된 테스트 계정에 즉시 로그인하는 **개발자 전용** 경로를 정의한다.

## 1. 배경 / 문제

실기기 디버깅에서 로그인 자체가 막힌다.

- **카카오 SSO**: 카카오앱 설치 + OAuth 왕복이 필요해 dev client에서 깨지기 쉽다.
- **매직링크 fallback**: RN은 universal link(App Links)로 앱에 복귀하는데, 무료 Personal Team 빌드는 `associatedDomains`를 제거한 상태라 App Links가 죽어 fallback도 막힌다.

결과적으로 실기기/Preview에서 **로그인을 못 해 화면 디버깅이 불가**하다. 카카오를 우회해 세션을 얻는 개발자 모드가 필요하다.

기존 자산:

- 웹: `/auth/dev-login` 라우트(`token_hash` 검증 → 쿠키) + `pnpm login:link` 스크립트(admin `generateLink`)가 이미 존재. `NODE_ENV !== 'production'` 게이트.
- RN: `verifyMagicLinkToken(tokenHash)` 함수가 이미 존재(매직링크 토큰 → 세션 교환).
- 즉 **양쪽 모두 token_hash → 세션 교환 패턴을 이미 보유**. 이 설계는 그 패턴을 재사용한다.

## 2. 목표 / 비목표

### 목표

- 웹·RN 양쪽에서, 숨긴 제스처로 dev 메뉴를 열어 **여러 테스트 계정 중 하나를 골라 즉시 로그인**.
- 운영(Production)에는 어떤 표면·인증 방식도 새로 노출하지 않는다.
- 신규 서버 라우트 0개 — 기존 `/auth/dev-login`과 `verifyMagicLinkToken`을 재사용.
- 2개 시나리오 계정(진행중 멤버 / 비제로 잔액)을 데이터까지 seed해 상태별 화면을 디버깅.

### 비목표

- 일반 사용자용 기능이 아니다. UI는 dev 빌드/Preview에서만 보이고 Production 빌드에서 strip된다.
- 새 인증 provider(password 등)를 켜지 않는다.
- 비밀번호 기반 로그인, 임의 이메일 로그인은 범위 밖(B 메커니즘 채택, [§5](#5-메커니즘-b--dev-전용-토큰-발급)).

## 3. 결정 요약

| #   | 결정                                                                           | 근거                                                                                                                                       |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | 대상: 웹 + RN 둘 다, 일관 UX                                                   | 양쪽 다 실기기/Preview에서 로그인 막힘                                                                                                     |
| D2  | 진입: 숨긴 제스처 → dev 메뉴(계정 목록)                                        | UI 노출 없이 은닉. 단 제스처는 보안이 아님([§4](#4-게이팅-모델))                                                                           |
| D3  | 계정: 여러 테스트 계정 중 선택                                                 | 멤버십·정산 상태가 다른 화면을 갈아끼우며 디버깅                                                                                           |
| D4  | 메커니즘 B: dev 전용 토큰 엔드포인트 + **정확 이메일 allowlist + 존재 확인**   | prod에 아무것도 안 켜고 기존 token_hash 패턴 재사용. junk 계정 생성·무단진입 차단                                                          |
| D5  | Supabase는 preview·prod 공유 단일 프로젝트                                     | seed/설정이 prod에도 존재 → 게이팅이 척추                                                                                                  |
| D6  | fixture 2종: 진행중 멤버 / **그룹 멤버+비제로 잔액**                           | grill 결과 "정산 완료"의 목표가 잔액 UI뿐 → full lifecycle 대신 `grant_bundle_points`로 축소                                               |
| D7  | 서버 게이트 = 명시 플래그 `DEV_LOGIN_ENABLED` (`VERCEL_ENV` 추론 폐기)         | `dev.fromwith.app`이 자체 Vercel prod로 매핑되면 추론 게이트가 깨짐                                                                        |
| D8  | seed 재실행 = 결정적 ID + skip-if-exists (파괴적 reset 금지)                   | `point_ledger` append-only 트리거가 admin 포함 전 role의 UPDATE/DELETE 차단 → 잔액 삭제 불가                                               |
| D9  | RN 대상 = **Vercel Preview(develop) 안정 alias** · Protection ON + bypass 토큰 | per-deploy URL은 매 배포 변동 → 안정 alias 필요. Preview 인증 벽이 RN fetch를 막아 → `x-vercel-protection-bypass` 토큰으로 통과(겸 시크릿) |

> **D4·D6·D7·D8은 2026-06-19 grill 세션에서 확정** — 정산 RPC 본문(`0044_settlement_rpcs.sql`)을 읽고 비용·제약을 검증한 결과다.
>
> **D5 확정 근거**: `ai_cost_log.scope ∈ {prod,test}` 격리 컬럼, "Vercel Production+Preview env 동일 값", prod 활성화를 별도 프로젝트가 아니라 Supabase Auth Redirect URLs로 게이트한 이력. 따라서 어떤 seed 계정/설정도 prod에 존재한다는 전제로 설계한다.

## 4. 게이팅 모델

prod 공유 프로젝트(D5)이므로 "어디서 켜지고 꺼지는가"가 설계의 척추다. RN이 때릴 대상은 **Vercel Preview(develop) 배포의 안정 alias**이고(D9), 명시 플래그로 켠다(D7).

| 레이어                   | 게이트                                             |     local     | dev 배포(Vercel Preview·develop) |     prod(`fromwith.app`)      |
| ------------------------ | -------------------------------------------------- | :-----------: | :------------------------------: | :---------------------------: |
| 클라이언트 dev 메뉴 노출 | web `NEXT_PUBLIC_DEV_LOGIN === '1'` / RN `__DEV__` |      ✅       |       ✅(Preview env 등록)       | ❌(env 미등록·release strip)  |
| 서버 토큰 엔드포인트     | `DEV_LOGIN_ENABLED === 'true'` (명시 env)          |      ✅       |      ✅(Preview env scope)       | ❌ 404(Production env 미등록) |
| 토큰 발급 대상           | `DEV_LOGIN_EMAILS` 정확 일치 + admin **존재 확인** | seed된 계정만 |          seed된 계정만           |               —               |
| (RN 한정) 엣지 접근      | Vercel **Protection Bypass** 토큰 헤더             |       —       |               필수               |               —               |

**왜 다층 방어인가**: 제스처는 은닉일 뿐 보안이 아니다 — 빌드에 코드가 실리면 누구나 제스처를 찾아낼 수 있다. 그래서 ① prod release 빌드에서 UI·코드 strip, ② 서버 엔드포인트는 `DEV_LOGIN_ENABLED`를 안 넣은 Production env에서 404, ③ 설령 게이트가 뚫려도 발급 대상이 `DEV_LOGIN_EMAILS` 정확 일치 + admin 존재 확인으로 묶여 **실유저 토큰 발급·junk 계정 생성이 둘 다 불가**, ④ Preview는 **Vercel Authentication(Protection)이 ON**이라 bypass 토큰 없는 외부 요청은 우리 코드에 닿기 전에 엣지에서 차단. dogfooding은 Preview에서 일어나므로 Preview env scope에만 `DEV_LOGIN_ENABLED`를 켜고 Production env엔 넣지 않는다.

**왜 `VERCEL_ENV` 추론을 안 쓰나**: dev 도메인을 Vercel에서 자체 production으로 매핑하면 거기서도 `VERCEL_ENV === 'production'`이라 추론 게이트가 엔드포인트를 잘못 404시켜 RN 경로가 죽는다. 명시 플래그는 배포 분류와 무관하게 "내가 켠 곳만 켜짐"을 보장한다.

**Preview 운영 전제 (D9)**: ⓐ RN `DEV_LOGIN_URL`은 **develop 브랜치 안정 alias**(per-deploy 해시 URL ❌ — 매 배포 변동). ⓑ Preview Protection은 **끄지 않는다**(끄면 모든 preview 배포가 공개돼 dogfood 데이터 노출) — 대신 RN만 bypass 토큰으로 통과. 사람은 Vercel 팀 로그인 상태라 웹 메뉴는 그대로 동작. ⓒ Protection이 실제 ON인지는 운영 관행(`ONBOARDING.md:716` = "Preview URL 접근에 팀 초대 필요")으로 추정 — **구현 전 Vercel 프로젝트 Settings에서 직접 실측 확인**(frontend-reviewer).

## 5. 메커니즘 B — dev 전용 토큰 발급

### 5.1 공유 서버 코어 (web 앱 내)

```ts
// apps/web/src/lib/auth/dev-login.ts  (신규)
export function isDevLoginEnabled(): boolean; // process.env.DEV_LOGIN_ENABLED === 'true'
const DEV_EMAILS = (process.env.DEV_LOGIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean); // seed한 계정들과 정확 일치
export async function mintDevToken(email: string): Promise<string>;
//   1) isDevLoginEnabled() 아니면 throw(→ 라우트가 404)
//   2) DEV_EMAILS 정확 일치 아니면 throw(→ 400)  ← 임의·실유저 이메일 차단의 실질 방어선
//   3) const { data } = await adminClient().auth.admin.generateLink({ type:'magiclink', email })
//      → const hashedToken = data.properties.hashed_token   (필드명: hashed_token, token_hash 아님)
//   4) hashedToken 반환 (호출자가 이를 verifyOtp 의 token_hash 인자로 전달)
```

util 하나가 게이트 + allowlist + admin 발급을 단일 책임으로 들고, 라우트는 전송만 담당한다. **왜 분리**: 게이트·allowlist 로직을 한 곳에서 단위 테스트하고 라우트는 얇게 유지.

> **리뷰 교정 (2026-06-19 backend-reviewer)**: ① 반환 필드는 `data.properties.hashed_token`이다(`token_hash` 아님 — 기존 `dev-login-link.mjs:50` 동일 패턴). ② auth-js admin엔 **이메일 기반 존재 확인 API가 없다**(`getUserById`만, `getUserByEmail` 부재; `listUsers`는 page/perPage만). 게다가 `generateLink(type:'magiclink')`는 **미존재 이메일을 새로 생성**한다(`GoTrueAdminApi.d.ts:147`). 따라서 "존재 확인으로 생성 차단"은 불가 — 대신 **정확 이메일 allowlist + seed 선행**이 방어선이다(통과 가능한 이메일은 seed된 N개뿐이라 generateLink가 만들 수 있는 것도 그 dev 계정뿐, 실유저는 원천 불가). 더 조이려면 seed가 출력한 UUID를 `DEV_LOGIN_USER_IDS` env로 보유해 `getUserById`로 확인(선택적 hardening).

### 5.2 두 transport (기존 `/auth/dev-login` 라우트 확장 — 신규 라우트 0개)

```
apps/web/src/app/auth/dev-login/route.ts  (기존 확장)
  ?token_hash=...            → (기존) verifyOtp + 쿠키 + redirect      [CLI 경로 유지]
  ?email=...&next=/home      → mintDevToken → verifyOtp + 쿠키 + redirect [web 메뉴]
  ?email=...&format=token    → mintDevToken → JSON { hashed_token }       [RN 메뉴]
  disabled                   → 404
```

> **⚠️ 게이트 교체 (추가 아님)**: 현재 `route.ts:8`은 `process.env.NODE_ENV === 'production'`으로 게이트한다. Vercel은 **Preview·Production 빌드 모두 `NODE_ENV==='production'`**이라 이 게이트를 두면 Preview에서도 404가 되어 RN·web 경로가 죽는다. 구현 시 이 줄을 **`if (process.env.DEV_LOGIN_ENABLED !== 'true') return 404`로 교체**한다(D7). 3개 리뷰어가 독립적으로 지적한 선결 과제 — `NODE_ENV` 게이트를 남긴 채 분기만 추가하면 안 된다.

**왜 라우트 재사용**: `app/api/*`는 외부 콜백·RN BFF(Bearer) 전용 가드레일이 있다. dev-login은 이미 `app/auth/dev-login`에 존재하는 인증 보조 표면이라 거기 얹는 것이 가드레일과 충돌하지 않고 신규 표면을 만들지 않는다.

### 5.3 Web 클라이언트 — 숨긴 메뉴

```
apps/web/src/app/(auth)/login/_components/dev-login-menu.tsx  (신규)
  - NEXT_PUBLIC_DEV_LOGIN === '1' 일 때만 렌더 (이미 "use client"인 login-screen.tsx 에서 import)
  - login-screen.tsx 의 로고 <Image>(h1 내, line 134)에 5회 탭 카운터 → 계정 목록 시트(Sheet, src/components/ui/sheet 재사용)
  - 항목 탭 → window.location = /auth/dev-login?email=<picked>&next=/home  (쿠키 set + redirect)
  - (가드레일 OK: window.location 이동은 브라우저 navigation이라 "useEffect+fetch 쓰기 금지"·Server Action 일원화 대상 아님)
```

### 5.4 RN 클라이언트 — 숨긴 메뉴

```
apps/mobile/src/features/auth/dev/dev-login-sheet.tsx  (신규)
  - __DEV__ 일 때만 렌더 (release 빌드에서 dead-code strip)
  - login.tsx 의 "fromwith" kicker(상단 라벨, styles.kicker) 길게 누르기 → 계정 목록
    (주의: "로그인" title 이 아니라 "fromwith" 문자열을 가진 kicker. login.tsx:74)
  - 항목 탭 → res = fetch(`${DEV_LOGIN_URL}/auth/dev-login?email=<picked>&format=token`,
              { headers: { 'x-vercel-protection-bypass': VERCEL_BYPASS } })   ← Preview 인증 벽 통과
            → res.ok && JSON 응답 확인(아니면 에러 토스트) → { hashed_token }
            → verifyMagicLinkToken(hashed_token)   ← 기존 함수 재사용
  - DEV_LOGIN_URL: `EXPO_PUBLIC_DEV_LOGIN_URL` = develop 브랜치 **안정 alias**(per-deploy URL ❌).
  - VERCEL_BYPASS: Protection Bypass for Automation 토큰.
  - 전제: Preview 의 Supabase 프로젝트 = RN 의 EXPO_PUBLIC_SUPABASE_URL — `ONBOARDING.md:705`(local/CI/preview 가 프로젝트 1개 공유)로 확인, RN env 만 sanity-check.
```

> **⚠️ prod 번들 토큰 누출 방지 (frontend-reviewer)**: `EXPO_PUBLIC_*`는 **빌드 시점에 번들에 인라인**된다 — `__DEV__` 분기가 release에서 제거돼도 값 문자열이 남을 수 있다. 따라서 `DEV_LOGIN_URL`·`VERCEL_BYPASS`는 `app.config.ts`에서 **`appVariant === 'dev'`일 때만** `extra`에 주입하고, 그 외 variant는 `undefined`로 둔다(기존 `bffBaseUrl` extra 패턴 활용). 코드는 `Constants.expoConfig?.extra?.devLoginUrl` 식으로 읽어, prod 빌드엔 값 자체가 없게 한다.

### 5.5 계정 목록 출처

각 앱 dev 폴더에 작은 상수를 둔다.

```ts
const DEV_ACCOUNTS = [
  { label: "멤버·진행중", email: "member-active@fromwith.test" },
  { label: "잔액 있음", email: "balance@fromwith.test" },
];
```

서버 allowlist(`DEV_LOGIN_EMAILS` env)와 이 표시 목록은 **같은 이메일 집합**으로 맞춘다(정확 일치). 계정을 늘리면 env와 목록을 함께 갱신한다 — 약간의 중복을 감수하고 임의 생성·무단진입 위험을 없앤다. `.test`는 RFC 6761 예약 TLD라 실유저 이메일과 충돌하지 않는 이름 공간으로만 쓴다.

### 5.6 데이터 흐름

```
[제스처] → [계정 목록] → 탭
  web:  GET /auth/dev-login?email → (서버) mint+verify → Set-Cookie → /home   (사람=Vercel 팀 로그인)
  RN:   GET /auth/dev-login?email&format=token  + x-vercel-protection-bypass 헤더
        → {token_hash} → verifyMagicLinkToken → SessionProvider 갱신 → /home
```

핵심 불변: **admin secret은 서버에만**, RN은 토큰을 받아 기존 클라이언트 경로로 교환.

## 6. 계정 seed & fixture

`auth.users`는 SQL seed가 불가(생성은 admin API 또는 매직링크) → 스크립트로 생성한다.

```
apps/web/scripts/dev-seed-accounts.mjs  (신규, dev-login-link.mjs 패턴)
  - DEV_ACCOUNTS 각 이메일을 admin.createUser (이미 있으면 skip — 멱등)
  - 계정별 fixture 행도 함께 심음(§6.2). linked 공유 프로젝트에 1회 수동 실행.
  - password 불필요(B는 generateLink로 발급)
```

### 6.1 fixture 시나리오 (2종)

> grill 2026-06-19 — "정산 완료" 계정의 목표는 **잔액 UI**뿐임을 확인. 다수 참여자 full lifecycle을 버리고 `grant_bundle_points` 한 방으로 축소(D6).

| 계정                          | 상태                                                       | 디버깅 대상                | seed 경로                                                                                                   |
| ----------------------------- | ---------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `member-active@fromwith.test` | 그룹 멤버 · 활성 챌린지 · 서약 완료 · 액션 로그/kudos 일부 | 메인 홈·피드               | admin insert (`users`+`groups`+`group_members`+`challenges`+`challenge_participants`+`action_logs`+`kudos`) |
| `balance@fromwith.test`       | 그룹 멤버 · 비제로 포인트 잔액                             | 잔액 숫자·포인트 게이지 UI | admin insert (`users`+`groups`+`group_members`) → `grant_bundle_points` 1회                                 |

### 6.2 seed 방식 — admin 위주, ledger만 RPC

- **`balance` 계정**: `users`+`groups`+**`group_members`** 행 admin insert → `grant_bundle_points(user, group, amount, FIXED_REF)` 1회. `hold_deposit`·`settle_challenge`·peer 계정 **전부 불필요**.
- **`member-active` 계정**: 그룹·`group_members`·활성 챌린지·참가자(`signed_at` set, `deposit_points=0`)·`action_logs`·`kudos`를 admin insert. `point_ledger`를 안 건드리므로 RPC 불필요.

**왜 ledger만 RPC인가**(0044 본문 검증): `point_ledger`는 직접 insert가 트리거 `prevent_point_ledger_direct_write`로 막히고, 잔액 생성 경로 `grant_bundle_points`는 **service_role 전용 + `ref_id` 멱등**이다. 그래서 잔액만 이 RPC를 타고 나머지 행은 admin이 직접 넣는다. `hold_deposit`은 `auth.uid()`(참가자 본인 세션)를 요구하므로 admin이 못 부르지만, "잔액만" 목표엔 필요 없다.

> **리뷰 교정 (migration-reviewer) — seed 구현이 막히는 지점**:
>
> - **`action_logs` NOT NULL/CHECK**(`0001_init.sql`): `photo_url`·`selected_keywords`(1~3개 CHECK)·`shown_keywords`·`ai_summary`(≤150자)·`prompt_version`·`activity_type`(enum)을 **전부 명시 공급**해야 한다. "admin insert" 한 줄로는 23502/23514로 실패. (immutability 트리거 0045·0046은 UPDATE 전용이라 INSERT는 통과.)
> - **`group_members` INSERT 정책 부재**(`0002_rls.sql`): anon/authenticated엔 정책이 없어 **service_role(admin)로만** 멤버 행 생성 가능 — 잔액 read RLS(`point_ledger_select_self_or_group`)와 그룹 화면 RLS(`is_group_member`)가 멤버 행을 전제하므로 필수. (`point_balance` 숫자 자체는 self-RLS로 멤버 행 없이도 읽히나, 그룹 UI 맥락이 빈 상태가 됨.)
> - **활성 챌린지 직삽**: RLS상 active 직접 insert는 **service_role만** 가능(클라 RLS 불가) — 차단 트리거는 없음. `start_at`·`end_at`을 직접 채우고, `0029_one_active_challenge_per_group` partial unique index가 service_role에도 적용되므로 group당 active 1개만.
> - `challenge_participants.deposit_points=0` admin insert는 트리거가 허용(0044 §D).

### 6.3 재실행(idempotency) — 제약이 강제

`point_ledger`는 append-only다. 트리거가 INSERT가 아닌 op를 **admin 포함 모든 role에서 차단**한다(`0044_settlement_rpcs.sql:28-30` — service_role 예외는 INSERT 분기에만 적용). 즉 한 번 grant한 잔액은 **삭제 불가** → "wipe 후 재생성"이 원천 불가능하다. 따라서 seed는 **결정적 UUID + skip-if-exists**만 쓴다.

- 계정: `admin.createUser` 실패(이미 존재) → skip.
- 그룹·챌린지·참가자·로그: 계정별 **고정 UUID** + `on conflict do nothing`.
- 잔액: `grant_bundle_points`의 `ref_id`를 계정별 고정값 → 재실행 no-op.
- **금지**: 파괴적 reset(ledger 삭제 시도)은 트리거에 막혀 실패한다. amount를 잘못 넣으면 되돌릴 수 없으니 신중히 — 정정은 보정 grant 또는 새 계정으로만 가능.

## 7. 보안 고려

- **prod 무노출**: [§4](#4-게이팅-모델) 게이트로 운영에 표면·인증방식·UI를 노출하지 않는다. 서버는 `DEV_LOGIN_ENABLED` 미설정 시 404(D7).
- **실유저 보호 + junk 생성 차단**: 방어선은 **`DEV_LOGIN_EMAILS` 정확 일치**다(비-allowlist는 admin 호출 전 400). 통과 가능한 이메일이 seed된 N개뿐이라, `generateLink`가 만들 수 있는 계정도 그 dev 계정으로 한정되고 **실유저·임의 이메일은 원천 불가**. ⚠️ auth-js엔 이메일 기반 존재 확인 API가 없어(`getUserById`만) "존재 확인으로 생성 차단"은 못 한다 — seed 선행이 전제이며, 더 조이려면 seed UUID를 `DEV_LOGIN_USER_IDS`로 보유해 `getUserById` 확인(선택, [§5.1](#51-공유-서버-코어-web-앱-내)).
- **미들웨어**: `/auth/dev-login`은 미인증 접근이 가능해야 한다(로그인 전 호출). 미들웨어 `isAuthRoute`가 `/auth` 접두를 이미 허용 — **확인 완료**(`apps/web/src/lib/supabase/middleware.ts:38`).
- **토큰 로깅 금지**: 발급된 token_hash·세션 토큰 본문을 로그에 남기지 않는다(AI 일기 가드레일과 동일 원칙). 메타(allowlist 결과·실패 코드)만.
- **Preview Protection + bypass 토큰 (D9)**: dev 배포는 Vercel Authentication(Protection)이 ON이라 외부 요청은 엣지에서 차단된다. RN 자동화만 `x-vercel-protection-bypass` 토큰으로 통과 — 이 토큰이 사실상 `DEV_LOGIN_SECRET` 역할을 겸한다. **Protection 을 끄지 않는다**(끄면 모든 preview 가 공개돼 dogfood 데이터 노출). 토큰은 dev 빌드에만 주입되고 release 는 strip.
- **blast radius**: bypass 토큰 + 정확 이메일 allowlist + 기존 계정으로 묶여, 최악의 경우도 "미리 만든 test 계정 로그인"으로 한정된다.

## 8. 에러 처리

- 엔드포인트: disabled → 404 · 비-allowlist 이메일 → 400 · `generateLink` 실패 → 502.
- web 메뉴: redirect 실패 시 기존 `?error=` 쿼리 재사용.
- RN 메뉴: **fetch 자체 실패도 처리**(frontend-reviewer) — `res.ok` 확인 + content-type이 JSON인지 검사한 뒤 파싱. Preview Protection 미통과(302/HTML)·404·네트워크 단절 시 HTML을 `JSON.parse`하다 silently 깨지는 경로를 막고 명시 토스트. 그 다음에야 `verifyMagicLinkToken` 실패 처리.

## 9. 테스트 & 검증

- **unit**: `mintDevToken` — `DEV_LOGIN_EMAILS` 비일치 거부 / 미존재 유저 거부(생성 안 함) / `isDevLoginEnabled` false면 거부(admin mock).
- **unit**: 라우트 분기 — `token_hash` vs `email` vs `format=token` vs disabled 404(env mock).
- 기존 `verifyMagicLinkToken` 테스트는 그대로 유효.
- **manual**: Preview 웹에서 메뉴 로그인 1회 + RN dev client 실기기에서 1회 E2E.
- 표준 게이트: `pnpm typecheck` · `pnpm lint` · `pnpm test`. 설정/env 추가가 있으므로 web은 `pnpm build` 1회.

## 10. 영향 파일

| 경로                                                           | 변경                                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/auth/dev-login.ts`                           | 신규 — `isDevLoginEnabled` · allowlist · `mintDevToken`                                                                                                          |
| `apps/web/src/app/auth/dev-login/route.ts`                     | 확장 — `email`·`format=token` 분기                                                                                                                               |
| `apps/web/src/app/(auth)/login/_components/dev-login-menu.tsx` | 신규 — 숨긴 메뉴(web)                                                                                                                                            |
| `apps/web/src/app/(auth)/login/_components/login-screen.tsx`   | 제스처 트리거 연결                                                                                                                                               |
| `apps/web/scripts/dev-seed-accounts.mjs`                       | 신규 — 계정 + fixture seed(결정적 ID·멱등)                                                                                                                       |
| `apps/web/.env.example`                                        | `NEXT_PUBLIC_DEV_LOGIN`(Preview scope)·`DEV_LOGIN_ENABLED`(Preview scope)·`DEV_LOGIN_EMAILS` 주석 추가 (기존 단수 `DEV_LOGIN_EMAIL`=개인 스크립트용과 구분 명시) |
| `apps/mobile/src/features/auth/dev/dev-login-sheet.tsx`        | 신규 — 숨긴 메뉴(RN), bypass 헤더 fetch + 비-JSON 응답 가드                                                                                                      |
| `apps/mobile/src/app/(auth)/login.tsx`                         | 제스처 트리거 연결 (kicker `onLongPress`)                                                                                                                        |
| `apps/mobile/app.config.ts`                                    | `extra.devLoginUrl`·`extra.vercelBypass` — **`appVariant === 'dev'`일 때만 주입**(prod 번들 누출 방지)                                                           |

운영 영향: Supabase 테이블 변경 없음(기존 테이블/RPC 사용) · 신규 migration 없음 · 신규 인증 provider 없음. **Vercel 설정**: Preview env scope 에 `DEV_LOGIN_ENABLED`·`NEXT_PUBLIC_DEV_LOGIN`·`DEV_LOGIN_EMAILS` 등록 + Protection Bypass for Automation 토큰 발급(Production env 에는 미등록).

## 11. 스코프 경계 / 후속

- 본 스코프: web+RN 숨긴 메뉴 + 토큰 엔드포인트 + 2종 fixture seed(`member-active`·`balance`).
- 후속(별도): **정산 결과 화면 fixture**(참가자별 세션 `hold_deposit` → `settle_challenge` full lifecycle — grill에서 비용 과다로 분리), 추가 시나리오(빈 신규 유저 · pending invite), CI 자동 재seed.
- ~~`DEV_LOGIN_SECRET` 헤더~~ → Vercel Protection Bypass 토큰이 대체(D9), 별도 구현 불필요.

## 12. 용어집

- **allowlist**: 허용 목록. 여기서는 토큰 발급을 `DEV_LOGIN_EMAILS`에 정확히 일치하는 기존 이메일로만 제한하는 규칙.
- **append-only**: 추가만 가능하고 수정·삭제는 불가. `point_ledger`가 트리거로 강제 — seed 재실행이 결정적 ID·skip 방식이어야 하는 이유([§6.3](#63-재실행idempotency--제약이-강제)).
- **App Links / universal link**: https 링크로 네이티브 앱을 여는 OS 기능. 도메인 검증(`associatedDomains`) 필요.
- **fixture**: 테스트용으로 미리 만들어 둔 데이터 상태(여기선 계정별 챌린지·정산 상태).
- **generateLink**: Supabase admin API. 이메일 발송 없이 매직링크 토큰(token_hash)을 생성.
- **idempotent(멱등)**: 여러 번 실행해도 결과가 같음. seed 스크립트가 이미 있으면 skip.
- **RFC 6761 `.test` TLD**: 표준이 테스트용으로 예약해 실제로는 등록·라우팅되지 않는 최상위 도메인. 실유저 이메일과 충돌하지 않음.
- **token_hash**: 매직링크 검증에 쓰는 해시 토큰. `verifyOtp(type:'email', token_hash)`로 세션 교환.
- **`VERCEL_ENV`**: Vercel이 주입하는 배포 환경 값(`production`·`preview`·없음=local). 본 설계는 게이트에 쓰지 않고(D7) 용어 참조용으로만 둠.
- **Vercel Preview Protection (Vercel Authentication)**: preview 배포를 Vercel 팀 로그인으로 보호하는 기본 기능. 켜져 있으면 외부/자동화 요청이 SSO 벽에 막힌다(`ONBOARDING.md:716`).
- **Protection Bypass for Automation**: 위 보호를 자동화 클라이언트가 통과하도록 Vercel이 발급하는 토큰. `x-vercel-protection-bypass` 헤더로 전송. 본 설계에서 RN 이 Preview 엔드포인트에 닿는 유일한 통로이자 추가 시크릿 역할.
- **안정 alias**: develop 브랜치 최신 배포를 항상 가리키는 고정 URL(per-deploy 해시 URL과 달리 배포마다 바뀌지 않음).
