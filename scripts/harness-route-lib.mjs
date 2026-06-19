// scripts/harness-route-lib.mjs
// 자연어 요청 분류 + 기존 하네스 워크플로 라우팅 (deterministic, LLM 비호출).
//
// 순수 함수만 export — fs/네트워크 비의존. requiredContext 실존 탐색은 fileExists 주입.
// 실행 진입점: harness-route.mjs(분류 JSON) · harness-intake.mjs(intake run 기록).
//
// SoT 관계 (drift 방지):
// - 분류 키워드·알고리즘: 본 파일 (실행 SoT)
// - 타입 → 워크플로/게이트/스코프 매핑: .agents/workflows/route-manifest.json (데이터 SoT)
// - 오케스트레이터 절차·정책 산문: .agents/workflows/route-request.md (사람/에이전트 SoT)
//   route-request.md 의 "대표 키워드" 는 본 파일 표의 발췌일 뿐 — 전체 목록은 여기가 원본이다.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const repoRoot = process.cwd();
export const manifestPath = path.join(repoRoot, ".agents/workflows/route-manifest.json");

// 신뢰도가 이 값 미만이면 ambiguous → 자동 진행 금지, 사람에게 분류 확인.
// 왜: 한국어 키워드 매칭은 brittle 하다("수정/개선/추가"가 여러 타입에 겹침). 저신뢰 자동 실행의 유일한 방어선.
export const CONFIDENCE_THRESHOLD = 0.6;

// 타입별 분류 키워드. 소문자 비교(norm). 우선순위 강제는 PRIORITY_RULES 가 별도 처리.
export const CLASSIFIER_KEYWORDS = {
  bugfix: [
    "버그",
    "안 돼",
    "안돼",
    "이상해",
    "잘못",
    "되면 안",
    "에러",
    "깨졌",
    "깨짐",
    "실패",
    "수정해",
    "고쳐",
    "안 됨",
    "오작동",
  ],
  feature: ["추가해", "새로 만들", "기능 넣", "지원하게", "만들어줘", "구현해줘", "새 기능"],
  improvement: ["개선", "더 쉽게", "ux", "성능", "리팩토", "리팩터", "불편", "최적화", "정리해"],
  prd: [
    "prd",
    "기획서",
    "요구사항",
    "정책",
    "mvp",
    "사용자 시나리오",
    "비즈니스 모델",
    "스펙 정의",
  ],
  "harness-improvement": [
    "하네스",
    "harness",
    "meta-eval",
    "메타평가",
    ".agents",
    "상태머신",
    "state machine",
    "workflow",
    "워크플로",
    "라우팅 룰",
    "검증 플로우",
    "에이전트가 계속",
    "에이전트가 자꾸",
  ],
  docs: ["문서화", "readme", "문서 정리", "주석 추가", "가이드 작성"],
  analysis: ["분석", "조사", "왜 그런", "원인 파악", "어떻게 동작", "파악해"],
};

// 우선순위 강제 키워드 — 매칭되면 다른 타입 점수를 눌러 이 타입으로 분류한다.
// 왜: "하네스 라우팅 버그" 는 bugfix 가 아니라 harness-improvement (기준 변경은 meta-eval 게이트).
//     "PRD 에 정책 추가" 는 feature 가 아니라 prd (문서·PO 승인 경로).
// 순서가 우선순위 — harness-improvement 가 prd 보다 먼저.
export const PRIORITY_RULES = [
  {
    type: "harness-improvement",
    keywords: [
      "하네스",
      "harness",
      "meta-eval",
      "메타평가",
      ".agents",
      "상태머신",
      "state machine",
      "workflow",
      "워크플로",
      "라우팅 룰",
      "검증 플로우",
    ],
  },
  { type: "prd", keywords: ["prd", "기획서", "정책", "요구사항", "mvp"] },
];

// 도메인 추론 키워드 → 도메인 슬러그. 실제 컨텍스트 경로는 manifest.domainContext 가 가진다.
export const DOMAIN_KEYWORDS = {
  challenge: ["챌린지", "challenge"],
  "challenge-feed": ["피드", "feed"],
  "peer-rejection": ["반려", "리젝", "거절", "peer", "반대"],
  kudos: ["이모지", "응원", "kudos", "엄지", "좋아요"],
  "action-log": ["인증", "사진", "운동 기록", "action log"],
  settlement: ["보증금", "정산", "결제", "포인트", "deposit"],
  push: ["푸시", "알림", "notification"],
};

const norm = (value) => String(value ?? "").toLowerCase();

function matchedKeywords(text, keywords) {
  const haystack = norm(text);
  return keywords.filter((keyword) => haystack.includes(norm(keyword)));
}

