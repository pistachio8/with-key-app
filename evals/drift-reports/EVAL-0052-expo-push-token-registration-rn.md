# Drift Report — EVAL-0052 Expo 푸시 토큰 등록·해제 RN 클라이언트

- Task: **EVAL-0052** (Track: port · Kind: migration)
- Branch: `feat/rn-phase6-notifications` (PR base `develop` — deps EVAL-0051[done], WP feat/rn-phase6-notifications WP2)
- Date: 2026-06-30
- Trigger: `apps/mobile/src/capabilities/push-notification/` 신설 — Expo push token 획득·upsert·무효화 capability. ADR-0041(RN direct client · soft-delete) 구현. Parent: `docs/migration/00-rn-conversion-plan.md` · `01-rn-mvp-prd.md §5.A A6`.

## Harness Impact Questions — 답변

1. **New folder structure? YES** — `apps/mobile/src/capabilities/push-notification/` 신설(barrel `index.ts` + `register-token.ts`·`unregister-token.ts`·`device-id.ts`·`notifications.ts`·`use-register-push-token.ts`). 기존 `capabilities/kakao-auth/`(단일 index.ts) 보다 큰 capability 단위 — native SDK 격리(04 §5.1) + write 로직 + React 훅을 한 경계 안에 둔다. propagation: 후속 알림 task(EVAL-0053 수신 핸들러·0054 알림센터·0055 설정)가 이 capability 를 재사용/확장. `.agents/` 머시너리 영향 없음.
2. **New naming convention? YES(경미)** — `register-token.ts`/`unregister-token.ts`(동사-명사 행위 파일명), `use-register-push-token.ts`(훅), `device-id.ts`(헬퍼). repo-wide 규약 아님(이 capability 로컬). `.agents/` 갱신 불요.
3. **New dependency? YES (3종, 모두 first-party Expo)** — `expo-notifications@~55.0.23`(권한·token), `expo-device@~55.0.17`(`Device.isDevice` 시뮬레이터 가드), `expo-crypto@~55.0.15`(`randomUUID` device_id 생성). task 는 expo-notifications 만 예고했으나 canonical Expo push 패턴이 expo-device 를 쓰고, device_id UUID 생성에 crypto 가 필요해 동반 추가. 버전은 `expo/bundledNativeModules.json`(SDK 55) 핀.
4. **Verification commands changed? NO(명령 불변) · 단 jest config 추가** — `apps/mobile/package.json` jest 에 `setupFiles: ["<rootDir>/jest.setup.ts"]` 추가. 이유: `expo-notifications` 가 import 시점에 Expo Go 경고를 emit 하고 device push token auto 등록 side-effect 를 실행해, 앱 라우터를 렌더하는 기존 spec(read-only-screens·router-skeleton·invite-deep-link)이 transitive import 시 출력 오염·native bridge 접근. 전역 no-op mock 으로 차단(capability 전용 spec 은 자체 jest.mock 으로 덮어씀). `pnpm test` 명령 자체는 불변.
5. **Harness instructions outdated? NO(라우팅 off-mapping 1건 관찰)** — 워크플로/템플릿 가정 불변. 단 orchestrate route 가 "EVAL-0052 작업 진행하자"(bare task-ID 참조)를 `no-keyword-match`(confidence 0.2, ambiguous)로 분류 → 사람 확인으로 implement-agent-task 확정. "EVAL-NNNN 작업 진행하자/이어서/구현" 류는 기존 task 의 implement 로 라우팅하는 게 맞다(아래 §후속 권고). 자동 반영 금지(harness-improvement gated).
6. **`.agents/` 문서 갱신? NO** — analytics parity(PRD §9.1 — `notification_sent` 는 dispatch sender 레이어, 이번 범위 밖)·Server Action(PWA 가드레일의 RN direct 예외는 ADR-0041 §73 명시)·RLS(`dpt_all_self` self-row 는 0058 migration, EVAL-0051)·env(EXPO*PUBLIC*\* 만 사용)·시크릿 전부 정합. 갱신 불요.

## 구현 결정 (task 가정 대비 교정)

- **device_id = SecureStore UUID** (task 가 허용한 대안). ADR-0041 §126 은 "expo-device installation id" 를 적었고 task 도 `Device.osBuildId` 를 1안으로 들었으나, `osBuildId` 는 동일 OS 빌드 기기끼리 충돌해 기기 고유성이 없다. SecureStore 에 1회 생성·영속하는 UUID 가 (user_id, device_id) 키의 안정적 device_id 로 적합(재로그인 시 같은 row 재활성).
- **BFF endpoint 미생성** — task Target Files 의 `apps/web/src/app/api` 는 "필요 시"였으나 ADR-0041 §73 이 register 를 **RN direct client(RLS self-row)** 로 확정. `device_push_tokens` 는 `dpt_all_self` RLS 라 BFF 불필요. Route Handler 추가 없음.
- **로그아웃 무효화 위치 = `auth-service.signOut()`** — task 는 `_layout.tsx` 만 Target 으로 들었으나 로그아웃 진입점은 auth feature. 기존 `kakaoAuth.logout()` best-effort 정리 패턴을 미러해 supabase 세션 폐기 **전**(RLS self-write 가 인증 필요) `unregisterPushToken` 호출. `me.tsx`(UI)는 무수정 — 더 surgical. capability→feature import 는 kakao-auth 선례와 동일 레이어링.
- **무효화 = soft-delete(`disabled_at`)** — DeviceNotRegistered·로그아웃 모두 `disabled_at=NOW()`. hard-delete 아님(ADR-0041). dispatch sender 가 `disabled_at IS NULL` 만 발송.

## 후속 권고 (이번 슬라이스 밖)

- **라우팅**: route-manifest 에 bare task-ID 패턴(`EVAL-\d+` + 진행/구현/이어서)을 implement-agent-task 로 매핑하는 키워드/규칙 추가 검토(harness-retrospector → gated). 현재는 매번 사람 확인 필요.
- **EAS projectId**: `registerPushToken` 은 `Constants.expoConfig.extra.eas.projectId` 미설정 시 `no_project_id` 로 skip. 실기기 token 발급은 EVAL-0053(EAS 빌드 프로파일 + APNs/FCM credentials) 선행 필요.
- **dispatch sender**: `device_push_tokens` 발송 경로(`ExpoPushProvider` + `loadTargets` 양 테이블 조회)는 ADR-0041 §118 후속 — 별도 task.

## 검증 결과

- `pnpm --filter @withkey/mobile exec jest src/capabilities/push-notification` → **11/11 PASS**(register 8 + unregister 3).
- `pnpm --filter @withkey/mobile test`(전체) → 24 suites · **211/211 PASS**(auth-service 로그아웃 무효화 wiring +2 포함, 기존 spec 비파괴 — setupFiles 전역 mock 적용).
- `pnpm -r typecheck` → clean(domain·web·mobile).
- `pnpm -r lint` → exit 0(3 packages).
- 기존 Web Push 회귀: `pnpm --filter @withkey/web test`(전체) → **831/831 PASS**(`src/lib/push/**` 무변경 — push_subscriptions 경로 보존).
- `pnpm harness:check` PASS · `pnpm validate:docs` OK.
