---
spec: 2026-06-17-harness-orchestration-phase4-inline-tick
title: 하네스 오케스트레이션 Phase 4 — 단일-tick inline 무인 conductor (항상 리뷰 + 결정론 backstop)
author: pistachio8
date: 2026-06-17
status: draft
---

## Summary

Phase 3(spec `2026-06-13-harness-orchestration-phase3`)가 단일-tick stop-at-gate 드라이버(`.agents/workflows/orchestrate-backlog.md`)를 정의했다. 그 드라이버는 이미 `harness:next → claim → implement-agent-task(구현·리뷰·finalize) → D6 정지`를 **메인 세션 inline**으로 돈다(Phase 3 §C4 "구현은 메인 세션이 inline 수행"). 즉 멀티 에이전트 오케스트레이션 로드맵의 "단일 tick 무인" 골격은 Phase 3에서 이미 섰다.

Phase 4는 그 골격을 **무인(unattended)에서 신뢰할 수 있게** 만드는 두 가지 보강만 더한다. 로드맵 디벨롭 과정(2026-06-17 brainstorming)에서 정직하게 좁힌 결과, 핸드오프 셋 중 H1(`harness:goal` 출력을 `/goal`에 복붙)은 **Phase 3 inline 드라이버가 이미 해소**했고(복붙은 `/goal` 인터랙티브 경로에만 남는 별도 표면), 순신규는 H2·H3 둘이다.

1. **H2 — 항상 독립 리뷰**: verify green 직후 닿은 도메인마다 reviewer를 **무조건 fan-out**한다. Phase 3 §C5의 _조건부_ fan-out(작은 diff는 inline self-review)을 무인 tick 한정으로 오버라이드한다. **왜**: 무인 모드에선 코드를 쓴 에이전트의 self-review가 가장 약한 고리다 — 같은 blind spot이라 작성자가 못 본 결함을 작성자가 다시 못 본다. 사람이 지켜보는 수동 tick에선 조건부가 맞지만, 무인엔 독립 컨텍스트가 최소 안전선이다.
2. **H3 — 결정론 backstop**: `harness:finalize`의 runs[] skeleton에 **`review` 증거 슬롯**을 더해, verify green + 리뷰 verdict 증거가 없으면 기존 `<<FILL>>` 거부 머시너리로 finalize를 막는다. **왜**: Phase 3 §C5는 "리뷰는 finalize 전에 끝나야 한다"를 _산문으로_ 의무화했을 뿐 강제 장치가 없다 — 무인 루프가 리뷰를 건너뛰고 done을 선언해도 아무것도 막지 못한다. 산문 의무를 기계 게이트로 승격한다.

`scripts/**` 코드 + `.agents/**` 문서 변경이라 D6 권한 경계상 "제안+사람" 영역이며, **본 spec이 그 제안서다**(Phase 2·3와 동일 절차 — spec PR 리뷰가 곧 사람 승인 게이트). 머지되면 구현 PR이 따라온다(§Rollout).

## Why

Phase 3 드라이버는 inline·stop-at-gate로 돌지만, 무인에서 믿고 돌리기엔 리뷰가 약하고 강제 장치가 없다.

- **무인 tick의 최약점은 작성자 self-review다** — Phase 3 §C5의 조건부 fan-out은 "작은/단일 도메인 diff는 단일 컨텍스트 인라인 리뷰"를 기본으로 둔다. 사람이 매 tick을 지켜보는 전제(수동 우선·POC 비용)에선 합리적이다. 그러나 "한 번 호출하면 D6까지 무인으로 달린다"는 전제에선, 작은 diff라도 작성한 에이전트가 자기 코드를 같은 컨텍스트에서 보면 결함을 놓친 채 green→finalize로 직행한다.
- **리뷰가 강제되지 않는다** — Phase 3 §C5는 리뷰 단계를 `implement-agent-task.md`에 넣었지만(prose 의무), 그 단계를 건너뛰어도 `harness:finalize`는 통과한다. 현행 finalize 거부 조건은 `verification`·`summary`·`notes` 의 `<<FILL>>` 잔존뿐이다(`harness-finalize.mjs:35` `entryHasPlaceholder`) — **리뷰가 돌았는지는 검사하지 않는다**. 무인 루프에서 이 누락은 사람이 계약 보고를 읽어야만 잡힌다(사후·비결정론).
- **"green 없는 done"은 이미 막혀 있다(재사용)** — finalize는 `verification` 필드가 `<<FILL>>`이면 거부하므로, verify 증거 없는 finalize는 현재도 exit 1이다. Phase 4는 이 기존 가드를 그대로 쓰고, 비어 있던 **리뷰 증거**만 같은 패턴으로 추가한다.
- **H1(복붙)은 이미 해소라 순신규가 아니다** — Phase 3 드라이버는 `harness:goal` 출력을 사람이 `/goal`에 붙여넣지 않는다. 메인 에이전트가 claim 후 `implement-agent-task`를 직접 inline 수행한다(§C4). 복붙은 `/goal` _인터랙티브_ 경로(full-pipeline Stage 4-4)에만 남는 선택적 표면이다. Phase 4는 inline을 무인의 기본 경로로 못박되, H1에 새 메커니즘을 도입하지 않는다(과대 청구 방지).
- **무인의 단위는 단일 tick으로 고정한다** — multi-tick 연쇄(ready 큐 소진까지 무인)는 Phase 3의 "매 tick 사람이 게이트 처리 후 재호출" 가드레일(§C2)을 바꾸므로 harness-improvement·별도 결정 대상이다. Phase 4는 그 가드레일을 건드리지 않는다(§Out of scope).

