# Drift Report — EVAL-0011 Expo boot

- Task: **EVAL-0011** (Track: port · Kind: migration)
- Branch: `feat/rn-expo-boot`
- Date: 2026-06-05
- Trigger: `apps/mobile` Expo Managed+CNG shell 추가. ADR-0033 결정 1·2와 04 A4·A12 실행 표면을 생성하고, mobile을 pnpm workspace 검증에 합류.

## Harness Impact Questions — 답변

1. **New folder structure? YES** — `apps/mobile` 추가. Expo Router는 현재 boot 검증용 `src/app/_layout.tsx`와 `src/app/index.tsx`만 두고, 전체 route skeleton은 EVAL-0014로 보류.
2. **New naming convention? YES** — mobile workspace package `@withkey/mobile` 추가. `APP_VARIANT=dev|staging|prod`가 display name, bundle id/package, scheme, universal/app link domain을 결정한다.
3. **New dependency? YES** — Expo SDK 55 / React Native 0.83 / EAS dev-build shell 의존성 추가. 최신 SDK 56은 공식 문서 기준 최소 Node 22.13.x라 루트 엔진(`>=20 <21`)과 충돌하므로, Node 20 정책 안에서 동작하는 최신 Expo 라인인 SDK 55를 선택했다.
4. **Verification commands changed? YES** — `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`에 `@withkey/mobile`이 합류. mobile test는 EVAL-0011 boot shell 범위라 명시적 no-op이다.
5. **Harness instructions outdated? NO** — EVAL-0011 구현 중 새 stale `src/...` path 가정은 발견하지 못했다. EVAL-0010에서 web 경로 전환 drift는 이미 별도 report로 기록됨.
6. **`.agents/` 문서 갱신? NO(불요)** — `.agents/engineering/INDEX.md`는 SoT 포인터만 갖고, 이번 mobile boot 추가로 이동/이름 변경된 `.agents/` 경로 가정은 없다.

## 구현 무결성

- `apps/mobile/app.config.ts`가 `APP_VARIANT`별 display name, iOS bundle id, Android package, scheme, iOS associated domains, Android App Links intent filter를 결정한다.
- `apps/mobile/eas.json`의 `development`/`preview`/`production` profile은 `APP_VARIANT`만 매핑하며 secret 값을 중복하지 않는다.
- CNG 경계는 `apps/mobile/.gitignore`의 `/ios`·`/android`로 보존한다. 생성된 native directory는 없음.
- Metro는 `expo/metro-config`를 기반으로 workspace root `watchFolders`와 `nodeModulesPaths`를 명시해 `@withkey/domain` workspace source를 해석한다.

## 관찰된 별개 항목

- Expo SDK 55 공식 문서는 최소 Node `20.19.x`를 요구한다. 로컬 검증은 fnm Node `20.19.5`로 수행했다.
- SDK 55는 New Architecture가 항상 enabled 이지만, EVAL-0011 config 검증 가시성을 위해 public config에 `newArchEnabled: true`를 보존했다.
