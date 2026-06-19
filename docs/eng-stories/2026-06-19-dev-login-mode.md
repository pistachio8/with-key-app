# ES-dev-login-mode: 개발자 로그인 모드 (카카오 우회)

> Track: greenfield · Branch base: `feat/dev-login-mode` (origin/develop)
> Spec: [docs/superpowers/specs/2026-06-19-dev-login-mode-design.md](../superpowers/specs/2026-06-19-dev-login-mode-design.md)

## 배경 (시스템 언어)

실기기/Vercel Preview에서 카카오 SSO·매직링크가 막혀 로그인이 불가능하다.
기존 `/auth/dev-login` 라우트(`token_hash` → verifyOtp → 쿠키)와 RN의 `verifyMagicLinkToken(tokenHash)` 를 재사용하여, 숨긴 제스처로 미리 seed한 테스트 계정에 즉시 로그인하는 dev 전용 경로를 추가한다.

**핵심 불변식**:

- `DEV_LOGIN_ENABLED` 미설정 시 서버 엔드포인트 404 — Production env에 절대 등록하지 않는다.
- `DEV_LOGIN_EMAILS` 정확 일치만 토큰 발급 — 실유저·임의 이메일 원천 차단.
- `EXPO_PUBLIC_*` dev 비밀값은 `appVariant === 'dev'` extra에만 주입 — prod 번들 누출 방지.
- `point_ledger` append-only 불변: seed는 결정적 UUID + skip-if-exists.

## 직교 결정 인용

- D7 (`NODE_ENV → DEV_LOGIN_ENABLED 교체`) · D8 (멱등 seed) · D9 (Preview Protection + bypass 토큰): [spec §3](../superpowers/specs/2026-06-19-dev-login-mode-design.md)
- 기존 라우트 가드레일(`app/auth/dev-login` 표면 재사용, BFF 아님): AGENTS.md §아키텍처
- RLS(`point_ledger` INSERT trigger, `group_members` policy): `supabase/migrations/0002_rls.sql`, `0044_settlement_rpcs.sql`

## Work Packages

| ID  | slug                               | 범위                                                                     | Depends-on      | Blocked-by             | Verify 커맨드                                           |
| --- | ---------------------------------- | ------------------------------------------------------------------------ | --------------- | ---------------------- | ------------------------------------------------------- |
| WP1 | dev-login-server-core              | `lib/auth/dev-login.ts` 신규 + unit 테스트                               | —               | —                      | `pnpm typecheck && pnpm lint && pnpm test -- dev-login` |
| WP2 | dev-login-route-extend             | `auth/dev-login/route.ts` 게이트 교체 + email·format=token 분기 + 테스트 | WP1             | —                      | `pnpm typecheck && pnpm lint && pnpm test -- dev-login` |
| WP3 | dev-login-web-menu                 | web 숨긴 메뉴 컴포넌트 + login-screen 5탭 연결 + .env.example            | WP2             | —                      | `pnpm typecheck && pnpm lint && pnpm build`             |
| WP4 | dev-login-rn-menu                  | RN 숨긴 메뉴 + login.tsx kicker long-press + app.config.ts extra         | WP2             | —                      | `pnpm typecheck && pnpm lint`                           |
| WP5 | dev-login-seed-script              | `scripts/dev-seed-accounts.mjs` 신규 — 2종 fixture 멱등                  | WP1             | [po:seed-run-approval] | 스크립트 dry-run + `pnpm typecheck`                     |
| OPS | dev-login-vercel-ops (사람 게이트) | Vercel env 등록 + Protection Bypass 발급 + Preview ON 실측               | WP1·WP2·WP3·WP4 | 사람 게이트            | 수동 실측                                               |