## Impact Scope

### 변경 경로

- 신규:
  - `docs/superpowers/specs/2026-06-17-harness-orchestration-phase4-inline-tick.md` — 본 spec(제안서)
  - `.claude/commands/orchestrate-tick.md` — (선택) Claude 래퍼. tick 계약(§C3) 체크리스트. 로컬 `.gitignore` 대상이라 커밋 불요. 본문 SoT는 `orchestrate-backlog.md`
- 수정:
  - `scripts/harness-finalize.mjs` — `buildRunSkeleton`에 `review` 증거 슬롯 추가(§C2). 거부 로직(`entryHasPlaceholder`)·`decideFinalize`는 무변경(자동 적용)
  - `scripts/harness-lib.spec.mjs` — `buildRunSkeleton` skeleton 단언 갱신(:791) + `review` `<<FILL>>` 잔존 시 finalize 거부 테스트 추가
  - `.agents/workflows/implement-agent-task.md` §5 — 무인 tick "항상 fan-out" 분기 명문화(Phase 3 조건부 norm을 무인 한정 오버라이드). §7 finalize 안내에 `review` 채움 1줄 추가
  - `.agents/workflows/orchestrate-backlog.md` — §실행에 "verify green → 항상 fan-out → review 증거 기록 → finalize" 순서와 tick 계약(§C3) 1행 보강
  - `.agents/README.md` — (필요 시) tool-neutral SoT 카운트 갱신

### src/ 영향

없음 — `apps/web/src/**` · `apps/mobile/src/**` 무변경. 하네스 머시너리(`scripts/` · `.agents/`)만.

### Supabase / RLS / migration 영향

없음.

### 외부 서비스

없음. (리뷰 fan-out은 Claude 서브에이전트 — 기존 `withkey-review`·도메인 reviewer 재사용. CI 모니터도 기존 `gh pr checks --watch` 재사용)

## Design

Phase 3 드라이버는 그대로 두고, 무인 신뢰성에 필요한 두 보강(C1·C2)과 그 보강을 사람이 검수하는 계약(C3), 거버넌스·정지점(C4)을 더한다. C1은 워크플로 정책, C2는 선행 코드, C3·C4는 절차다.

### C1 — 무인 tick은 항상 독립 리뷰 fan-out (Phase 3 §C5 오버라이드)

verify green 직후 **닿은 도메인마다 reviewer 서브에이전트를 무조건 fan-out**한다. 단일 도메인 diff여도 최소 1명의 독립 컨텍스트 reviewer가 돈다. **왜**: 무인에선 작성자 self-review의 blind spot 제거가 finalize의 전제다 — 독립 컨텍스트가 아니면 리뷰가 "있었다"는 형식만 채우고 신호는 0이다.

