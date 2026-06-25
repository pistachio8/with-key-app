# Drift Report — EVAL-0057 satori 프레임 렌더 복원력·비용 절감

- Task: **EVAL-0057** (Track: greenfield · Kind: migration)
- Branch: `fix/satori-frame-render-resilience` (PR base `develop` — deps none, EVAL-0056 보완재이나 독립 착수)
- Date: 2026-06-25
- Trigger: `/api/share/recap-clip` Route Handler 의 `renderBeatPng` 호출 경로에 per-frame 타임아웃(8s)+1회 재시도+정적 폴백, `Promise.all` 무제한 동시 렌더 → 동시성 cap(3) 교체. 변경 파일 2개(`route.ts`·`route.spec.ts`)뿐 — `encode.ts`·`storyboard.ts`·`frames.tsx` Non-goal 봉인.

## Harness Impact Questions — 답변

1. **New folder structure? NO** — 신규 폴더/route 세그먼트 없음. 기존 `app/api/share/recap-clip/` 한 파일만 수정.
2. **New naming convention? YES(경미·로컬)** — 한 파일 내부 헬퍼 네이밍:
   - `renderBeatPngSafe` — 기존 `renderBeatPng` 을 타임아웃·재시도·폴백으로 감싸는 `*Safe` 래퍼 패턴.
   - `mapWithLimit(items, limit, fn)` — 동시성 cap worker 풀(순서 보존).
   - **propagation 없음**: repo-wide 규약이 아니라 이 route 파일 한정 로컬 함수. `.agents/` 머시너리·다른 도메인에 영향 없음 → `.agents/` 갱신 불요.
3. **New dependency? NO** — `p-limit` **미채택**. 수동 worker 풀(`mapWithLimit`, ~12줄)로 동시성 cap 을 구현해 신규 npm 의존성을 회피(Non-goal "p-limit 한 건만 허용" 범위 안에서 더 보수적으로 0건 선택). 타임아웃·재시도는 `Promise.race`+`setTimeout` 내장만 사용.
4. **Verification commands changed? NO** — `pnpm typecheck`·`lint`·`test -- "src/app/api/share/recap-clip"`·`harness:check`·`validate:docs` 그대로. 신규 package.json script 없음.
5. **Harness instructions outdated? NO** — 워크플로/템플릿 가정 불변.
6. **`.agents/` 문서 갱신? NO** — analytics parity(PRD §9.1) 무변경(신규 이벤트 미추가). Server Action·RSC 경계·env·시크릿 무변경.

## 주요 설계 결정

- **per-frame 격리 = `renderBeatPngSafe`**: 최초 1 + 재시도 1(=`MAX_RENDER_ATTEMPTS`) 모두 타임아웃/throw 면 `renderIntroFrame`(단색 CREAM + 그룹명, 네트워크 사진 미렌더 → 가장 안정적) 폴백. 한 프레임의 행/실패가 요청 전체 500 으로 번지지 않게 함(AC-1).
- **타임아웃 = `Promise.race` + `setTimeout`**: satori/ImageResponse 는 abort 미지원이라 원본 렌더를 중단하진 못하고 "더 기다리지 않음"으로 작동. 실제 타깃은 hero 사진 fetch 가 행 거는 케이스(ADR-0025 §B 리스크). 8s 근거 = `maxDuration=60` ÷ beat≤8 + 동시성 3 배치 여유(코드 주석 명시).
- **catastrophic floor = 500 수용**: 폴백(텍스트 전용)마저 실패하면 내놓을 프레임이 없어 상위 catch 로 500. AC 의 "500 방지"는 _단일 불량 프레임_ 격리가 목적이고, 렌더 파이프라인 전체 손상은 honest 500. 전용 테스트로 고정(`static fallback frame also failed` 로그 + 500).
- **동시성 cap = 수동 worker 풀**: 결과를 입력 index 위치에 채워 beat 순서(intro→photo→endcard) 보존, fn 호출 총 수 = beat 수 불변(AC-2). p-limit 의존성 회피.

## 리뷰 반영 (backend-reviewer fan-out)

- **Major: 폴백 자체 throw 시 500 잔존** → 폴백 `renderElement` 를 try/catch 로 감싸 catastrophic 케이스를 명시 로그 + 문서화된 rethrow 로 전환(암묵 가정 → 코드·테스트로 고정).
- **Minor: `attempt: 2` 하드코딩** → `MAX_RENDER_ATTEMPTS` 상수로 추출(루프·로그 동기화).
- **Minor: cursor race / withTimeout unhandled rejection** → 소스 검증 결과 JS 단일 스레드·`Promise.race` reaction 부착으로 실제 버그 아님. 주석으로 가정 명시만.
- **Minor: 동시성 테스트 flaky·`FRAME_TIMEOUT_MS_TEST` 위치** → 지연 20ms 상향 + `maxInFlight === 3` 단언 강화, 상수 파일 상단 이동.

## 검증 결과

- `pnpm typecheck` PASS · `pnpm --filter @withkey/web lint`(recap-clip) clean(0) · web `vitest run src/app/api/share/recap-clip` 15/15 PASS(route 11 + storyboard 4 — 타임아웃→재시도→폴백, 재시도 복구, 재시도 소진 폴백, 폴백 실패 500 floor, 동시성 cap=3, beat 순서·호출 수 보존 포함) · `pnpm harness:check` PASS · `pnpm validate:docs` OK.
- `pnpm test -- "src/app/api/share/recap-clip"`(root `-r`)는 apps/mobile jest 가 매칭 0건으로 exit 1 — 모노레포 필터 quirk(EVAL-0046 와 동일 기록, 내 코드 무관, web 15/15 통과).
