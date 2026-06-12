# Drift Report — EVAL-0016 G7 read model contract

- Task: **EVAL-0016** (Track: port · Kind: migration)
- Branch: `feat/rn-read-contracts`
- Date: 2026-06-12
- Trigger: `packages/domain/src/read-contracts/`(view-model 계약 SoT 신규) + `apps/mobile/src/features/{challenge,feed,group,recap,profile}/api/`(read service + query keys) + `apps/mobile/src/services/api/`(BFF Bearer fetch) + `apps/web/src/app/api/feed/route.ts`(RN BFF) + `apps/web/src/lib/supabase/bearer.ts` + `evals/fixtures/read-contracts/`(보존 스냅샷) + ADR-0037.

## Harness Impact Questions — 답변

1. **New folder structure? YES** — ① `packages/domain/src/read-contracts/`: 화면 view-model 계약 타입(+transport zod) 전용 폴더, domain 루트 barrel 로 export. ② `apps/mobile/src/features/<domain>/api/` 첫 실사용(04 §5.1 의 lazy feature 슬라이스 — challenge·feed·group·recap·profile 5개 생성) + `services/api/`(BFF fetch). ③ `evals/fixtures/read-contracts/`: web·RN 양쪽 spec 이 공유하는 보존 eval fixture 의 표준 위치 — **후속 read/화면 task 는 이 위치에 fixture 를 추가**한다.
2. **New naming convention? YES** — ① read service 파일명 `features/<domain>/api/<domain>-reads.ts`(+`*-reads.spec.ts` — `pnpm --filter @withkey/mobile test -- read` 필터에 걸리는 이름 유지). ② query key factory `keys.ts` 의 `<domain>Keys` — `[도메인, ...스코프]` 계층, viewerId 비포함(세션 교체 시 `queryClient.clear()`), invalidation 기대값은 keys.ts 주석 고정. 규칙 전문은 ADR-0037 §4.
3. **New dependency? NO** — TanStack Query 는 spec 확정 전이라 미도입(key factory 는 라이브러리 비의존). BFF fetch 는 내장 `fetch`.
4. **Verification commands changed? PARTIAL** — 신규 게이트 스크립트는 없으나 보존 스냅샷이 web vitest(`read-contract-parity.spec.ts`)·mobile jest(`*-reads.spec.ts`) 두 러너에 걸쳐 돈다. 계약(EXPECTED) 변경 시 양쪽이 같이 깨지는 것이 의도된 동작.
5. **Harness instructions outdated? NO** — AT Source Files 전부 유효. 단 00 §13.3 freeze 이후 read 2종(`point-balance`·`phash-duplicates`)이 추가돼 있어 ADR-0037 §1 에 계약 분류를 부록으로 흡수했다(freeze 문서는 미수정).
6. **`.agents/` 문서 갱신? NO(불요)** — 머시너리 경로 변동 없음.

## 구현 무결성

- Layer 1 Bearer 변형은 **쿼리 본체 공유**(`readVisibleActionLogIds(client, ...)`) — cookie/Bearer 두 경로의 visibility 쿼리가 갈라질 수 없는 구조(ADR-0036 §2 의 "두 경로 동작 일치" 이행). `use cache: private` 은 Route Handler 불가(next docs) — Bearer Layer 1 은 비캐시.
- mobile service-role leak 0건: `rg "SUPABASE_SECRET|adminClient|service_role" apps/mobile/src packages/domain/src` → 코드 매치 없음(주석 1건). BFF 응답만 소비.
- admin hydrate callsite 계약 유지 — production callsite 는 여전히 `challenge-feed.ts` 단일(ADR-0024·0036), `/api/feed` route 는 feed 오케스트레이터만 import.

## 관찰된 별개 항목 (후속 task)

- `get_invite_preview` SECURITY DEFINER RPC migration + web `fetchInvitePreview` 전환 — ADR-0036 §4, DB 변경이라 본 task Non-goal. `invitePreviewSchema` 계약만 선고정.
- `photo-signed-url.ts` `SIGNED_TTL_SECONDS` 600→900 + mobile `expo-image` `cacheKey=actionLogId` — ADR-0036 §3 후속(EVAL-0017 화면 구현 시 적용 권장).
- web/mobile 의 RN-safe read 조립 중복은 보존 스냅샷이 방어 — 중복이 아프면 조립 함수의 domain 승격 재검토(ADR-0037 대안 1).