- **범위 한정**: 이 "항상 fan-out"은 **무인 tick(orchestrate-backlog/tick 경로)** 에만 적용한다. 사람이 직접 도는 수동 finalize는 Phase 3 §C5의 _조건부_ norm(작은 diff는 inline)을 유지한다. **왜**: 조건부의 근거(작은 diff 과금 절약 — Phase 3 §C5)는 사람이 지켜보는 수동 경로에선 여전히 유효하다. 무인이라는 전제가 바뀔 때만 비용보다 독립성이 우선한다.
- **기존 메커니즘 재사용**: 닿은 도메인 → `frontend-reviewer`·`backend-reviewer`·`migration-reviewer`(+RN이면 `mobile-reviewer`) 병렬 호출. 새 리뷰어·새 심각도 체계를 만들지 않는다(`.claude/rules/common/agents.md`의 fan-out → merge → verify 절차 그대로).
- **merge+verify 필수**: 서브에이전트 출력을 그대로 믿지 않는다 — 메인이 발견을 병합하되 reviewer 간 사실 충돌은 소스로 검증한 뒤 채택한다. **왜**: 독립 reviewer는 빠르고 깊지만 개별적으로 틀릴 수 있다(EVAL-0019에서 backend-reviewer의 false positive를 소스로 기각한 선례). 이 검증이 fan-out 비용을 정당화하는 지점이다.
- **발견 처리**: CRITICAL/HIGH 0건 → finalize(§C2). ≥1건 → `fix-verification.md`로 분기 후 재-verify·재-review. **왜**: 리뷰는 verify green을 전제하고 done flip 전에 끝나야 한다(Phase 3 §C5 순서 유지).
- **`implement-agent-task.md` §5 본문 변경**: 현행 "Claude는 큰/다도메인 diff일 때만 fan-out — 작은/단일 도메인은 inline" 문장에, "**단, orchestrate-backlog/tick 무인 경로에서는 diff 크기와 무관하게 항상 fan-out**(무인 self-review blind spot 제거, Phase 4 §C1)"을 분기로 추가한다. 조건부 norm 문장은 수동 경로용으로 남긴다.

### C2 — 결정론 backstop: `harness:finalize` review 증거 슬롯 (선행 코드)

`buildRunSkeleton`이 append하는 runs[] 엔트리에 **`review` 슬롯**을 더해, 리뷰 증거가 채워지기 전엔 finalize가 통과하지 못하게 한다. **왜**: 산문 의무(C1·Phase 3 §C5)는 무인 루프가 건너뛰어도 막을 게 없다 — 기존 `<<FILL>>` 거부 머시너리를 리뷰에 확장하면 "리뷰 누락"이 결정론으로 차단된다.

현행 skeleton(`harness-finalize.mjs:20-33`)에 필드 1개를 추가한다:

```jsonc
// buildRunSkeleton 반환 (Phase 4 확장 — review 슬롯 신규)
{
  "taskId": "EVAL-XXXX",
  "date": "2026-06-17",
  "track": "...",
  "kind": "...",
  "status": "done",
  "attempts": 1,
  "summary": "<<FILL>>",
  "verification": "<<FILL>>", // 기존: verify green 증거 (green 없는 done 차단 — 재사용)
  "review": "<<FILL>>", // 신규: 리뷰 증거 (리뷰 누락 차단)
  "notes": "<<FILL>>",
}
```

- **채우는 형태**: `review`는 `{ "reviewers": [...], "criticalHigh": <n>, "verdict": "pass" | "fixed" }`로 교체한다. 무인 tick → `reviewers`는 fan-out된 도메인 reviewer 목록(≥1 독립 컨텍스트). 수동 경로 → 조건부 norm상 inline이면 `["inline-self-review"]`로 기록(증거는 모든 경로에서 요구하되 *깊이*는 C1 정책이 정한다). **왜**: 가드는 "리뷰가 돌았다는 감사 가능한 증거"를 요구할 뿐, 깊이(fan-out vs inline)는 C1의 모드별 정책이 직교로 결정한다.
- **거부 로직은 무변경**: `entryHasPlaceholder`(`harness-finalize.mjs:35`)가 엔트리 JSON 전체에서 `<<FILL>>`을 찾으므로, `review: "<<FILL>>"`이 남으면 자동으로 finalize exit 1 + 안내. `decideFinalize`·`runFinalize`도 손대지 않는다. **왜**: 최소 외과적 변경 — skeleton 정의 한 곳만 바꾸고 강제 경로는 기존 것을 탄다.
- **이중 강제**: `harness:check`의 Tier 1-D(placeholder = check 에러)도 runs[]의 `<<FILL>>`을 잡으므로, finalize 거부(채움 루프 유도)와 check 실패(영속 게이트) 양쪽이 리뷰 증거를 강제한다(기존 verification과 동일 구조).
- **하위호환**: skeleton은 _새_ 엔트리에만 적용된다. 기존 완성 엔트리(`review` 필드 없음)는 `<<FILL>>`이 없어 `verify-only`/완성 판정 그대로 — 과거 run을 깨지 않는다(`decideFinalize` done+완전 엔트리 경로 무영향).
- **적용 범위 = 모든 finalize**: 무인·수동 구분 없이 모든 task finalize가 `review` 증거를 요구한다. **왜**: Phase 3 §C5가 이미 "모든 task는 finalize 전 리뷰"를 의무화했으므로, 가드는 새 의무를 만드는 게 아니라 그 의무를 *감사 가능*하게 만들 뿐이다. 모드 분기를 finalize에 넣으면 복잡도만 늘고 "리뷰 안 한 수동 finalize"라는 구멍이 남는다.

