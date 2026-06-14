# Drift Report — EVAL-0019 RN Native action log MVP

- Task: **EVAL-0019** (Track: port · Kind: migration)
- Branch: `feat/rn-native-action-log`
- Date: 2026-06-13
- Trigger: D-7 spec(`2026-06-13-d-7-submit-action-log-bff`) 구현 — 신규 폴더 `apps/web/src/lib/action-log/`(공유 코어) · `apps/web/src/app/api/action-log/`(BFF route) · `packages/domain/src/write-contracts/`(쓰기 계약) · `apps/mobile/src/features/action-log/`(RN service·UI·압축) · `evals/fixtures/write-contracts/`. 신규 native 의존성 2개(expo-image-picker·expo-image-manipulator).

## Harness Impact Questions — 답변

1. **New folder structure? YES** — 4개 신규 폴더: `apps/web/src/lib/action-log/`(submit-core SoT) · `apps/web/src/app/api/action-log/`(Route Handler, 기존 `app/api/feed` 와 동급 BFF 표면) · `packages/domain/src/write-contracts/`(기존 `read-contracts/` 의 write 짝) · `apps/mobile/src/features/action-log/`(기존 feature 디렉토리 컨벤션). 모두 기존 레이아웃 규칙(route colocation·feature 모듈·domain barrel) 답습 — 새 구조 패턴 아님.
2. **New naming convention? NO** — `write-contracts` 는 `read-contracts` 미러, `bffPostFormData` 는 `bffGetJson` 미러, `submitActionLogCore` 는 `*Core` 접미(향후 BFF 추출 코어의 명명 선례). `upload-policy`/`prepare-photo` 는 web `prepare-upload`/`resize-to-jpeg` 분리 패턴 답습.
3. **New dependency? YES** — `expo-image-picker@~55.0.20`(촬영/보관함 + 권한), `expo-image-manipulator@~55.0.17`(1920px clamp + JPEG 0.85 압축). SDK 55 호환 버전(`expo install` 선택). `app.config.ts` 에 expo-image-picker 권한 플러그인(카메라·보관함 문구) 추가. expo-camera 는 도입하지 않음 — image-picker 의 launchCamera 가 촬영+권한을 포괄하므로 커스텀 카메라 surface 불필요(scope).
4. **Verification commands changed? NO** — AT 가 이미 명시한 `pnpm --filter @withkey/mobile test -- action-log` 가 신규 boundary eval(`submit-action-log.spec`)·정책(`upload-policy.spec`)·`bffPostFormData` 테스트를 실행한다. 신규 스크립트/게이트 없음. Maestro 미도입.
5. **Harness instructions outdated? NO(이미 반영됨)** — native 사진 권한 flow·secret boundary(EAS 번들 OPENAI/sb_secret 부재)·실 AI fallback·KST doneCount parity·RN/PWA feed signed photo 는 자동 불가 → spec Verification 의 "수동/device(위조 금지)" 로 이미 PO·실기기 핸드오프로 명시돼 있다. 추가 harness 문구 불요.
6. **`.agents/` 문서 갱신? NO(불요)** — 검증 메커니즘 불변, product/architecture SoT 는 00/04 유지. `.agents/` 경로 이동/이름 변경 없음.

## 구현 무결성 (D-7 spec 정합)

- **단일 코어 SoT**: `submitActionLogCore(supabase, user, formData)` 를 web wrapper(`_actions.ts`, cookie client + `updateTag` tail)와 BFF route(`app/api/action-log`, Bearer client + `revalidateTag(tag,"max")`)가 공유 — KST·doneCount·AI fallback·orphan cleanup 로직 단일 출처. web 행동 테스트는 `submit-core.spec` 으로 이전(20 tests), wrapper 는 smoke(3) 로 축소.
- **Next 16 breaking change 준수**: `revalidateTag` 는 2-인자(`tag, profile`)가 필수 — Route Handler 는 `"max"`(stale-while-revalidate, next-visit). `updateTag`(RYOW)는 Server Action 전용이라 web wrapper 에만 둠.
- **계약 단일화**: `submitActionLogResponseSchema`(domain) 를 BFF 응답 타입·RN parse 가 공유 → 패리티 by construction. `ErrorCode` 는 domain 으로 승격하고 `response.ts` 가 re-export(web import 무변).
- **RLS 경계 보존**: 코어 메인 경로 쓰기(insert·Storage·RPC)는 주입된 user client(cookie/Bearer)로만 — admin 미사용(ADR-0036 §2). verify `after()` 내부 admin 은 기존대로.
- **secret boundary**: RN 은 `bffPostFormData` 로 봉투만 소비 — OpenAI/service-role 키 미노출. `NEXT_PUBLIC_` 서버키 접두 없음.
- **업로드 정책 패리티**: `upload-policy.resizeTarget`(순수, 단위 테스트)이 long-edge 1920 clamp 결정, `prepare-photo` 가 expo-image-manipulator 로 JPEG 0.85 적용 + 5MB 초과 best-effort 거부(서버 버킷 file_size_limit 이 최종 게이트).

## 관찰된 별개 항목 (PO·실기기 핸드오프 — 위조 금지)

- **자동 검증 불가** → 실기기/EAS Dev Build 필요: native 촬영/보관함 권한 거부·재시도 UX, 실 AI 일기 생성·fallback, KST doneCount(첫 인증 증가/2차 미증가) 실측, RN·PWA feed signed private photo 표시, BFF 제출 후 PWA feed 갱신(revalidateTag next-visit), P95 latency(getUser + AI 4.5s + 업로드 직렬).
- **base 브랜치**: goal 파일은 `feat/rn-challenge-lifecycle` 분기를 지시하나(D-7 accepted 이전 stale 뷰), 실제로는 `chore/d-7-spec-accepted`(= develop + spec accepted)에서 분기 — accepted D-7 spec(unblock 조건) 포함 위해.
- **memo(직접 입력 일기) RN UI**: 계약은 optional 로 열어두되 MVP UI 미출시(spec 결정 6) — defer.
