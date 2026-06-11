# Drift Report — EVAL-0012 RN Supabase auth PoC

- Task: **EVAL-0012** (Track: port · Kind: migration)
- Branch: `feat/rn-auth-poc`
- Date: 2026-06-11
- Trigger: ADR-0034(accepted) 실행 — 네이티브 Kakao SDK + `signInWithIdToken` + SecureStore chunked 세션 + magic link fallback 코드 착지. `apps/mobile`에 services/capabilities/features 계층(04 §5.1) 첫 적용.

## Harness Impact Questions — 답변

1. **New folder structure? YES** — 04 §5.1 계층 첫 생성: `src/services/supabase/`(client 싱글톤·세션 adapter), `src/capabilities/kakao-auth/`(네이티브 SDK 격리), `src/features/auth/{api,hooks}/` + 공개 API `features/auth/index.ts`. feature 는 lazy 생성 원칙대로 auth 슬라이스만 추가.
2. **New naming convention? YES** — capability 는 인터페이스(`KakaoAuth`) export + 구현 은닉(04 §5.1 capability 계약). feature 결과 타입은 web `ActionResult` 와 유사한 `AuthResult`(`{ ok } | { ok: false, error: AuthErrorCode }`).
3. **New dependency? YES** — `@supabase/supabase-js`, `@react-native-kakao/core·user`(2.4.x), `expo-secure-store`, `expo-build-properties`(Kakao maven repo 주입). devDeps: `jest`+`jest-expo`+`babel-preset-expo`(SDK 55 라인 핀)+`@types/jest`. pnpm isolated node_modules 라 `babel-preset-expo` 를 직접 devDep 으로 추가(jest 전용 `babel.config.js`).
4. **Verification commands changed? YES** — `@withkey/mobile` test 가 no-op echo → 실제 jest 로 전환되어 `pnpm -r test` 에 mobile 단위 테스트 18개가 합류. `pnpm --filter @withkey/mobile test -- auth` 활성화.
5. **Harness instructions outdated? NO** — stale 경로 가정 미발견. 단, AT 의 "manual/dev-build" 검증(Kakao 콘솔 등록 + 실기기 login/restart/logout)은 외부 콘솔 설정 선행이 필요해 코드 머지와 분리됨(아래 미해결).
6. **`.agents/` 문서 갱신? NO(불요)** — 하네스 머시너리 변경 없음.

## 구현 무결성

- 세션 adapter 는 SecureStore 2048B 제한 대비 1800자 청크 분할 + 메타(`__chunked__:<n>`) + 축소 시 잔여 청크 정리 + 청크 유실 시 null(미인증) 처리.
- `getSupabaseClient()` 는 env 누락 시 명확한 메시지로 즉시 throw(ADR-0007 fail-fast) — `EXPO_PUBLIC_SUPABASE_URL`·`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 만 사용, `sb_secret_*`·레거시 명칭 미포함.
- Kakao config plugin 은 `EXPO_PUBLIC_KAKAO_NATIVE_KEY` 존재 시에만 포함(plugin 이 빈 키 거부). 키 없는 빌드는 Kakao 비활성 + magic link 만 동작.
- magic link `emailRedirectTo` 는 variant 별 universal link(`https://<domain>/auth/callback`) — custom scheme 미사용(ADR-0034 결정 2). `src/app/auth/callback.tsx` 가 `token_hash` 를 `verifyOtp(type: "email")` 로 교환(웹 callback 과 동일 flow).
- PWA cookie flow(`apps/web/src/lib/supabase/**`) 무변경 — web 회귀 없음.

## 관찰된 별개 항목

- expo-router typed routes 캐시(`.expo/types/router.d.ts`)가 stale 하면 새 라우트가 typecheck 에서 거부된다. 로컬은 `expo start` 1회로 재생성(gitignore 대상이라 CI 무영향).
- invite stash/accept orchestration(ADR-0034 결정 4)은 EVAL-0013 범위로 미구현 — `features/auth` 공개 API 가 그 진입점이 된다.