### C3 — tick 계약 (무인 tick의 사람 검수 표면)

무인 tick이 끝나면 메인 에이전트는 고정 포맷으로 **자기 행적을 보고**한다. 사람이 D6 게이트(보통 push/PR)에서 한 눈에 검수하기 위한 계약이다. **왜**: 무인이라도 사람이 결과를 신뢰하려면 "무엇을 claim·구현·검증·리뷰·finalize했고 어디서 멈췄나"가 한 보고에 모여야 한다.

- **Claimed**: EVAL-XXXX (todo→in_progress 확인)
- **Implemented**: 변경 파일 (Target만, Non-goals 봉인)
- **Verified**: pass@N + 실행한 Verification Commands & green 결과
- **Reviewed**: fan-out된 reviewer 목록 + CRITICAL/HIGH 건수 + merge·소스검증 노트
- **Repaired**: N회 (fix-verification 분기 있었으면)
- **Finalized**: done flip + runs[] 채움(`<<FILL>>` 0) + `harness:check` exit 0
- **Stopped at**: 정지한 D6 게이트(보통 push/PR 필요) 또는 clarify/blocked

계약의 **Verified·Reviewed 줄은 C2 backstop이 뒷받침**한다 — 증거가 runs[]에 없으면 finalize가 거부되므로, 계약은 신뢰가 아니라 강제에 근거한다.

### C4 — 정지점 · 거버넌스 (D6 불변)

- **정지점은 Phase 3 §C6 그대로**: `blocked→todo` flip · push · PR 생성 · PR merge는 D6 사람. worktree 내 커밋까지 implementer 자율. CI 모니터(`gh pr checks --watch`, 재시도 한도 3회)는 기존 in-turn 예외 재사용. Phase 4는 정지점을 **추가도 제거도 하지 않는다**.
- **이 변경 자체가 harness-improvement다**: `route-request.md`·`.agents/harness/UPDATE_POLICY.md`상 하네스 기준 변경은 자동 반영 금지 — "테스트 기준 완화·reviewer 제거·human gate 제거·SoT 우선순위 변경"은 자동 승인 금지다. **본 변경은 그 금지 목록에 걸리지 않는다** — 리뷰를 _강화_(조건부→무인 항상)하고 게이트를 _추가_(리뷰 증거 강제)하며 D6를 건드리지 않는다. 거버넌스 경로는 Phase 2·3 선례를 따른다: **이 spec이 제안서이고, spec PR 리뷰가 D6 사람 승인 게이트**다(`.agents/harness/propose-harness-update.md`의 무거운 경로는 기준 *완화*류에 쓰고, 강화·연속선 변경엔 spec-PR 선례를 적용).

## Alternatives Considered

