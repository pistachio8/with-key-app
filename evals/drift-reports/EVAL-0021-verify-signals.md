# Drift Report — EVAL-0021 결정론 검증 신호 골격

- Task: **EVAL-0021** (Track: greenfield · Kind: migration)
- Branch: `feat/rn-verify-judge`
- Date: 2026-06-10
- Trigger: `apps/web/src/lib/verify/` 신규 모듈(phash·EXIF·스크린샷 결정론 신호 + 신호 집계·기록) + `apps/web/src/lib/db/reads/phash-duplicates.ts` 신규 read 추가. EVAL-0020(0045/0046, origin/develop 머지 완료) 검증 컬럼에 신호를 적재한다. θ 판정은 하지 않는다(EVAL-0022).

## Harness Impact Questions — 답변

1. **New folder structure? YES** — `apps/web/src/lib/verify/` 신규. `phash.ts`·`exif.ts`·`screenshot-heuristic.ts`(순수 신호) + `signals.ts`(집계) + `record.ts`(EVAL-0020 컬럼 서버 기록) + `index.ts` barrel + 각 `*.spec.ts`. phash 중복 조회 입력은 `src/lib/db/reads/phash-duplicates.ts`에 둔다(기존 `reads/` 패턴 재사용 — `point-balance.ts`의 untyped adminClient narrowing 답습).
2. **New naming convention? NO** — route colocation·`lib/*` 도메인 유틸 컨벤션 그대로. 새 prefix/명명 규약 없음.
3. **New dependency? YES** — `exif-reader@2.0.3`(EXIF 촬영시각 파싱). `sharp`는 기존 의존(이미지 grayscale→DCT). 동반하여 `pnpm install`이 `pnpm-lock.yaml`을 정규화하며 `eslint-import-resolver-typescript`·`eslint-module-utils`·`eslint-plugin-import`의 stale 전이 엔트리를 제거했다(pnpm v10.7.0 결정론적 결과 — 재실행 시 `added 0`으로 수렴 확인, lint 통과). 64비트 DCT pHash·해밍거리는 외부 phash 라이브러리 없이 자체 구현(`AC-cheat-detect-1` ① θ 기준 64비트 고정 보존).
4. **Verification commands changed? NO** — `pnpm test -- verify`는 기존 vitest unit 패턴. 신규 스크립트/게이트 없음.
5. **Harness instructions outdated? NO** — 구현 중 stale path 가정 미발견. `apps/web/src/types/supabase.ts`의 검증 컬럼 미반영은 EVAL-0020 머지 시점 기준(db:types는 `--linked` 머지 후 재생성하는 프로젝트 관행, adminClient untyped라 typecheck-safe)이라 본 task가 만든 drift가 아니다.
6. **`.agents/` 문서 갱신? NO(불요)** — `.agents/` 경로 이동/이름 변경 없음.

## 구현 무결성

- 세 결정론 신호는 모두 순수 함수로 분리해 sharp/실DB 없이 단위 테스트한다: `dctPhash(pixels)`(합성 픽셀), `extractExifSignals`/`detectScreenshot`. 동일 입력 → 동일 신호 불변식이 spec으로 활성(phash 13·exif 10·signals 6·screenshot 6).
- `recordVerifySignals`는 `adminClient()`(service_role)로 EVAL-0020 컬럼(`photo_phash`·`photo_captured_at`·`auto_verify_score`·`auto_verify_model_version`)만 UPDATE한다. 본문(사진·일기) 미저장. `auto_verify_status`는 미변경(θ 판정 = EVAL-0022).
- `_actions.ts`의 `submitActionLog`는 사진 업로드 성공 후 `after()`로 신호 기록을 비파괴 호출한다 — 기록 실패해도 제출은 성공 유지, 응답 latency와 분리.
- phash 중복은 `findActionLogPhashDuplicates`가 그룹/전역 scope 후보를 모아 거리·최근접·정확중복(`exactDuplicate`)만 돌려준다. scope별 행동 매핑(θ)은 EVAL-0022.

## 관찰된 별개 항목

- `apps/web/src/types/supabase.ts`에 EVAL-0020 검증 컬럼 4종이 아직 미반영(origin/develop 동일). 머지 후 `pnpm db:types`(--linked) 재생성 필요 — adminClient가 `SupabaseClient`(Database generic 미적용)라 컬럼 write가 컴파일 검증되지 않으므로, 재생성 전까지 컬럼명 정합은 migration 0045 SoT와 코드 리뷰로만 보장된다.
- status 판정(passed/failed/manual_review)은 본 task 범위 밖(θ 의존, EVAL-0022). `advisorySignalScore`는 soft 신호 개수만 집계하고 단독 판정하지 않는다.
