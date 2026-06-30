// scripts/harness-route-lib.spec.mjs
// 실행: node --test scripts/harness-route-lib.spec.mjs  (또는 pnpm harness:test)
//
// 자연어 요청 라우터의 deterministic 분류·라우팅 단위 테스트.
// fixture(끝난 챌린지 반려 이모지 버그) + 우선순위 규칙 + manifest 실존 검증.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRequest,
  inferDomains,
  resolveRoute,
  resolveRequiredContext,
  buildRoute,
  loadManifest,
  validateManifestTargets,
  PRIORITY_RULES,
  CLASSIFIER_KEYWORDS,
} from "./harness-route-lib.mjs";

const manifest = loadManifest();

// fileExists 주입 — 파일시스템 비의존(존재한다고 보는 경로 집합).
const existing = (paths) => {
  const set = new Set(paths.map((p) => `/repo/${p}`));
  return (absolutePath) => set.has(absolutePath);
};

const FIXTURE = "끝난 챌린지의 피드에 반려 이모지를 달 수 있는 버그 수정해줘.";

test("fixture: bugfix 로 분류", () => {
  const result = classifyRequest(FIXTURE);
  assert.equal(result.classification, "bugfix");
  assert.equal(result.ambiguous, false);
  assert.ok(result.confidence >= 0.6, `confidence ${result.confidence} 가 임계값 이상`);
});

test("fixture: 도메인 후보에 challenge-feed · peer-rejection · kudos 포함", () => {
  const domains = inferDomains(FIXTURE);
  for (const expected of ["challenge-feed", "peer-rejection", "kudos"]) {
    assert.ok(
      domains.includes(expected),
      `${expected} 가 도메인 후보에 있어야 함 (실제: ${domains})`,
    );
  }
});

test("fixture: buildRoute 가 bugfix-with-spec-check · SPEC_CHECK 로 라우팅 + risk 명시", () => {
  const route = buildRoute(FIXTURE, manifest, {
    fileExists: existing(["AGENTS.md", "docs/BE_SCHEMA.md"]),
    repoRoot: "/repo",
  });
  assert.equal(route.classification, "bugfix");
  assert.equal(route.workflow, "bugfix-with-spec-check");
  assert.equal(route.nextState, "SPEC_CHECK");
  assert.equal(route.targetWorkflowFile, ".agents/workflows/implement-agent-task.md");
  assert.ok(route.risk && route.risk.includes("정책"), "risk 에 정책 충돌 가능성 언급");
  assert.deepEqual(route.domainCandidates.includes("peer-rejection"), true);
});

test("우선순위: 하네스 키워드는 bugfix 보다 harness-improvement 우선", () => {
  const result = classifyRequest("하네스 라우팅 룰에 버그가 있어서 개선해줘");
  assert.equal(result.classification, "harness-improvement");
  assert.equal(result.reason, "priority-forced");
});

test("우선순위: PRD/정책 키워드는 feature 보다 prd 우선", () => {
  const result = classifyRequest("PRD 에 새 정책 추가해줘");
  assert.equal(result.classification, "prd");
});

test("feature 분류", () => {
  assert.equal(classifyRequest("다크모드 기능 추가해줘").classification, "feature");
});

test("improvement 분류", () => {
  assert.equal(classifyRequest("피드 로딩 성능 개선해줘").classification, "improvement");
});

test("키워드 미매칭 → analysis 폴백 + ambiguous", () => {
  const result = classifyRequest("음 그거 좀 봐줘");
  assert.equal(result.classification, "analysis");
  assert.equal(result.ambiguous, true);
});

test("ambiguous 면 humanGateTokens 에 clarify 추가", () => {
  const route = buildRoute("음 그거 좀 봐줘", manifest, {
    fileExists: () => false,
    repoRoot: "/repo",
  });
  assert.ok(route.humanGateTokens.includes("clarify"));
});

test("resolveRoute: blockedActions 는 공통 + 라우트별 병합 + bypass_human_gate 포함", () => {
  const route = resolveRoute("bugfix", manifest);
  assert.ok(route.blockedActions.includes("bypass_human_gate"));
  assert.ok(route.blockedActions.includes("push_without_human_approval"));
});

test("resolveRoute: 알 수 없는 분류는 unknown + 공통 blockedActions", () => {
  const route = resolveRoute("nonexistent", manifest);
  assert.equal(route.unknown, true);
  assert.ok(route.blockedActions.includes("bypass_human_gate"));
});

test("resolveRequiredContext: 실존 파일만 남기고 환각 경로 제거", () => {
  const fileExists = existing([
    "AGENTS.md",
    "docs/BE_SCHEMA.md",
    "packages/domain/src/validators/kudos.ts",
  ]);
  const resolved = resolveRequiredContext(["kudos", "peer-rejection"], manifest, {
    fileExists,
    repoRoot: "/repo",
  });
  assert.ok(resolved.includes("AGENTS.md"));
  assert.ok(resolved.includes("packages/domain/src/validators/kudos.ts"));
  // peer-rejection 경로는 existing 집합에 없으므로 빠져야 한다(환각 차단).
  assert.ok(!resolved.includes("packages/domain/src/validators/peer-rejection.ts"));
});