1. **multi-tick 연쇄 무인(ready 큐 소진까지)** — "매 tick 사람 재호출"(Phase 3 §C2) 가드레일을 바꾼다. 기각(이번 범위) — 단일 tick으로 고정하고, 연쇄는 가드레일 변경이 필요한 별도 harness-improvement로 둔다(§Out of scope).
2. **script-as-conductor(`harness:tick`가 셸 단계 순서 실행 + LLM 단계 emit·대기)** — implement·review는 본질적으로 LLM이라 스크립트는 사슬만 결정론화하고 LLM 단계마다 멈춘다. 기각 — Phase 3가 이미 정한 "스크립트=결정론, 워크플로=에이전트 지휘" 분업과 충돌하고, 무인의 핵심인 inline 연속성을 끊는다.
3. **headless 호출(`claude -p`/SDK가 LLM 단계까지 무인)** — 진짜 무인이지만 remote/outward(로드맵 D) 영역이라 권한·비용 표면이 커진다. 기각(이번 범위) — 단일-tick·로컬 범위를 넘는다.
4. **조건부 fan-out 유지(Phase 3 §C5 그대로)** — 작은 diff 과금은 줄지만 무인에서 작성자 self-review의 blind spot이 finalize로 직행한다. 기각 — 무인이라는 전제에선 독립성이 비용보다 우선(§C1). 단 수동 경로엔 조건부를 남겨 Phase 3 근거를 보존한다.
5. **체크리스트만(결정론 가드 없음)** — 코드 0줄로 가장 빠르지만, 리뷰 누락·green 없는 done이 사람이 계약을 읽어야만 잡히는 비결정론 구멍으로 남는다. 기각 — 무인엔 너무 믿는 구조(brainstorming 접근 1).
6. **tick 상태기계(CLAIMED→…→FINALIZED를 results에 persist)** — 가장 강한 보증·관측성. 기각(이번 범위) — claim/finalize + git이 이미 상태를 인코딩하고, 단일-tick 로컬 POC엔 과설계(YAGNI). 필요해지면 별도 spec.
7. **review 증거 가드를 무인 tick 한정으로** — finalize에 모드 분기가 생겨 복잡도 ↑ + "리뷰 안 한 수동 finalize" 구멍 잔존. 기각 — §C5가 이미 모든 task에 리뷰를 의무화했으므로 모든 finalize에 증거를 요구하는 게 일관·단순(§C2 적용 범위).

## Verification

C2(코드)는 단위 테스트로, C1·C3·C4(절차)는 정합성·dogfood로 검증한다.

### 명령

```bash
pnpm harness:test         # buildRunSkeleton review 슬롯 단언 + review <<FILL>> 거부 테스트
pnpm harness:check        # runs[] placeholder(Tier 1-D)가 review <<FILL>>도 잡는지
pnpm harness:verify       # 통합 (typecheck + lint + test + check + harness:test)
pnpm validate:docs        # 워크플로 문서 내부 링크 깨짐
```

### 시나리오

- 정상: 무인 tick → verify green → 도메인 reviewer fan-out(단일 도메인이어도 ≥1) → merge+verify → CRITICAL/HIGH 0 → finalize가 `review` 채워진 엔트리로 exit 0 → push 게이트에서 정지·계약 보고.
- 정상: 큰 다도메인 diff → 3 reviewer 병렬 → 메인이 reviewer 충돌을 소스로 검증해 false positive 기각(EVAL-0019 패턴) → 채택 발견만 처리.
- 실패(가드 발동): `review`를 채우지 않고 `harness:finalize` 재실행 → `<<FILL>>` 잔존으로 exit 1 + "review 채우라" 안내. 리뷰가 결정론으로 강제됨을 실증.
- 실패: 리뷰 CRITICAL/HIGH ≥1 → `fix-verification.md` 분기 → 재-verify·재-review → pass@3 도달 못 하면 `abandoned` append(Phase 2 C3).
- 하위호환: `review` 필드 없는 기존 완성 엔트리로 `harness:finalize`(멱등) → `verify-only`, 변경 없음.
- 수동 경로: 작은 단일 도메인 diff를 사람이 inline 리뷰 후 finalize → `review.reviewers = ["inline-self-review"]`로 채워 exit 0(조건부 norm 보존).
- 엣지: tick 계약 보고가 Stopped-at을 push/PR로 명시 → 사람이 D6에서 검수·push.

### dogfood

머지 후 현 backlog의 ready task 1개로 무인 tick을 1회 돌려 (1) fan-out이 항상 발동하는지 (2) `review` 미기재 시 finalize가 거부되는지 (3) tick 계약 보고 포맷을 실전 확인하고, 마찰을 본 spec에 환류한다.

## Rollout

PR 2개 — 머시너리 코드와 `.agents/` 문서의 승인 표면이 다르므로 섞지 않는다(Phase 2·3 선례). **PR-A를 먼저 머지한다(역순 금지)** — PR-B의 워크플로 문서가 `review` 슬롯의 존재를 전제로 "리뷰 증거 채움"을 안내하므로, PR-A 없이 PR-B만 머지되면 안내가 가리키는 슬롯이 없다.

