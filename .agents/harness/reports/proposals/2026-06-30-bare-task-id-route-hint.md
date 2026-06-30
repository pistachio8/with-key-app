# Harness Update Proposal — bare task-ID 라우팅 힌트 (안 B)

> 출처 회고: [`evals/retro-reports/2026-06-30-retro-bare-task-id.md`](../../../../evals/retro-reports/2026-06-30-retro-bare-task-id.md)
> 정책: [`.agents/harness/UPDATE_POLICY.md`](../../UPDATE_POLICY.md)

## 대상 (drift 항목)

"EVAL-NNNN 작업 진행하자/착수/이어서/구현" 처럼 **bare task-ID 로만 기존 task 착수를 요청**하면 `harness:route` 가 `no-keyword-match → analysis 0.2 ambiguous` 로 폴백해 매번 blank clarify 게이트가 강제 발동한다. 실증: `evals/runs/` 21건 중 bare task-ID off-mapping 2건(0043·0052) + agent-results notes 2건(0046·0057). 회고 §2.

## Level / meta-eval

- **Level 2** (UPDATE_POLICY) — route 출력 구조 변경(capability/feature 경계).
- **meta-eval: neutral** — clarify 사람 게이트를 **제거하지 않는다**. route-lib 은 informational 필드(`detectedPattern`·`detectedTaskId`·`suggestedNextStep`)만 추가하고 `classification`·`confidence`·`ambiguous`·`humanGateTokens` 는 그대로. route-request.md 는 "blank clarify 대신 task 파일을 읽어 **informed 확인**"으로 바꾸되 확인 자체는 유지. → weaken reason-code **해당 없음**(APPROVAL_GATE_NARROWED 아님 — 게이트 발동 횟수·주체 불변, 질문 품질만 향상).
- ADR **불필요**(weaken 없음). 정책상 strengthen/neutral 은 자유, 단 본 proposal 로 분류·기록.

## diff 요약 (적용됨 — PO 승인 후)

1. `scripts/harness-route-lib.mjs` `buildRoute()` — `/\bEVAL-\d+\b/i` 감지 시 `detectedPattern:"bare-task-id"`·`detectedTaskId`·`suggestedNextStep` 필드 추가(없으면 모두 null). gate 로직 무변경.
2. `scripts/harness-route-lib.spec.mjs` — bare task-ID 힌트 표시 + task-ID 없는 요청 null 2 테스트(neutral+test=strengthen).
3. `.agents/workflows/route-request.md` step 3 — `detectedPattern:"bare-task-id"` 시 task 파일(Kind/Status) 먼저 읽어 informed 확인 제시 조항(사람 게이트 유지).

## 승인 필요자 / 게이트

- **PO 승인 = 받음**(2026-06-30 세션, 사용자가 "안 B" 선택). neutral 이라 auto-merge 차단 대상 아님.
- **allowedWriteScopes 주의**: `scripts/**`(route-lib)와 `.agents/workflows/**`(route-request.md)는 `harness-improvement` 라우트의 `allowedWriteScopes`(`.agents/harness/**`·`evals/meta/**`·`docs/adr/**`) **밖**이다. 본 적용은 **명시적 PO 승인**으로 그 경계를 통과(자율 write 아님). allowedWriteScopes 자체의 항구 확장(자율화)은 별건 — AUTONOMY_EXPANDED weaken + ADR 필요라 **미적용**(회고 PO 문항 3 보류).

## reason-code (weaken 시)

- 없음 (neutral).

## risks

- false-positive: 없음 — 분류/게이트 미변경, 힌트는 무시 가능(무시해도 기존 동작 유지).
- 힌트가 informational 이라 오케스트레이터가 안 읽으면 효과 0 — route-request.md 절차 조항으로 보강.

## validation-plan / 결과

- `pnpm harness:test` → 125/125 PASS(신규 2 포함).
- `pnpm harness:route "EVAL-0099 진행하자"` → `detectedPattern:"bare-task-id"`·`detectedTaskId:"EVAL-0099"` 출력 + `ambiguous:true`·clarify 유지 확인.
- `pnpm harness:check` · `pnpm validate:docs` PASS.

## next-step

- **approve-and-apply** (완료 — PO 승인 후 적용·검증).
- 후속(별건, PO 보류): 안 A(`existing-task` 전용 라우트 + clarify 제거 = APPROVAL_GATE_NARROWED weaken + ADR) — 안 B 효과 관찰 후 escalation 검토. allowedWriteScopes 자율 확장(AUTONOMY_EXPANDED) 및 run JSON `reason` 필드 저장(회고 측정 공백)도 별도 결정.

> 적용은 PO 승인 후 수행됨. 본 문서는 propose-harness-update Output Format 기록 + 추적성용.
