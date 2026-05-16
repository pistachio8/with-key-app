# ADR-0006-users-onboarded-at: 온보딩 노출 판정을 `public.users.onboarded_at` 으로 이전

**Date**: 2026-05-16
**Status**: accepted
**Deciders**: pistachio8

## Context

PR3까지의 callback(`src/app/auth/callback/route.ts`)은 신규 가입자 판정을 `group_members count === 0` 으로 했다. 그러나 이 휴리스틱은 "현재 그룹 가입 상태"를 의미할 뿐 "사용자가 온보딩 슬라이드를 본 적 있는가" 와 의미가 어긋난다.

구체적 실패 케이스:

- 과거 dogfood 중에 그룹을 한 번이라도 만들었다 나간 사용자가 신규 슬라이드(PR3 이후 추가됨)를 영원히 보지 못함.
- 친구 초대로 그룹에 들어갔다 탈퇴한 사용자도 동일.
- 데이터 정리 후 재로그인한 사용자도 동일.

또한 슬라이드 컴포넌트(`onboarding-slides.tsx`)는 `localStorage["withkey:onboarded"]` 를 보조 게이트로 사용했는데, 이 또한 다음 문제를 가진다.

- 디바이스가 바뀌면 무력화 — 모바일/PC 양쪽에서 매번 노출.
- 시크릿 모드에서는 매 세션 새로 노출.
- DB 와 SoT 가 분리되어 서버/클라이언트 결정이 발산할 가능성 — 슬라이드가 보여야/말아야 한다는 판단이 두 곳에 존재.

PRD §3.2 Step 4 의 의도는 "처음 로그인한 사람에게 한 번만 보여 줌" 이며, `group_members` 와 `localStorage` 어느 쪽도 그 의도를 충실히 표현하지 못한다.

## Decision

온보딩 노출 판정의 Single Source of Truth 를 **`public.users.onboarded_at timestamptz`** 컬럼으로 단일화한다.

- **스키마**: `0026_users_onboarded_at.sql` — `alter table public.users add column if not exists onboarded_at timestamptz`. 기본 NULL. RLS 는 기존 `users_select_self_or_group` / `users_update_self`(0002) 가 self read/write 를 이미 허용하므로 변경 불필요.
- **callback 분기**: invite 우선 분기(`if (next) redirect(next)`) 는 유지. 그 외에는 `select onboarded_at from public.users where id = auth.uid()` — NULL/행없음이면 `/login?onboard=1`, NOT NULL 이면 `/home`.
- **write 경로**: `src/app/(auth)/login/_actions.ts` 에 `markOnboarded()` Server Action 추가. 슬라이드의 `finish()` 가 시작하기·건너뛰기 양쪽에서 동일하게 호출. 실패는 silent (console 만), 사용자는 결과 무관하게 `/home` 으로 라우팅.
- **localStorage 제거**: `ONBOARDED_KEY` 상수와 mount 시 검사·`finish()` 의 setItem 모두 삭제. 서버가 단일 SoT.
- **invite 사용자 처리**: invite 우선 분기를 유지하므로 invite 로그인 시 onboarded_at 은 NULL 로 남는다. 두 번째 비-invite 로그인에서 처음 슬라이드 노출 — 의도된 지연. `accept_invite` RPC(0018) 는 건드리지 않는다.
- **백필 없음**: 기존 사용자 전원 onboarded_at NULL 유지. 다음 비-invite 로그인에서 1회 노출. dogfood 규모(POC)에서 1회 재노출 비용 < "기존 사용자가 이미 봤다" 잘못된 가정의 비용.

## Alternatives Considered

### 1. 현재 휴리스틱 유지 + dogfood/QA 강제 트리거 (`?onboard=1` 직접 URL 또는 디버그 토글)

- **Pros**: 스키마 변경 없음, 변경 표면 최소.
- **Cons**: prod 사용자 중 "그룹 한 번 만들고 나간 사람" 이 슬라이드를 영원히 못 보는 본질적 문제는 해결되지 않음. QA 백도어가 prod 표면에 노출.
- **Why not**: 증상만 가리고 잘못된 SoT 를 그대로 둔다.

### 2. Supabase `auth.user_metadata` JSONB 필드

- **Pros**: 마이그레이션 불필요, Supabase Auth 가 자동 관리.
- **Cons**: 클라이언트 SDK 가 write 가능 — 사용자가 임의로 set/unset 할 수 있어 RLS 우회 가능. 분석/리포팅 시 `public.*` 테이블과 join 어색.
- **Why not**: 보안·관측성 둘 다 손해, `public.users` 컬럼 추가 비용이 미미.

### 3. `boolean` 컬럼 (`onboarded`)

- **Pros**: 단순.
- **Cons**: "언제 끝냈는지" 정보 손실. PRD §9.1 분석 이벤트와 시간 정합성 결여, 미래 funnel 분석 시 보강 join 필요.
- **Why not**: `timestamptz` 의 정보량 우위가 명백, 컬럼 크기 차이는 미미.

### 4. 전원 백필 `update public.users set onboarded_at = created_at`

- **Pros**: 기존 사용자에게 슬라이드 재노출 없음.
- **Cons**: PR3 이후 추가된 슬라이드를 한 번도 본 적 없는 기존 사용자가 영원히 못 보게 됨. 본 ADR 의 원래 문제를 일부 영구화.
- **Why not**: 신규 콘텐츠 노출이 본 PR 의 목적과 정면 충돌.

## Consequences

### 긍정적

- "온보딩 봤는가" 판정이 단일 SoT(`public.users.onboarded_at`) 로 모임. 디바이스 무관, 시크릿 모드 무관.
- 기존 dogfood 사용자 전원이 다음 로그인에 슬라이드 1회 노출 — PR3 콘텐츠 도달률 회복.
- 향후 PRD §9.1 funnel 분석에서 `onboarded_at` timestamp 를 그대로 활용 가능 (가입 → 온보딩 완료 lag, drop-off 등).
- 클라이언트 코드 단순화 — `useEffect` 1개·localStorage 분기·import 1개 감소.

### 부정적 / 비용

- 컬럼 1개 추가 — 무시 가능 수준의 스토리지 비용.
- 기존 dogfood 사용자가 슬라이드를 다시 한 번 보게 됨 (의도된 비용).
- invite 사용자는 두 번째 비-invite 로그인에서 처음 슬라이드를 봄 — 약간 어색한 시점이지만 콘텐츠가 도메인 이해에 도움되는 성격이라 수용 가능.
- `markOnboarded()` 실패 시 "다음 로그인 1회 더 노출" 회귀 — 데이터 손실 없음, silent 처리.

### 후속 영향

- `0007_ci_rls_audit.sql` 의 자동 RLS 감사가 새 컬럼을 기존 정책 범위 내에서 확인.
- E2E/통합 테스트 인프라가 인증 플로우를 커버하게 되면 callback 의 onboarded_at 분기에 회귀 테스트 추가 권장 (본 PR 범위 외).
- 향후 `accept_invite` RPC 에서 `onboarded_at = now()` 를 set 할지 별도 결정 가능 — 본 ADR 은 의도적으로 set 하지 않음.