1. **PR-A `feat/harness-finalize-review-evidence`**: C2 — `harness-finalize.mjs` `buildRunSkeleton` review 슬롯 + `harness-lib.spec.mjs` 단언 갱신·거부 테스트. `scripts/**`만.
2. **PR-B `docs/harness-orchestration-phase4`**: 본 spec(승격: draft→accepted) + `implement-agent-task.md` §5·§7 + `orchestrate-backlog.md` + (필요 시)`.agents/README.md`. `.agents/**` 변경이라 리뷰가 곧 D6 사람 승인.
3. **(선택) Claude 래퍼** `.claude/commands/orchestrate-tick.md` — 로컬 `.gitignore` 대상, 커밋 불요.
4. **dogfood**: §Verification dogfood를 PR-A·PR-B 머지 후 실행.

### 롤백

PR-A·PR-B 각각 1 commit revert. `review` 슬롯은 skeleton 필드 추가라 제거해도 기존 finalize 동작(verification·summary·notes 거부) 무변경. 워크플로 문서를 되돌리면 Phase 3 조건부 리뷰 상태로 복귀(무인 self-review blind spot 재노출 — dogfood로 영향 관측 후 판단).

## Out of scope

- **multi-tick 연쇄 무인** — "매 tick 사람 재호출" 가드레일 변경 → 별도 harness-improvement(§Alternatives 1).
- **retro 생성기 · meta-eval**(로드맵 C 학습 루프) — `evals/meta/`는 여전히 비어 있고, Phase 4는 inner 구현 루프(B)만 다룬다.
- **remote/dashboard/PR 자동화**(로드맵 D) — 로컬 단일-tick 범위를 넘는다.
- **self-check 생성기**(로드맵 step 4) — AC→검증 자동 생성은 하지 않는다. 기존 task Verification Commands로 충분(무인 신뢰성은 C2 backstop이 담당).
- **headless LLM 호출**(`claude -p`/SDK) — §Alternatives 3.
- **D6 정지점 변경** — push/PR/merge/flip은 사람 게이트 유지. Phase 4는 게이트를 강화만 한다.
- **새 리뷰어·새 심각도 체계 · 오케스트레이터↔리뷰어 핸드오프 schema** — 기존 도메인 reviewer + withkey-review 심각도(Blocker/Major/Minor) 재사용(Phase 3 §Alternatives 7과 동일).

## 용어집

- **backstop**: 에이전트가 단계를 건너뛰어도 결정론(스크립트)으로 막는 안전장치 — Phase 4에선 `harness:finalize`의 `review` 증거 요구
- **blind spot(작성자 self-review)**: 코드를 쓴 에이전트가 같은 컨텍스트에서 자기 코드를 리뷰할 때 작성 시 못 본 결함을 다시 못 보는 한계 — 무인 tick의 최약점
- **conductor(지휘자)**: 결정론 셸 단계(next·claim·verify·finalize)와 LLM 단계(implement·review)를 한 호출에 inline으로 잇는 주체 — Phase 4는 메인 에이전트가 지휘(agent-as-conductor)
- **D6**: `docs/migration/05-rn-harness-decisions.md`의 권한 경계 결정 — push·PR·merge·spec·adr·po·flip은 사람 게이트(절대 경계)
- **fan-out**: 변경 도메인별로 reviewer 서브에이전트를 병렬 호출하는 리뷰 패턴(`.claude/rules/common/agents.md` · withkey-review)
- **inline(무인 경로)**: 사람이 `harness:goal` 출력을 `/goal`에 붙여넣지 않고, 메인 에이전트가 claim 후 구현·리뷰·finalize를 직접 잇는 실행 방식(Phase 3 §C4)
- **merge+verify**: 서브에이전트 리뷰 출력을 병합하되 reviewer 간 사실 충돌을 소스로 재검증해 채택하는 단계 — fan-out 비용을 정당화
- **pass@3**: 같은 task를 3회 시도해도 실패하면 task가 너무 크다는 분할 신호(D5 oracle)
- **tick**: 드라이버의 1회 호출 = task 1개를 다음 사람 게이트까지 미는 단위
- **tick 계약**: 무인 tick 종료 시 메인 에이전트가 claim·구현·검증·리뷰·finalize·정지점을 고정 포맷으로 보고하는 사람 검수 표면(§C3)
- **H1/H2/H3**: 제거 대상 기계적 핸드오프 — H1 복붙(`harness:goal`→`/goal`, Phase 3가 이미 해소) · H2 수동 reviewer 트리거 · H3 수동 finalize/리뷰 누락