// 요청 텍스트를 7개 타입 중 하나로 분류한다. LLM 비호출, 순수 키워드 매칭.
// 반환: { classification, confidence(0~1), matchedKeywords, scores, ambiguous, reason }.
export function classifyRequest(text, options = {}) {
  const keywords = options.keywords ?? CLASSIFIER_KEYWORDS;
  const priorityRules = options.priorityRules ?? PRIORITY_RULES;

  const scores = {};
  const matches = {};
  for (const [type, list] of Object.entries(keywords)) {
    const hits = matchedKeywords(text, list);
    if (hits.length > 0) {
      scores[type] = hits.length;
      matches[type] = hits;
    }
  }

  // 우선순위 강제 후보: 첫 매칭 룰의 타입.
  let forced = null;
  let forcedHits = [];
  for (const rule of priorityRules) {
    const hits = matchedKeywords(text, rule.keywords);
    if (hits.length > 0) {
      forced = rule.type;
      forcedHits = hits;
      break;
    }
  }

  const matchedTypes = Object.keys(scores);

  // 아무 키워드도 안 잡힘 → analysis(읽기 전용)로 폴백 + ambiguous(사람 확인).
  if (matchedTypes.length === 0 && !forced) {
    return {
      classification: "analysis",
      confidence: 0.2,
      matchedKeywords: [],
      scores,
      ambiguous: true,
      reason: "no-keyword-match",
    };
  }

  // 우선순위 강제는 **조건부**다 — 경쟁 타입보다 신호가 약하지 않을 때만 발동한다.
  // 왜: `정책`·`workflow` 같은 도메인 공유어가 든 bugfix/feature 요청을 무조건 prd/harness 로
  //     끌고 가던 과발동(리뷰 M1)을 막는다. 동점이면 우선순위 타입을 택하되 ambiguous→clarify 게이트.
  if (forced) {
    const forcedHitSet = new Set([...(matches[forced] ?? []), ...forcedHits]);
    const forcedScore = forcedHitSet.size;
    const competitorScore = matchedTypes
      .filter((type) => type !== forced)
      .reduce((max, type) => Math.max(max, scores[type]), 0);

    if (forcedScore >= competitorScore) {
      const tie = forcedScore === competitorScore && competitorScore > 0;
      return {
        classification: forced,
        confidence: competitorScore === 0 ? 0.9 : tie ? 0.5 : 0.8,
        matchedKeywords: [...forcedHitSet],
        scores,
        ambiguous: tie,
        reason: tie ? "priority-forced-tie" : "priority-forced",
      };
    }
    // forced 가 경쟁 타입보다 약함 → 강제 취소, 아래 일반 랭킹으로 떨어진다.
  }

  const ranked = matchedTypes.sort((a, b) => scores[b] - scores[a]);
  const top = ranked[0];
  const topScore = scores[top];
  const secondScore = ranked.length > 1 ? scores[ranked[1]] : 0;

  let confidence;
  let ambiguous = false;
  if (ranked.length === 1) {
    confidence = Math.min(0.6 + 0.1 * topScore, 0.95);
  } else if (topScore - secondScore >= 2) {
    confidence = 0.75;
  } else {
    confidence = 0.5;
    ambiguous = true;
  }
  if (confidence < CONFIDENCE_THRESHOLD) {
    ambiguous = true;
  }

  return {
    classification: top,
    confidence: Number(confidence.toFixed(2)),
    matchedKeywords: matches[top],
    scores,
    ambiguous,
    reason: ambiguous ? "low-confidence-or-tie" : "keyword-match",
  };
}

// 요청에서 도메인 후보를 추론한다. 컨텍스트 경로가 아니라 슬러그만 — 경로 매핑은 resolveRequiredContext.
export function inferDomains(text, options = {}) {
  const domainKeywords = options.domainKeywords ?? DOMAIN_KEYWORDS;
  const domains = [];
  for (const [domain, list] of Object.entries(domainKeywords)) {
    if (matchedKeywords(text, list).length > 0) {
      domains.push(domain);
    }
  }
  return domains;
}

// classification → manifest.routes 엔트리 해석. blockedActions 는 공통 + 라우트별 병합.
export function resolveRoute(classification, manifest) {
  const route = manifest?.routes?.[classification];
  const commonBlocked = manifest?.commonBlockedActions ?? [];
  if (!route) {
    return {
      workflow: null,
      targetWorkflowFile: null,
      taskCreation: null,
      entryState: null,
      humanGateTokens: [],
      maxRepairAttempts: 0,
      allowedWriteScopes: [],
      blockedActions: commonBlocked,
      unknown: true,
    };
  }
  return {
    workflow: route.label ?? classification,
    targetWorkflowFile: route.targetWorkflow ?? null,
    taskCreation: route.taskCreation ?? null,
    entryState: route.entryState ?? null,
    humanGateTokens: route.humanGateTokens ?? [],
    maxRepairAttempts: route.maxRepairAttempts ?? 0,
    allowedWriteScopes: route.allowedWriteScopes ?? [],
    blockedActions: Array.from(new Set([...commonBlocked, ...(route.blockedActions ?? [])])),
  };
}