test("harness-improvement 라우트는 자동 반영 금지 게이트(po·gate) + repair 0", () => {
  const route = resolveRoute("harness-improvement", manifest);
  assert.equal(route.maxRepairAttempts, 0);
  assert.ok(route.humanGateTokens.includes("gate"));
});

test("manifest 의 모든 targetWorkflow·taskCreation 경로가 실존 (환각/drift 차단)", () => {
  const errors = validateManifestTargets(manifest);
  assert.deepEqual(errors, [], errors.join("\n"));
});

// ── 우선순위 과발동 방지 회귀 (리뷰 M1) ──
// 도메인 공유어(정책·workflow)가 든 bugfix/feature 요청이 prd/harness 로 끌려가면 안 된다.

test("과발동 방지: '정책' 든 버그 요청은 bugfix 유지(prd 강제 안 됨)", () => {
  const result = classifyRequest("정산 정책대로 안 되고 버그 있어 고쳐줘");
  assert.equal(result.classification, "bugfix");
});

test("과발동 방지: '워크플로' 든 기능 요청은 feature 유지(harness 강제 안 됨)", () => {
  const result = classifyRequest("온보딩 워크플로 화면 새로 만들어줘");
  assert.equal(result.classification, "feature");
});

test("우선순위 동점이면 ambiguous → clarify 게이트 (자동 진행 차단)", () => {
  const result = classifyRequest("결제 승인 workflow 자동화 기능 추가해줘");
  assert.equal(result.ambiguous, true);
  assert.equal(result.reason, "priority-forced-tie");
  const route = buildRoute("결제 승인 workflow 자동화 기능 추가해줘", manifest, {
    fileExists: () => false,
    repoRoot: "/repo",
  });
  assert.ok(route.humanGateTokens.includes("clarify"));
});

test("정상 강제는 유지: 경쟁보다 우세하면 priority-forced(ambiguous 아님)", () => {
  const result = classifyRequest("PRD 에 새 정책 추가해줘");
  assert.equal(result.classification, "prd");
  assert.equal(result.reason, "priority-forced");
  assert.equal(result.ambiguous, false);
});

// invariant (리뷰 m1): 우선순위 키워드는 분류 키워드에도 존재해야 점수 증거 위에서 강제가 발동한다.
// 갈라지면 점수 0 키워드가 경쟁 비교 없이 발동하는 회귀가 생긴다.
test("invariant: PRIORITY_RULES 키워드 ⊆ CLASSIFIER_KEYWORDS", () => {
  for (const rule of PRIORITY_RULES) {
    const classifierSet = new Set(
      (CLASSIFIER_KEYWORDS[rule.type] ?? []).map((k) => k.toLowerCase()),
    );
    const orphans = rule.keywords.filter((k) => !classifierSet.has(k.toLowerCase()));
    assert.deepEqual(orphans, [], `${rule.type} priority-only keywords: ${orphans.join(", ")}`);
  }
});

// buildRoute 가 reason 을 출력에 싣는다 (리뷰 m4 — bin JSON 진단 가시성).
test("buildRoute 출력에 reason 포함", () => {
  const route = buildRoute(FIXTURE, manifest, { fileExists: () => false, repoRoot: "/repo" });
  assert.equal(route.reason, "keyword-match");
});

// bare task-ID(EVAL-NNNN) 힌트 — 회고 2026-06-30(안 B, neutral). gate 미변경 informational 필드.
test("buildRoute 가 bare task-ID 를 detectedPattern 으로 표시한다", () => {
  const route = buildRoute("EVAL-0052 작업 진행하자", manifest, {
    fileExists: () => false,
    repoRoot: "/repo",
  });
  // 분류는 여전히 no-keyword-match→analysis ambiguous (clarify 게이트 보존).
  assert.equal(route.ambiguous, true);
  assert.equal(route.detectedPattern, "bare-task-id");
  assert.equal(route.detectedTaskId, "EVAL-0052");
  assert.equal(route.humanGateTokens.includes("clarify"), true);
  assert.equal(typeof route.suggestedNextStep, "string");
});

test("buildRoute 는 task-ID 없는 요청에 detectedPattern=null", () => {
  const route = buildRoute("결제 승인 workflow 자동화 기능 추가해줘", manifest, {
    fileExists: () => false,
    repoRoot: "/repo",
  });
  assert.equal(route.detectedPattern, null);
  assert.equal(route.detectedTaskId, null);
  assert.equal(route.suggestedNextStep, null);
});