// base 컨텍스트 + 도메인별 컨텍스트를 모으되 실존 파일만 남긴다(환각 경로 차단).
// fileExists 주입으로 순수성·테스트 격리 유지.
export function resolveRequiredContext(domains, manifest, options = {}) {
  const fileExists = options.fileExists ?? existsSync;
  const root = options.repoRoot ?? repoRoot;
  const base = manifest?.baseContext ?? [];
  const domainContext = manifest?.domainContext ?? {};

  const candidates = [...base];
  for (const domain of domains) {
    for (const item of domainContext[domain] ?? []) {
      candidates.push(item);
    }
  }

  const seen = new Set();
  const resolved = [];
  for (const rel of candidates) {
    if (seen.has(rel)) {
      continue;
    }
    seen.add(rel);
    if (fileExists(path.join(root, rel))) {
      resolved.push(rel);
    }
  }
  return resolved;
}

// 분류·모호성·도메인에 근거한 risk 1줄. 없으면 null.
export function assessRisk(classification, ambiguous) {
  const parts = [];
  if (ambiguous) {
    parts.push(
      "분류 신뢰도 낮음 또는 다중 타입 매칭 — 자동 진행 말고 사용자에게 작업 타입을 먼저 확인",
    );
  }
  if (classification === "bugfix") {
    parts.push(
      "사용자가 '버그'라 해도 기존 제품 정책·코드 주석과 충돌할 가능성 — SPEC_CHECK 에서 재현 테스트/정책을 먼저 고정",
    );
  }
  if (classification === "harness-improvement") {
    parts.push(
      "하네스 기준 변경 — improvement proposal→meta-eval→human approval 전까지 자동 반영 금지 (.agents/harness/UPDATE_POLICY.md)",
    );
  }
  if (classification === "prd") {
    parts.push("제품 정책/AC 변경 — PO 승인 게이트 필요");
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

// 분류 → 라우팅 → 컨텍스트 → risk 전체 조립. bin 들이 호출하는 단일 진입.
export function buildRoute(request, manifest, options = {}) {
  const classification = classifyRequest(request, options);
  const domains = inferDomains(request, options);
  const route = resolveRoute(classification.classification, manifest);
  const requiredContext = resolveRequiredContext(domains, manifest, options);
  const risk = assessRisk(classification.classification, classification.ambiguous);

  // 모호하면 clarify 게이트를 추가해 오케스트레이터가 사람에게 확인하도록 강제.
  const humanGateTokens = classification.ambiguous
    ? Array.from(new Set([...route.humanGateTokens, "clarify"]))
    : route.humanGateTokens;

  return {
    request,
    classification: classification.classification,
    confidence: classification.confidence,
    ambiguous: classification.ambiguous,
    reason: classification.reason,
    workflow: route.workflow,
    targetWorkflowFile: route.targetWorkflowFile,
    taskCreation: route.taskCreation,
    nextState: route.entryState,
    domainCandidates: domains,
    risk,
    requiredContext,
    humanGateTokens,
    blockedActions: route.blockedActions,
    maxRepairAttempts: route.maxRepairAttempts,
    allowedWriteScopes: route.allowedWriteScopes,
  };
}

export function loadManifest(options = {}) {
  const file = options.file ?? manifestPath;
  const readFile = options.readFile ?? ((p) => readFileSync(p, "utf8"));
  return JSON.parse(readFile(file));
}

// manifest 의 모든 targetWorkflow·taskCreation 경로가 실존하는지 검증 — 환각/이동 경로를 CI 에서 잡는다.
// route-manifest 는 markdown 워크플로를 가리키는 얇은 index 이므로, 가리키는 대상이 사라지면 drift.
export function validateManifestTargets(manifest, options = {}) {
  const fileExists = options.fileExists ?? existsSync;
  const root = options.repoRoot ?? repoRoot;
  const errors = [];
  for (const [type, route] of Object.entries(manifest?.routes ?? {})) {
    for (const key of ["targetWorkflow", "taskCreation"]) {
      const rel = route[key];
      if (rel && !fileExists(path.join(root, rel))) {
        errors.push(
          `route-manifest.json routes.${type}.${key} → ${rel} 파일 없음 (환각/이동 경로)`,
        );
      }
    }
  }
  return errors;
}
