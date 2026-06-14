---
plan: 2026-06-12-harness-finalize-blocked-by-tokens
title: Blocked-by 토큰 문법 + harness:finalize 구현 계획
author: pistachio8
date: 2026-06-12
status: draft
---

# Blocked-by 토큰 문법 + harness:finalize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent Task의 `Blocked-by`·`Depends-on`을 `[type:value]` 토큰 문법으로 구조화하고, task 완료 처리 3단계(Status flip → runs[] append → harness:check)를 묶는 `pnpm harness:finalize` 명령을 만든다.

**Architecture:** 파서(`parseBlockers`)와 검증 규칙은 `scripts/harness-lib.mjs`에, CLI 오케스트레이션은 신규 `scripts/harness-finalize.mjs`에 둔다(순수 헬퍼는 finalize 파일에서 export + main guard로 테스트 가능). 13개 task frontmatter를 한 PR에서 일괄 마이그레이션해 두 문법 병존 기간을 0으로 만든다.

**Tech Stack:** Node.js ESM 스크립트(`.mjs`) · `node --test`(기존 `pnpm harness:test`) · 빌드/번들 무관.

**Spec:** [docs/superpowers/specs/2026-06-12-harness-finalize-blocked-by-tokens.md](../specs/2026-06-12-harness-finalize-blocked-by-tokens.md)

---

## 영향 범위

- 변경 경로: `scripts/harness-lib.mjs` · `scripts/harness-lib.spec.mjs` · `scripts/harness-check.mjs` · `scripts/harness-drift.mjs` · 신규 `scripts/harness-finalize.mjs` · `package.json` · `evals/tasks/*.md`(13개) · `evals/results/agent-results.json`(description만) · `.agents/backlog/AGENT_TASK_TEMPLATE.md` · `.agents/workflows/create-agent-tasks.md` · `.agents/workflows/implement-agent-task.md`
- 데이터/RLS 영향: 없음 (src/ 미접촉)
- 외부 서비스: 없음

## 커밋 순서 설계 (왜 이 순서인가)

마이그레이션(Task 2)을 검증 규칙(Task 3)보다 **먼저** 커밋한다. 새 토큰 줄은 구 소비처와도 호환되기 때문이다 — 구 정규식 `/EVAL-\d+/`의 첫 매치는 새 줄에서도 첫 `task:` 토큰의 값과 일치하고, 구 규칙 "blocked 면 Blocked-by 존재"도 새 줄이 만족한다. 반대로 검증 규칙을 먼저 넣으면 구문법 13개가 즉시 에러라 모든 중간 커밋에서 `harness:check`가 깨진다.

PR 머지는 merge commit 1개이므로 spec의 롤백(1 revert)은 `git revert -m 1 <merge-commit>`으로 성립한다.

## spec에 없는 판단 5건 (구현 중 재논의 금지 — 여기서 고정)

1. **0007도 양쪽 합성 대상**: spec C4는 dash 오른쪽 실질 정보 보유 task를 0019·0025·0026으로 적었지만, 0007의 오른쪽에도 `선행 WP1·WP2(EVAL-0005·0006)`가 있다. 토큰을 합성하지 않으면 base branch가 develop으로 떨어진다(현행은 EVAL-0005). "정보 손실 없음" 원칙에 따라 `[task:EVAL-0005] [task:EVAL-0006]`을 합성한다.
2. **0008의 "P2 peer-reject" = `[task:EVAL-0025]`**: 48h 이의 마감은 peer-reject feature(EVAL-0025)의 산출이다. 단, 기존 줄의 EVAL 등장 순서(0005→0006)를 보존해야 base branch가 유지되므로 **합성 토큰은 기존 EVAL 토큰 뒤에** 붙인다(순서 보존 규칙의 "왜"가 base branch 보존이므로 목적 정합).
3. **ADR 게이트 메시지 문구 일반화**: 감지 신호가 `adr:` 또는 `spec:` 토큰이 되므로 `renderGoalPrompt`의 경고 문구를 "ADR/spec 게이트"로 바꾼다(0009·0026이 새로 게이트 대상이 된다 — spec C2 의도).
4. **archive-only task id는 resolved 취급**: finalize의 미해소 검사와 drift advisory에서, 활성 목록(`loadMigrationTasks`)에 없는 `task:` 토큰(archive로 은퇴)은 done과 동일하게 본다. 미해소 취급하면 `--force`로도 우회 불가라 하류가 영구 차단된다.
5. **사람-판단 토큰 값 네이밍**: 0009 `spec:analytics-union`·`po:analytics-union`(spec C1 예시 유래) / 0025 `spec:reaction-storage`·`po:reaction-storage` / 0026 `spec:verify-analytics`·`po:verify-analytics`. 값은 기계 검증 대상이 아닌 사람용 핸들 — 서로 다른 spec임을 구분만 하면 된다.

---

### Task 0: 브랜치 생성

현재 브랜치 `chore/spec-harness-finalize-blocked-by`(spec 커밋 포함, 미머지) 위에서 시작한다.

- [ ] **Step 1: feat 브랜치 생성**

```bash
git checkout -b feat/harness-finalize-blocked-by
```

- [ ] **Step 2: 시작 상태 green 확인**

```bash
pnpm harness:check && pnpm harness:test
```

Expected: `[harness:check] PASS — 26 migration task(s) ...` + 테스트 전부 pass.

---

### Task 1: `parseBlockers` + `loadKnownTaskIds` (파서 신설 — 소비처 미접속)

**Files:**

- Modify: `scripts/harness-lib.mjs` (validateTask 위쪽, `STATUSES` 상수 근처)
- Test: `scripts/harness-lib.spec.mjs`

- [ ] **Step 1: 실패하는 테스트 작성** — `harness-lib.spec.mjs`의 `// ─── validateTask` 섹션 위에 추가:

```js
// ─────────────── parseBlockers (Blocked-by · Depends-on 토큰 파서) ───────────────

test("parseBlockers: — 왼쪽의 [type:value] 토큰을 순서대로 추출", () => {
  const tokens = parseBlockers("[task:EVAL-0005] [task:EVAL-0006] [gate:G2] — 법무 통과 후 노출.");
  assert.deepEqual(tokens, [
    { type: "task", value: "EVAL-0005" },
    { type: "task", value: "EVAL-0006" },
    { type: "gate", value: "G2" },
  ]);
});

test("parseBlockers: 첫 — 오른쪽 prose 의 토큰·EVAL 인용은 무시 (EVAL-0022 선례 오탐 방지)", () => {
  const tokens = parseBlockers(
    "[task:EVAL-0020] — intra-feature 순서(게이트 아님, EVAL-0006 선례 — [task:EVAL-0099] 인용).",
  );
  assert.deepEqual(tokens, [{ type: "task", value: "EVAL-0020" }]);
});

test("parseBlockers: 토큰 없는 구문법 prose → 빈 배열", () => {
  assert.deepEqual(parseBlockers("G2(법무) 통과 + EVAL-0005 선행."), []);
});

test("parseBlockers: dash 없는 토큰-only 줄도 추출", () => {
  assert.deepEqual(parseBlockers("[task:EVAL-0010]"), [{ type: "task", value: "EVAL-0010" }]);
});

test("parseBlockers: undefined/빈 입력에 안전", () => {
  assert.deepEqual(parseBlockers(undefined), []);
  assert.deepEqual(parseBlockers(""), []);
});

test("loadKnownTaskIds: 활성 + archive task id 를 모두 포함 (archive 는 파일명 파생)", () => {
  const ids = loadKnownTaskIds();
  assert.ok(ids.has("EVAL-0004")); // 활성 frontmatter
  assert.ok(ids.has("EVAL-0001")); // archive — frontmatter 없음, 파일명 0001- 에서 파생
  assert.ok(!ids.has("EVAL-9999"));
});
```

import 목록에 `parseBlockers, loadKnownTaskIds, BLOCKER_TOKEN_TYPES`를 추가한다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm harness:test`
Expected: FAIL — `parseBlockers is not exported` 류의 import 에러.

- [ ] **Step 3: 구현** — `harness-lib.mjs`의 `STATUSES` 상수 아래에 추가:

```js
// ── Blocked-by · Depends-on 토큰 문법 (spec 2026-06-12-harness-finalize-blocked-by-tokens §C1) ──
// `[type:value] [type:value] — 자유 문장`. 첫 `—`(em dash) 왼쪽에서만 토큰을 추출한다.
// 왜 첫 — 기준: prose 안의 토큰·EVAL 인용(예: EVAL-0022 의 "EVAL-0006 선례")을 의존으로 오탐하지 않기 위해.
// 타입 5종 고정 — 현행 13개 task blocker 전수 분류가 이 5종으로 닫힌다. 신규 타입은 spec 갱신으로만.
export const BLOCKER_TOKEN_TYPES = new Set(["task", "gate", "adr", "spec", "po"]);

export function parseBlockers(line) {
  const left = String(line ?? "").split("—")[0];
  const tokens = [];
  for (const match of left.matchAll(/\[([a-z]+):([^\]]+)\]/g)) {
    tokens.push({ type: match[1], value: match[2].trim() });
  }
  return tokens;
}
```

그리고 `tasksDir` 선언 아래에:

```js
export const archiveTasksDir = path.join(tasksDir, "archive");

// task: 토큰 존재 검사용 id 인덱스 — 활성 evals/tasks/ + archive/ 포함.
// 왜 archive 포함: 선행 done task 가 나중에 archive 되는 순간 하류 토큰이 CI 를 깨는 회귀 방지.
// archive 구파일(0001~0003)은 frontmatter 가 없어 파일명 번호에서 id 를 파생한다.
export function loadKnownTaskIds() {
  const ids = new Set();
  for (const dir of [tasksDir, archiveTasksDir]) {
    if (!existsSync(dir)) {
      continue;
    }
    for (const file of readdirSync(dir)) {
      const match = file.match(/^(\d{4})-.*\.md$/);
      if (!match || file.endsWith(".goal.md")) {
        continue;
      }
      const frontmatter = parseFrontmatter(readFileSync(path.join(dir, file), "utf8"));
      ids.add((frontmatter.Task || `EVAL-${match[1]}`).toUpperCase());
    }
  }
  return ids;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm harness:test`
Expected: PASS (기존 테스트 포함 전부).

- [ ] **Step 5: 커밋**

```bash
git add scripts/harness-lib.mjs scripts/harness-lib.spec.mjs
git commit -m "feat(harness): parseBlockers + loadKnownTaskIds — Blocked-by 토큰 파서 신설"
```

---

### Task 2: 13개 task frontmatter 마이그레이션

**Files:**

- Modify: `evals/tasks/0007·0008·0009·0011·0014·0015·0016·0017·0018·0019·0022·0025·0026-*.md` (각 frontmatter 6행 1줄만)

규칙 리마인드: `task:` 토큰은 선행이 done이어도 항상 보존. 사람-판단 타입(gate/adr/spec/po)만 해소·조건부 제외. 본문 prose는 건드리지 않는다(특히 done인 0028·0029 본문의 Depends-on 표기, 0013 본문 100행).

- [ ] **Step 1: 마이그레이션 전 base branch 스냅샷** (회귀 비교 기준 — blocked/open 9개)

```bash
for id in EVAL-0007 EVAL-0008 EVAL-0009 EVAL-0016 EVAL-0017 EVAL-0018 EVAL-0019 EVAL-0025 EVAL-0026; do
  echo "== $id"; pnpm -s harness:goal $id | grep "git worktree add"
done > /tmp/goal-base-before.txt
cat /tmp/goal-base-before.txt
```

- [ ] **Step 2: 13개 파일의 줄을 정확히 다음으로 교체** (old → new, 각 파일 frontmatter 내 1줄)

`0007-deposit-hold-gauge-ui.md`:

```
old: Blocked-by: G2(ⓑ적립 포인트 법무 검토) 통과 — 사용자향 보증금 hold/게이지 노출. 선행 WP1·WP2(EVAL-0005·0006) 구현.
new: Blocked-by: [task:EVAL-0005] [task:EVAL-0006] [gate:G2] — G2(ⓑ적립 포인트 법무 검토) 통과 후 사용자향 보증금 hold/게이지 노출. 선행 WP1·WP2 구현 의존.
```

`0008-settlement-trigger-cron.md` (판단 2: P2 peer-reject = EVAL-0025, 기존 EVAL 순서 뒤에 합성):

```
old: Blocked-by: G2(법무) 통과 + P2 peer-reject(48h 이의 마감) 의존. 선행 WP1·WP2(EVAL-0005·0006).
new: Blocked-by: [task:EVAL-0005] [task:EVAL-0006] [task:EVAL-0025] [gate:G2] — G2(법무) 통과 + P2 peer-reject(EVAL-0025, 48h 이의 마감) 의존. 선행 WP1·WP2.
```

`0009-points-use-balance-screen.md`:

```
old: Blocked-by: G2(법무) 통과 + AnalyticsEvent union(PRD §9.1 1:1) spec 선행·PO 승인. 선행 WP1·WP2(EVAL-0005·0006).
new: Blocked-by: [task:EVAL-0005] [task:EVAL-0006] [gate:G2] [spec:analytics-union] [po:analytics-union] — G2(법무) 통과 + AnalyticsEvent union(PRD §9.1 1:1) spec 선행·PO 승인. 선행 WP1·WP2.
```

`0011-rn-expo-boot.md` (done — frontmatter 표기 변환은 이번 PR 한정 예외):

```
old: Blocked-by: EVAL-0010(RN monorepo foundation) complete.
new: Blocked-by: [task:EVAL-0010] — RN monorepo foundation complete 선행.
```

`0014-rn-expo-router-skeleton.md` (done):

```
old: Blocked-by: EVAL-0012(G3 auth PoC) complete — PR #199 머지(2026-06-11)로 해제.
new: Blocked-by: [task:EVAL-0012] — G3 auth PoC complete 선행. PR #199 머지(2026-06-11)로 해제.
```

`0015-rn-shared-domain-package-build.md` (done):

```
old: Blocked-by: EVAL-0010(RN monorepo foundation) complete.
new: Blocked-by: [task:EVAL-0010] — RN monorepo foundation complete 선행.
```

`0016-rn-read-model-contract.md` (D-4는 ADR-0036으로 해소 — adr 토큰 제외, 해소 기록은 prose. EVAL-0015가 done이므로 이후 Task 6의 advisory 1건 표본이 된다):

```
old: Blocked-by: EVAL-0015(G6 shared domain package) complete + ADR/spec if 00 §13.4 D-4 admin hydrate RN contract remains unresolved.
new: Blocked-by: [task:EVAL-0015] — G6 shared domain package complete 선행. 00 §13.4 D-4 admin hydrate RN 계약은 ADR-0036 확정으로 해소(adr 토큰 제외).
```

`0017-rn-home-challenge-read-only-screens.md`:

```
old: Blocked-by: EVAL-0014(G5 Expo Router skeleton) complete + EVAL-0016(G7 read model contract) complete.
new: Blocked-by: [task:EVAL-0014] [task:EVAL-0016] — G5 Expo Router skeleton·G7 read model contract complete 선행.
```

`0018-rn-challenge-lifecycle-mutations.md`:

```
old: Blocked-by: EVAL-0017(G8 read-only screens) complete.
new: Blocked-by: [task:EVAL-0017] — G8 read-only screens complete 선행.
```

`0019-rn-native-action-log-mvp.md` (D-7 미해소 확인됨 — 조건부 spec은 사람-판단 타입 제외 규칙 적용, prose 보존):

```
old: Blocked-by: EVAL-0018(G9 challenge lifecycle mutations) complete + spec — 00 §13.4 D-7 submitActionLog BFF contract accepted if still unresolved.
new: Blocked-by: [task:EVAL-0018] — G9 challenge lifecycle mutations complete 선행. 00 §13.4 D-7 submitActionLog BFF contract spec 은 미해소 시 추가 선행(조건부 — 토큰 제외, D-7 spec 착수 확정 시 spec 토큰 추가).
```

`0022-verify-judgment-theta-gated.md` (done · Depends-on — prose의 "EVAL-0006 선례"가 인용-무시 보호의 살아있는 예시로 남는다):

```
old: Depends-on: EVAL-0020(컬럼)·EVAL-0021(신호 골격) 구현 — intra-feature 순서(게이트 아님, EVAL-0006 선례). G1-θ는 잠정확정·주입됨(2026-06-05, 실측 PoC open).
new: Depends-on: [task:EVAL-0020] [task:EVAL-0021] — intra-feature 순서(게이트 아님, EVAL-0006 선례). G1-θ는 잠정확정·주입됨(2026-06-05, 실측 PoC open).
```

`0025-verify-peer-reject-owner-replace.md`:

```
old: Blocked-by: reaction 저장 모델 spec 선행 — 🟨 익명 반려 = Kudos union 변경(PRD §9.1 1:1) → PO 승인 + 별도 spec(ADR-0032 §게이트·범위 경계, 둘 다 미작성). 선행 EVAL-0020(컬럼).
new: Blocked-by: [task:EVAL-0020] [spec:reaction-storage] [po:reaction-storage] — 🟨 익명 반려 = Kudos union 변경(PRD §9.1 1:1) → PO 승인 + 별도 spec(ADR-0032 §게이트·범위 경계, 둘 다 미작성) 선행. 선행 EVAL-0020(컬럼).
```

`0026-verify-ops-alert-analytics.md`:

```
old: Blocked-by: 신규 AnalyticsEvent spec 선행 — 자동검증·반려 이벤트는 PRD §9.1 union 1:1 spec + PO 승인(가드레일 §AnalyticsEvent). 선행 EVAL-0022(판정)·EVAL-0025(반려) 산출.
new: Blocked-by: [task:EVAL-0022] [task:EVAL-0025] [spec:verify-analytics] [po:verify-analytics] — 자동검증·반려 이벤트는 PRD §9.1 union 1:1 spec + PO 승인 선행(가드레일 §AnalyticsEvent). 선행 EVAL-0022(판정)·EVAL-0025(반려) 산출.
```

- [ ] **Step 3: base branch 회귀 0 확인** (구 정규식이 새 줄에서도 같은 첫 EVAL을 잡는지)

```bash
for id in EVAL-0007 EVAL-0008 EVAL-0009 EVAL-0016 EVAL-0017 EVAL-0018 EVAL-0019 EVAL-0025 EVAL-0026; do
  echo "== $id"; pnpm -s harness:goal $id | grep "git worktree add"
done > /tmp/goal-base-after.txt
diff /tmp/goal-base-before.txt /tmp/goal-base-after.txt
```

Expected: diff 출력 없음 (exit 0).

- [ ] **Step 4: 구 규칙 기준 green + 인스턴스 전수 토큰화 확인**

```bash
pnpm harness:check
grep -n "^Blocked-by:\|^Depends-on:" evals/tasks/*.md
```

Expected: check PASS. grep 13줄 전부 `[type:value]` 토큰으로 시작.

- [ ] **Step 5: 커밋**

```bash
git add evals/tasks/
git commit -m "chore(evals): Blocked-by·Depends-on 13개 task 토큰 문법 일괄 마이그레이션"
```

---

### Task 3: `validateTask` 토큰 규칙 + check/drift 배선

**Files:**

- Modify: `scripts/harness-lib.mjs:63-113` (validateTask)
- Modify: `scripts/harness-check.mjs:14-15` · `scripts/harness-drift.mjs:3-11`
- Test: `scripts/harness-lib.spec.mjs`

- [ ] **Step 1: 실패하는 테스트 작성** — validateTask 섹션에 추가:

```js
const KNOWN_IDS = new Set(["EVAL-0004", "EVAL-0010", "EVAL-0020"]);

test("validateTask: Blocked-by 키 존재 + 토큰 0개(구문법 prose) → 위반", () => {
  const errs = validateTask(
    makeTask({ ...VALID_FM, Status: "blocked", "Blocked-by": "G2 통과 + EVAL-0010 선행." }),
    { exists: fakeExists, knownTaskIds: KNOWN_IDS },
  );
  assert.ok(errs.some((e) => /Blocked-by must have >=1 \[type:value\] token/.test(e)));
});

test("validateTask: Depends-on 도 같은 규칙 — todo task 의 구문법이 무검출로 살아남지 않는다", () => {
  const errs = validateTask(makeTask({ ...VALID_FM, "Depends-on": "EVAL-0020 구현 선행." }), {
    exists: fakeExists,
    knownTaskIds: KNOWN_IDS,
  });
  assert.ok(errs.some((e) => /Depends-on must have >=1 \[type:value\] token/.test(e)));
});

test("validateTask: 미지 토큰 타입 → 위반", () => {
  const errs = validateTask(
    makeTask({ ...VALID_FM, Status: "blocked", "Blocked-by": "[until:next-week] — 다음 주." }),
    { exists: fakeExists, knownTaskIds: KNOWN_IDS },
  );
  assert.ok(errs.some((e) => /unknown token type \[until:\]/.test(e)));
});

test("validateTask: task: 토큰이 미존재 task 참조 → 위반", () => {
  const errs = validateTask(
    makeTask({ ...VALID_FM, Status: "blocked", "Blocked-by": "[task:EVAL-9999] — 유령 선행." }),
    { exists: fakeExists, knownTaskIds: KNOWN_IDS },
  );
  assert.ok(errs.some((e) => /\[task:EVAL-9999\] not found/.test(e)));
});

test("validateTask: 정상 토큰 문법 → 위반 0 (사람-판단 타입 값은 검증 안 함)", () => {
  const errs = validateTask(
    makeTask({
      ...VALID_FM,
      Status: "blocked",
      "Blocked-by":
        "[task:EVAL-0010] [gate:G2] [spec:analytics-union] [po:retap-flow] [adr:0036] — 설명.",
    }),
    { exists: fakeExists, knownTaskIds: KNOWN_IDS },
  );
  assert.deepEqual(errs, []);
});

test("validateTask: knownTaskIds 미주입(null)이면 task: 존재 검사만 skip", () => {
  const errs = validateTask(
    makeTask({ ...VALID_FM, Status: "blocked", "Blocked-by": "[task:EVAL-9999] — 유령." }),
    { exists: fakeExists },
  );
  assert.deepEqual(errs, []);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm harness:test`
Expected: 신규 6건 FAIL (기존은 PASS).

- [ ] **Step 3: 구현** — `validateTask` 시그니처를 바꾸고, 기존 `blocked tasks require Blocked-by` 규칙 바로 아래에 추가:

```js
export function validateTask(task, { exists = existsSync, knownTaskIds = null } = {}) {
```

```js
// 토큰 문법 강제 (spec §C2) — blocked 한정이 아니라 "키가 존재하면" 검사한다.
// 왜: blocked 한정이면 todo task 의 Depends-on 구문법이 무검출로 살아남아 base branch 가 조용히 develop 으로 떨어진다.
for (const key of ["Blocked-by", "Depends-on"]) {
  if (!(key in task.frontmatter)) {
    continue;
  }
  const tokens = parseBlockers(task.frontmatter[key]);
  if (tokens.length === 0) {
    errors.push(
      `${task.repoPath}: ${key} must have >=1 [type:value] token before — (구문법 prose 금지, spec 2026-06-12 §C1)`,
    );
  }
  for (const token of tokens) {
    if (!BLOCKER_TOKEN_TYPES.has(token.type)) {
      errors.push(
        `${task.repoPath}: ${key} unknown token type [${token.type}:] — task·gate·adr·spec·po 만 허용(신규 타입은 spec 갱신)`,
      );
    } else if (
      token.type === "task" &&
      knownTaskIds &&
      !knownTaskIds.has(token.value.toUpperCase())
    ) {
      errors.push(
        `${task.repoPath}: ${key} [task:${token.value}] not found in evals/tasks/ (+archive/)`,
      );
    }
  }
}
```

`harness-check.mjs` Tier 1-A 배선 교체:

```js
import {
  loadMigrationTasks,
  validateTask,
  loadKnownTaskIds,
  validateGoalPromptLength,
  loadAcIndex,
  loadCitationFiles,
  validateAcTraceability,
  loadAgentResults,
  validateDoneRunParity,
} from "./harness-lib.mjs";

// Tier 1-A: Agent Task frontmatter·경로 추적성 + Blocked-by/Depends-on 토큰 문법.
const tasks = loadMigrationTasks();
const knownTaskIds = loadKnownTaskIds();
const taskErrors = tasks.flatMap((task) => validateTask(task, { knownTaskIds }));
```

`harness-drift.mjs`도 동일하게 `loadKnownTaskIds` import + `validateTask(task, { knownTaskIds })`로 교체하고, Checks 목록의 `- blocked task Blocked-by presence` 줄을 다음으로 교체:

```
- blocked task Blocked-by presence + Blocked-by/Depends-on 토큰 문법(≥1 [type:value]·타입 5종·task: 존재)
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm harness:test && pnpm harness:check && pnpm harness:drift`
Expected: 전부 PASS / 0 violations (13개가 이미 마이그레이션됐으므로).

- [ ] **Step 5: 커밋**

```bash
git add scripts/harness-lib.mjs scripts/harness-lib.spec.mjs scripts/harness-check.mjs scripts/harness-drift.mjs
git commit -m "feat(harness): validateTask 토큰 규칙 — 키 존재 시 토큰 ≥1·미지 타입·미존재 task 에러"
```

---

### Task 4: `renderGoalPrompt` 소비처 교체 (base branch · ADR/spec 게이트)

**Files:**

- Modify: `scripts/harness-lib.mjs:498-547` (renderGoalPrompt)
- Test: `scripts/harness-lib.spec.mjs` (기존 fixture 2곳 갱신 + 신규 2건)

- [ ] **Step 1: 테스트 갱신·추가** — 기존 `renderGoalPrompt: ADR 게이트…` 테스트(spec.mjs:366 부근)의 fixture를 토큰 문법으로 교체:

```js
    frontmatter: {
      Task: "EVAL-0099",
      "Blocked-by": "[task:EVAL-0098] [adr:0033] — complete + ADR accepted.",
    },
```

assertion `assert.match(out, /ADR 게이트/);` → `assert.match(out, /ADR\/spec 게이트/);`로, 두 번째 테스트의 `assert.doesNotMatch(out, /ADR 게이트/);` → `assert.doesNotMatch(out, /ADR\/spec 게이트/);`로 교체. 신규 테스트 2건 추가:

````js
test("renderGoalPrompt: Depends-on 만 있는 task 도 첫 task: 토큰을 base 로 (Blocked-by 우선)", () => {
  const base = {
    repoPath: "evals/tasks/0099-web-dep.md",
    absolutePath: "/repo/evals/tasks/0099-web-dep.md",
    verificationCommands: "```bash\npnpm -r test\n```",
    sourcePaths: [pr("docs/PRD.md")],
    targetPaths: [pr("apps/web/src/x.ts")],
    content: [
      "# EVAL-0099: Dep title",
      "## Parent Links",
      "- Parent Work Package: `feat/web-dep`.",
      "## Requirements",
      "- do z",
      "## Non-goals",
      "- not w",
      "## Acceptance Criteria",
      "- ac",
      "## Verification Commands",
      "```bash",
      "pnpm -r test",
      "```",
      "## Stop Condition",
      "- done",
    ].join("\n"),
  };
  const dependsOnly = {
    ...base,
    frontmatter: { Task: "EVAL-0099", "Depends-on": "[task:EVAL-0097] — intra-feature 순서." },
  };
  const out = renderGoalPrompt(dependsOnly, { lookupBranch: (id) => `feat/base-of-${id}` });
  assert.match(
    out,
    /git worktree add -b feat\/web-dep \.\.\/with-key-web-dep feat\/base-of-EVAL-0097/,
  );

  const both = {
    ...base,
    frontmatter: {
      Task: "EVAL-0099",
      "Blocked-by": "[task:EVAL-0096] — 하드 게이트.",
      "Depends-on": "[task:EVAL-0097] — 순서.",
    },
  };
  const outBoth = renderGoalPrompt(both, { lookupBranch: (id) => `feat/base-of-${id}` });
  assert.match(outBoth, /feat\/base-of-EVAL-0096/); // Blocked-by 우선
});

test("renderGoalPrompt: prose 의 ADR 단어는 더 이상 게이트 신호가 아님 — adr:/spec: 토큰만", () => {
  const task = {
    repoPath: "evals/tasks/0099-web-bar.md",
    absolutePath: "/repo/evals/tasks/0099-web-bar.md",
    frontmatter: {
      Task: "EVAL-0099",
      "Blocked-by": "[task:EVAL-0098] — ADR-0032 는 이미 accepted(인용일 뿐).",
    },
    verificationCommands: "```bash\npnpm -r test\n```",
    sourcePaths: [pr("docs/PRD.md")],
    targetPaths: [pr("apps/web/src/x.ts")],
    content: [
      "# EVAL-0099: Bar title",
      "## Parent Links",
      "- Parent Work Package: `feat/web-bar`.",
      "## Requirements",
      "- do z",
      "## Non-goals",
      "- not w",
      "## Acceptance Criteria",
      "- ac",
      "## Verification Commands",
      "```bash",
      "pnpm -r test",
      "```",
      "## Stop Condition",
      "- done",
    ].join("\n"),
  };
  const out = renderGoalPrompt(task, { lookupBranch: () => "feat/x" });
  assert.doesNotMatch(out, /ADR\/spec 게이트/);
});
````

- [ ] **Step 2: 실패 확인**

Run: `pnpm harness:test`
Expected: 갱신·신규 renderGoalPrompt 테스트 FAIL.

- [ ] **Step 3: 구현** — `renderGoalPrompt` 본문에서 다음을 교체:

```js
const blockedBy = task.frontmatter["Blocked-by"] || "";
// 첫 task: 토큰이 worktree base 선행 — Blocked-by 우선, 없으면 Depends-on (spec §C2).
// 왜 첫 토큰: 현행 동작(첫 선행 브랜치 위에 쌓기) 보존 — 복수 base 병합은 범위 밖.
const blockerTokens = parseBlockers(blockedBy);
const dependsTokens = parseBlockers(task.frontmatter["Depends-on"] || "");
```

기존 `const predecessor = (blockedBy.match(/EVAL-\d+/) || [])[0];` 줄을:

```js
const firstTaskToken = [...blockerTokens, ...dependsTokens].find((t) => t.type === "task");
const predecessor = firstTaskToken ? firstTaskToken.value : null;
```

기존 `const adrGate = /\bADR\b/.test(blockedBy);` 줄을:

```js
// ADR/spec 게이트: prose 단어 매치가 아니라 토큰 존재로 판단 — 인용 오탐 제거 (spec §C2).
const adrGate = blockerTokens.some((t) => t.type === "adr" || t.type === "spec");
```

게이트 경고 문구(out.push 내부)를:

```js
      `- ⚠️ ADR/spec 게이트: 이 task 는 선행 결정에 막혀 있다 — "Blocked-by: ${blockedBy}". 해당 ADR/spec 이 docs/adr/ · docs/superpowers/specs/ 에 accepted 로 없으면 \`pnpm new adr <topic>\`(또는 \`pnpm new spec\`) 으로 초안만 작성하고 **STOP — PO 수락 요청**. 수락 전 관련 구성을 코드로 확정하지 않는다.`,
```

- [ ] **Step 4: 통과 + base branch 회귀 0 재확인**

```bash
pnpm harness:test && pnpm harness:check
for id in EVAL-0007 EVAL-0008 EVAL-0009 EVAL-0016 EVAL-0017 EVAL-0018 EVAL-0019 EVAL-0025 EVAL-0026; do
  echo "== $id"; pnpm -s harness:goal $id | grep "git worktree add"
done | diff /tmp/goal-base-before.txt -
```

Expected: 테스트 PASS · check PASS(0009·0026 게이트 문단 추가에도 Tier 1-C 4000자 이내 — 초과 시 해당 task 본문이 아니라 게이트 문구를 줄인다) · diff 출력 없음.

- [ ] **Step 5: 커밋**

```bash
git add scripts/harness-lib.mjs scripts/harness-lib.spec.mjs
git commit -m "feat(harness): renderGoalPrompt 토큰 소비 — base branch·ADR/spec 게이트를 토큰으로 판단"
```

---

### Task 5: Tier 1-D 확장 — done runs entry의 `<<FILL>>` 잔존 에러

**Files:**

- Modify: `scripts/harness-lib.mjs:171-190` (validateDoneRunParity)
- Test: `scripts/harness-lib.spec.mjs`

- [ ] **Step 1: 실패하는 테스트 작성** — validateDoneRunParity 섹션에 추가:

```js
test("validateDoneRunParity: done entry 에 <<FILL>> 잔존 → 위반 (finalize skeleton 미완 커밋 차단)", () => {
  const errs = validateDoneRunParity(
    [makeTask({ ...VALID_FM, Task: "EVAL-0099", Status: "done" })],
    { runs: [{ taskId: "EVAL-0099", summary: "<<FILL>>", verification: "<<FILL>>" }] },
  );
  assert.equal(errs.length, 1);
  assert.ok(/<<FILL>> placeholder/.test(errs[0]));
});

test("validateDoneRunParity: done entry 가 완전하면 위반 0 · done 아닌 task 의 entry 는 placeholder 무검사", () => {
  const errs = validateDoneRunParity(
    [
      makeTask({ ...VALID_FM, Task: "EVAL-0099", Status: "done" }),
      makeTask({ ...VALID_FM, Task: "EVAL-0098", Status: "in_progress" }),
    ],
    {
      runs: [
        { taskId: "EVAL-0099", summary: "요약", verification: { local: { "pnpm test": "pass" } } },
        { taskId: "EVAL-0098", summary: "<<FILL>>" },
      ],
    },
  );
  assert.deepEqual(errs, []);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm harness:test`
Expected: 1번째 신규 테스트 FAIL.

- [ ] **Step 3: 구현** — `validateDoneRunParity` 본문을 다음으로 교체 (주석 블록은 유지하고 "placeholder 검사" 설명 1줄 추가):

```js
export function validateDoneRunParity(tasks, results, { grandfathered = GRANDFATHERED_DONE } = {}) {
  const runs = results.runs ?? [];

  return tasks.flatMap((task) => {
    if (task.frontmatter.Status !== "done") {
      return [];
    }
    const id = task.frontmatter.Task?.toUpperCase();
    if (!id) {
      return [];
    }
    const entries = runs.filter(
      (run) => typeof run.taskId === "string" && run.taskId.toUpperCase() === id,
    );
    const errors = [];
    if (entries.length === 0 && !grandfathered.has(id)) {
      errors.push(
        `${task.repoPath}: Status 'done' but no runs[] record for ${id} in evals/results/agent-results.json — append a run entry in the same PR`,
      );
    }
    // finalize skeleton 의 <<FILL>> 이 채워지지 않은 채 커밋되는 회귀를 CI 게이트로 차단 (spec §C2).
    // finalize 의 exit 1 은 프로세스가 살아있는 동안만 유효 — 영속 게이트는 여기다.
    for (const entry of entries) {
      if (JSON.stringify(entry).includes("<<FILL>>")) {
        errors.push(
          `${task.repoPath}: runs[] entry for ${id} has <<FILL>> placeholder — summary·verification 을 채우고 notes 불요 시 필드를 삭제하라`,
        );
      }
    }
    return errors;
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm harness:test && pnpm harness:check`
Expected: PASS (현행 runs[] 5건에 placeholder 없음).

- [ ] **Step 5: 커밋**

```bash
git add scripts/harness-lib.mjs scripts/harness-lib.spec.mjs
git commit -m "feat(harness): Tier 1-D 확장 — done runs entry 의 <<FILL>> 잔존을 check 에러로"
```

---

### Task 6: drift 해제 후보 advisory (`detectUnblockCandidates`)

**Files:**

- Modify: `scripts/harness-lib.mjs` (detectStaleStatus 아래) · `scripts/harness-drift.mjs`
- Test: `scripts/harness-lib.spec.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**:

```js
// ─────────────── detectUnblockCandidates (해제 후보 advisory — 비차단) ───────────────

function blockedTask(id, blockedBy) {
  return makeTask({ ...VALID_FM, Task: id, Status: "blocked", "Blocked-by": blockedBy });
}

test("detectUnblockCandidates: task: blocker 전부 done → 해제 후보 경고", () => {
  const tasks = [
    makeTask({ ...VALID_FM, Task: "EVAL-0015", Status: "done" }),
    blockedTask("EVAL-0016", "[task:EVAL-0015] — G6 선행."),
  ];
  const warns = detectUnblockCandidates(tasks);
  assert.equal(warns.length, 1);
  assert.ok(/todo 로 flip\?/.test(warns[0]));
});

test("detectUnblockCandidates: 사람-판단 토큰(gate/adr/spec/po)이 섞이면 침묵", () => {
  const tasks = [
    makeTask({ ...VALID_FM, Task: "EVAL-0005", Status: "done" }),
    blockedTask("EVAL-0007", "[task:EVAL-0005] [gate:G2] — 법무 통과 후."),
  ];
  assert.deepEqual(detectUnblockCandidates(tasks), []);
});

test("detectUnblockCandidates: done 아닌 task: blocker 가 남으면 침묵", () => {
  const tasks = [
    makeTask({
      ...VALID_FM,
      Task: "EVAL-0017",
      Status: "blocked",
      "Blocked-by": "[task:EVAL-0014] — x.",
    }),
    blockedTask("EVAL-0018", "[task:EVAL-0017] — G8 선행."),
    makeTask({ ...VALID_FM, Task: "EVAL-0014", Status: "done" }),
  ];
  // 0017 은 blocker(0014)가 done 이지만 자신이 blocked → 후보. 0018 은 0017 미done → 침묵.
  const warns = detectUnblockCandidates(tasks);
  assert.equal(warns.length, 1);
  assert.ok(warns[0].includes("evals/tasks/0004-x.md")); // makeTask 고정 repoPath
});

test("detectUnblockCandidates: blocked 아닌 task·토큰 없는 task 는 대상 아님", () => {
  const tasks = [makeTask({ ...VALID_FM, Status: "todo" })];
  assert.deepEqual(detectUnblockCandidates(tasks), []);
});

test("detectUnblockCandidates: 활성 목록에 없는 id(archive)는 resolved 취급", () => {
  const tasks = [blockedTask("EVAL-0030", "[task:EVAL-0001] — archive 된 선행.")];
  assert.equal(detectUnblockCandidates(tasks).length, 1);
});
```

import에 `detectUnblockCandidates` 추가.

- [ ] **Step 2: 실패 확인**

Run: `pnpm harness:test`
Expected: import 에러 FAIL.

- [ ] **Step 3: 구현** — `harness-lib.mjs`의 `detectStaleStatus` 아래에:

```js
// 해제 후보 advisory (비차단 · spec §C2): blocked task 의 Blocked-by task: 토큰이 전부 done 이고
// 사람-판단 토큰(gate/adr/spec/po)이 하나도 없으면 "todo flip?" 후보로 보고한다.
// 자동 flip 아님 — 해제 결정은 사람/구현 세션 몫. 사람-판단 토큰이 남아 있는 한 후보가 아니다.
export function detectUnblockCandidates(tasks) {
  const statusById = new Map(
    tasks.map((task) => [task.frontmatter.Task?.toUpperCase(), task.frontmatter.Status]),
  );
  return tasks.flatMap((task) => {
    if (task.frontmatter.Status !== "blocked") {
      return [];
    }
    const tokens = parseBlockers(task.frontmatter["Blocked-by"] || "");
    const taskTokens = tokens.filter((token) => token.type === "task");
    if (taskTokens.length === 0 || taskTokens.length !== tokens.length) {
      return [];
    }
    // 활성 목록에 없는 id(archive 은퇴)는 resolved 취급 — 영구 후보 누락 방지. 존재 자체는 Tier 1-A 가 보증.
    const allDone = taskTokens.every((token) => {
      const status = statusById.get(token.value.toUpperCase());
      return status === undefined || status === "done";
    });
    if (!allDone) {
      return [];
    }
    return [
      `${task.repoPath}: blocked 인데 task: blocker 전부 done — Status todo 로 flip? (자동 flip 아님, 해제 결정은 사람 몫)`,
    ];
  });
}
```

`harness-drift.mjs` 배선 — import에 `detectUnblockCandidates` 추가, `warnings` 계산 아래에:

```js
const unblockCandidates = detectUnblockCandidates(tasks);
```

리포트 헤더의 `- Stale-status warnings: ${warnings.length}` 아래에 `- Unblock candidates: ${unblockCandidates.length}` 추가, Checks 목록에 `- (warn) blocked task 의 task: blocker 전부 done — 해제 후보` 추가, Stale Status 섹션 아래에:

```js
if (unblockCandidates.length > 0) {
  console.log(`
## Unblock Candidates (advisory — exit code 비영향)

blocked task 의 Blocked-by task: 토큰이 전부 done — todo flip 검토 대상. gate/adr/spec/po 토큰이 남은 task 는 대상이 아니다(해제 판단이 사람 몫).
`);
  for (const message of unblockCandidates) {
    console.log(`- ${message}`);
  }
}
```

- [ ] **Step 4: 통과 + 실제 repo advisory 1건 확인**

```bash
pnpm harness:test
pnpm harness:drift
```

Expected: 테스트 PASS. drift는 PASS(exit 0)이면서 `Unblock candidates: 1` + `0016-rn-read-model-contract.md ... todo 로 flip?` 1건만 (0017·0018·0019는 선행 미done, 0007·0008·0009·0025·0026은 사람-판단 토큰 잔존 → 침묵).

- [ ] **Step 5: 커밋**

```bash
git add scripts/harness-lib.mjs scripts/harness-lib.spec.mjs scripts/harness-drift.mjs
git commit -m "feat(harness): drift 해제 후보 advisory — task: blocker 전부 done 인 blocked task 보고"
```

---

### Task 7: `pnpm harness:finalize` (scripts/harness-finalize.mjs)

**Files:**

- Create: `scripts/harness-finalize.mjs`
- Modify: `package.json:40` (`harness:goal` 줄 다음)
- Test: `scripts/harness-lib.spec.mjs`

- [ ] **Step 1: 실패하는 테스트 작성** — spec.mjs 끝에 추가 (import는 별도 라인: `import { buildRunSkeleton, entryHasPlaceholder, flipStatusToDone, findUnresolvedTaskBlockers, decideFinalize } from "./harness-finalize.mjs";`):

```js
// ─────────────── harness-finalize (순수 헬퍼 — CLI 는 main guard 로 분리) ───────────────

test("buildRunSkeleton: frontmatter 유래 자동 필드 + <<FILL>> placeholder 3종", () => {
  const task = makeTask({ ...VALID_FM, Task: "EVAL-0030", Track: "port", Kind: "migration" });
  assert.deepEqual(buildRunSkeleton(task, "2026-06-12"), {
    taskId: "EVAL-0030",
    date: "2026-06-12",
    track: "port",
    kind: "migration",
    status: "done",
    summary: "<<FILL>>",
    verification: "<<FILL>>",
    notes: "<<FILL>>",
  });
});

test("entryHasPlaceholder: 중첩 값 포함 <<FILL>> 탐지", () => {
  assert.equal(entryHasPlaceholder({ verification: { local: "<<FILL>>" } }), true);
  assert.equal(entryHasPlaceholder({ summary: "done", verification: { local: {} } }), false);
});

test("flipStatusToDone: frontmatter 블록 안의 Status 줄만 교체 — 본문 Status: 오염 없음", () => {
  const content = "---\nTask: EVAL-0030\nStatus: in_progress\n---\n# 본문\nStatus: pending 표기";
  const flipped = flipStatusToDone(content);
  assert.ok(flipped.includes("\nStatus: done\n"));
  assert.ok(flipped.includes("Status: pending 표기")); // 본문 무변경
});

test("findUnresolvedTaskBlockers: done 아닌 task: 선행만 반환, archive(미등재)·done 은 resolved", () => {
  const statusById = new Map([
    ["EVAL-0015", "done"],
    ["EVAL-0017", "blocked"],
  ]);
  const task = makeTask({
    ...VALID_FM,
    "Blocked-by": "[task:EVAL-0015] [task:EVAL-0017] [task:EVAL-0001] [gate:G2] — 설명.",
  });
  assert.deepEqual(findUnresolvedTaskBlockers(task, statusById), ["EVAL-0017"]);
});

test("findUnresolvedTaskBlockers: Depends-on 은 검사하지 않는다 (soft 순서 의존)", () => {
  const task = makeTask({ ...VALID_FM, "Depends-on": "[task:EVAL-0017] — 순서." });
  assert.deepEqual(findUnresolvedTaskBlockers(task, new Map([["EVAL-0017", "blocked"]])), []);
});

test("decideFinalize: 전제 검사 매트릭스 (spec §C3 step 1)", () => {
  // in_progress → proceed
  assert.equal(
    decideFinalize({ status: "in_progress", entry: undefined, force: false }).action,
    "proceed",
  );
  // done + <<FILL>> entry → resume (--force 불요)
  assert.equal(
    decideFinalize({ status: "done", entry: { summary: "<<FILL>>" }, force: false }).action,
    "resume",
  );
  // done + 완전 entry → verify-only (멱등 no-op)
  assert.equal(
    decideFinalize({ status: "done", entry: { summary: "ok" }, force: false }).action,
    "verify-only",
  );
  // done + entry 없음 → --force 요구
  assert.equal(decideFinalize({ status: "done", entry: undefined, force: false }).action, "refuse");
  assert.equal(decideFinalize({ status: "done", entry: undefined, force: true }).action, "proceed");
  // todo / blocked → --force 요구
  assert.equal(decideFinalize({ status: "todo", entry: undefined, force: false }).action, "refuse");
  assert.equal(
    decideFinalize({ status: "blocked", entry: undefined, force: true }).action,
    "proceed",
  );
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm harness:test`
Expected: FAIL — `Cannot find module './harness-finalize.mjs'`.

- [ ] **Step 3: `scripts/harness-finalize.mjs` 작성** (전체):

```js
#!/usr/bin/env node
// pnpm harness:finalize EVAL-XXXX [--force]
// task 완료 처리 3단계(Status flip → runs[] skeleton append → harness:check)를 한 명령으로 묶는다.
// git 커밋·푸시는 하지 않는다 — 자동 커밋은 사용자 확인 후(AGENTS.md §8).
// spec: docs/superpowers/specs/2026-06-12-harness-finalize-blocked-by-tokens.md §C3
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  loadMigrationTasks,
  loadAgentResults,
  agentResultsPath,
  parseBlockers,
} from "./harness-lib.mjs";

// runs[] skeleton — 내용(summary·verification)은 구현 세션만 쓸 수 있으므로 <<FILL>> 로 형태만 보장.
// verification 은 기존 runs 관례인 { "local": { "<명령>": "<결과>" } } object 로 교체해 채운다.
// notes 는 선택 — 불요 시 채우는 시점에 필드를 삭제한다(잔존 <<FILL>> 은 Tier 1-D 에러).
export function buildRunSkeleton(task, date) {
  return {
    taskId: task.frontmatter.Task,
    date,
    track: task.frontmatter.Track,
    kind: task.frontmatter.Kind,
    status: "done",
    summary: "<<FILL>>",
    verification: "<<FILL>>",
    notes: "<<FILL>>",
  };
}

export function entryHasPlaceholder(entry) {
  return JSON.stringify(entry).includes("<<FILL>>");
}

// frontmatter 블록(첫 --- ~ 다음 ---) 안의 Status 줄만 done 으로 바꾼다 — 본문 "Status:" 오염 방지.
export function flipStatusToDone(content) {
  const lines = content.split("\n");
  if (lines[0].replace(/^\uFEFF/, "") !== "---") {
    return content;
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      break;
    }
    if (/^Status:/.test(lines[index])) {
      lines[index] = "Status: done";
      break;
    }
  }
  return lines.join("\n");
}

// Blocked-by 의 done 아닌 task: 선행 — --force 로도 우회 불가 (spec §C3).
// Depends-on 은 검사하지 않는다(soft 순서 의존 — blocked 의미가 아니므로).
// 활성 목록에 없는 id(archive 은퇴)는 resolved 취급 — 우회 불가 거부가 영구 차단이 되지 않게.
export function findUnresolvedTaskBlockers(task, statusById) {
  return parseBlockers(task.frontmatter["Blocked-by"] || "")
    .filter((token) => token.type === "task")
    .filter((token) => {
      const status = statusById.get(token.value.toUpperCase());
      return status !== undefined && status !== "done";
    })
    .map((token) => token.value);
}

// 전제 검사 (spec §C3 step 1):
// in_progress → proceed / done+<<FILL>> entry → resume(채움 검증 재실행, --force 불요)
// done+완전 entry → verify-only(멱등 — 변경 없이 검증만) / done+entry 없음·todo·blocked → --force 요구.
export function decideFinalize({ status, entry, force }) {
  if (status === "in_progress") {
    return { action: "proceed" };
  }
  if (status === "done") {
    if (!entry) {
      return force
        ? { action: "proceed" }
        : {
            action: "refuse",
            reason: "Status done 인데 runs[] entry 없음 — skeleton append 는 --force 필요",
          };
    }
    return entryHasPlaceholder(entry) ? { action: "resume" } : { action: "verify-only" };
  }
  return force
    ? { action: "proceed" }
    : { action: "refuse", reason: `Status '${status}' — in_progress 가 아니면 --force 필요` };
}

function findRunEntry(results, normalizedId) {
  return (results.runs ?? []).find(
    (run) => typeof run.taskId === "string" && run.taskId.toUpperCase() === normalizedId,
  );
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const rawId = args.find((arg) => !arg.startsWith("--"));
  if (!rawId) {
    console.error("usage: pnpm harness:finalize EVAL-XXXX [--force]");
    process.exit(1);
  }

  const tasks = loadMigrationTasks();
  const id = rawId.trim().toUpperCase();
  const task = tasks.find((t) => t.frontmatter.Task?.toUpperCase() === id);
  if (!task) {
    console.error(`[finalize] task not found in evals/tasks/: ${rawId}`);
    process.exit(1);
  }

  const results = loadAgentResults();
  const entry = findRunEntry(results, id);
  const decision = decideFinalize({ status: task.frontmatter.Status, entry, force });

  if (decision.action === "refuse") {
    console.error(`[finalize] 거부 — ${decision.reason}`);
    process.exit(1);
  }

  if (decision.action === "proceed") {
    // 미해소 task: 선행 거부는 --force 로도 우회 불가 (Status 검사만 우회 대상).
    const statusById = new Map(
      tasks.map((t) => [t.frontmatter.Task?.toUpperCase(), t.frontmatter.Status]),
    );
    const unresolved = findUnresolvedTaskBlockers(task, statusById);
    if (unresolved.length > 0) {
      console.error(
        `[finalize] 거부 — Blocked-by 미해소 task: 선행 ${unresolved.join(", ")} (done 아님) — --force 로도 우회 불가`,
      );
      process.exit(1);
    }
    if (task.frontmatter.Status !== "done") {
      writeFileSync(task.absolutePath, flipStatusToDone(task.content));
      console.error(`[finalize] Status → done: ${task.repoPath}`);
    }
    if (!entry) {
      const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD (로컬 날짜)
      results.runs = [...(results.runs ?? []), buildRunSkeleton(task, today)];
      writeFileSync(agentResultsPath, `${JSON.stringify(results, null, 2)}\n`);
      console.error(`[finalize] runs[] skeleton append: ${id} (summary·verification 은 <<FILL>>)`);
    } else {
      console.error(`[finalize] runs[] entry 기존재 — append skip`);
    }
  } else {
    console.error(`[finalize] ${decision.action} — 파일 변경 없음, 검증만 수행`);
  }

  // step 4 — 검증. 영속 게이트는 Tier 1-D(placeholder = check 에러)가 담당, 이 exit 1 은 채움 루프 유도.
  const check = spawnSync("node", ["scripts/harness-check.mjs"], { stdio: "inherit" });
  const after = findRunEntry(loadAgentResults(), id);
  if (after && entryHasPlaceholder(after)) {
    console.error(
      `[finalize] runs[] entry 에 <<FILL>> 잔존 — evals/results/agent-results.json 의 summary·verification 을 채우고(notes 불요 시 필드 삭제) pnpm harness:finalize ${id} 를 재실행하라`,
    );
    process.exit(1);
  }
  process.exit(check.status ?? 1);
}

// node --test 가 import 할 때 main 이 돌지 않게 직접 실행시에만 구동.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

`package.json`의 `"harness:goal"` 줄 다음에 추가:

```json
    "harness:finalize": "node scripts/harness-finalize.mjs",
```

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `pnpm harness:test`
Expected: PASS.

- [ ] **Step 5: 비파괴 CLI 스모크** (파일 무변경 경로 3종):

```bash
pnpm harness:finalize EVAL-0013; echo "exit=$?"   # todo → 거부 + exit 1 (--force 안내)
pnpm harness:finalize EVAL-0011; echo "exit=$?"   # done + entry 없음(grandfathered) → 거부 + exit 1
pnpm harness:finalize EVAL-0014; echo "exit=$?"   # done + 완전 entry → verify-only · check PASS · exit 0 (멱등)
git status --short                                  # 변경 없음 확인
```

- [ ] **Step 6: 변이 스모크 + 원복** (todo task 강제 finalize → placeholder 루프 확인):

```bash
pnpm harness:finalize EVAL-0013 --force; echo "exit=$?"
# 기대: Status→done flip + skeleton append + harness:check FAIL(<<FILL>> 에러) + 채움 안내 + exit 1
git diff --stat                       # 0013 task + agent-results.json 2개 파일만 변경 확인
git checkout -- evals/                # 스모크 원복
git status --short                    # clean 확인
```

- [ ] **Step 7: 커밋**

```bash
git add scripts/harness-finalize.mjs scripts/harness-lib.spec.mjs package.json
git commit -m "feat(harness): pnpm harness:finalize — Status flip·runs skeleton append·check 일괄 명령"
```

---

### Task 8: append-only 예외 문구 + 템플릿/워크플로 문서

**Files:**

- Modify: `evals/results/agent-results.json:3` (description만 — runs[]·tasks[] 무접촉)
- Modify: `.agents/backlog/AGENT_TASK_TEMPLATE.md:7`
- Modify: `.agents/workflows/create-agent-tasks.md:22` (step 4)
- Modify: `.agents/workflows/implement-agent-task.md:23` (step 6)

- [ ] **Step 1: agent-results.json description 교체**

```
old: "description": "with-key agent eval baseline — append-only. 새 run은 runs[] 끝에만 추가, 기존 항목 수정 금지.",
new: "description": "with-key agent eval baseline — append-only. 새 run은 runs[] 끝에만 추가, 기존 항목 수정 금지. 단 harness:finalize 가 만든 skeleton 의 <<FILL>> placeholder 는 같은 PR 안(머지 전)에서 채우는 것만 허용.",
```

- [ ] **Step 2: AGENT_TASK_TEMPLATE.md 7행 교체** (Blocked-by 1줄 → 2줄):

```
old: Blocked-by: <해제조건, 예: G1-PoC θ 확정>   # blocked 일 때만
new: Blocked-by: [task:EVAL-XXXX] [gate:G2] — <사람용 해제조건 설명>   # blocked 일 때만. — 왼쪽 [type:value] 토큰 ≥1, 타입 5종: task|gate|adr|spec|po
new: Depends-on: [task:EVAL-XXXX] — <intra-feature 순서 설명>   # 선택. 게이트 아님(Status todo 가능) — 순서 의존만
```

- [ ] **Step 3: create-agent-tasks.md step 4 교체**

```
old: 4. greenfield θ/G2 의존 AT는 Status: blocked + Blocked-by 명시(D12).
new: 4. greenfield θ/G2 의존 AT는 Status: blocked + Blocked-by 명시(D12). Blocked-by·Depends-on 은 토큰 문법 — `[type:value] … — 자유 문장`(— 왼쪽 토큰만 기계가 읽음 · 타입 5종 task|gate|adr|spec|po · 키가 있으면 토큰 ≥1, `pnpm harness:check` 강제). 하드 게이트는 Blocked-by(Status blocked 동반), intra-feature 순서는 Depends-on(Status todo 가능 — 게이트로 표기하면 착수 가능한 일이 blocked 로 보인다). 첫 task: 토큰이 `harness:goal` worktree base 선행이 된다.
```

- [ ] **Step 4: implement-agent-task.md step 6 교체**

```
old: 6. AC green 확정 → 대상 AT의 `Status: in_progress → done` 갱신, 같은 WP 브랜치에 커밋(PR 에 포함). 머지 후 별도 편집 금지 — status drift 원천 차단(PR 템플릿 Verification 정렬, 누락 시 `pnpm harness:drift` 가 경고).
new: 6. AC green 확정 → `pnpm harness:finalize <EVAL-ID>` 실행 — Status done flip + runs[] skeleton append + `pnpm harness:check` 를 한 명령으로 처리한다. placeholder 안내(exit 1)가 나오면 `evals/results/agent-results.json` 의 `summary`·`verification`(기존 관례 `{ "local": { "<명령>": "<결과>" } }`)을 채우고 `notes` 불요 시 필드를 삭제한 뒤 같은 명령을 재실행해 exit 0 을 확인한다. 결과는 같은 WP 브랜치에 커밋(PR 에 포함). 머지 후 별도 편집 금지 — status drift 원천 차단(PR 템플릿 Verification 정렬, 누락 시 `pnpm harness:drift` 가 경고).
```

- [ ] **Step 5: 검증**

```bash
pnpm harness:check && pnpm validate:docs
node -e "JSON.parse(require('fs').readFileSync('evals/results/agent-results.json','utf8')); console.log('json ok')"
```

Expected: 전부 PASS / `json ok`.

- [ ] **Step 6: 커밋**

```bash
git add evals/results/agent-results.json .agents/backlog/AGENT_TASK_TEMPLATE.md .agents/workflows/create-agent-tasks.md .agents/workflows/implement-agent-task.md
git commit -m "docs(agents): Blocked-by 토큰 문법 명세 + implement step 6 finalize 치환 + append-only 예외 문구"
```

---

### Task 9: 최종 일괄 검증 + 종료 보고

- [ ] **Step 1: 전체 게이트**

```bash
pnpm harness:verify     # typecheck + lint + test + harness:check + harness:test
pnpm harness:drift      # PASS + Unblock candidates: 1 (0016)
pnpm validate:docs
```

Expected: 전부 green. harness:verify의 typecheck/lint/test는 src/ 무접촉이라 기존과 동일해야 한다.

- [ ] **Step 2: 한국어 작업 종료 보고** (AGENTS.md §9 형식 — 명세 요약·구현 내역·변경 파일·영향 범위·검증 결과·커밋·미해결).

- [ ] **Step 3: 사용자 확인 후 push + PR** (베이스 `develop`, spec 브랜치 미머지 상태면 spec 커밋 3개가 함께 포함됨을 PR 본문에 명시. 롤백: merge commit 1개 `git revert -m 1`).

---

## 검증 (요약)

```bash
pnpm harness:test      # parseBlockers · validateTask · finalize 단위 테스트
pnpm harness:check     # 마이그레이션된 13개 task 포함 0 violations
pnpm harness:drift     # 해제 후보 advisory — 0016 정확히 1건
pnpm harness:verify    # typecheck + lint + test + check + harness:test 일괄
pnpm validate:docs     # .agents 문서 링크
```

수동 확인: Task 7 Step 5(비파괴 스모크 3종) · Step 6(변이 스모크 + 원복). 모바일 viewport — 해당 없음(server-only 하네스 스크립트).

## 리스크 / 미해결

- **goal 프롬프트 4000자**: 0009·0026이 ADR/spec 게이트 문단을 새로 얻어 렌더 길이가 ~250자 늘어난다. Tier 1-C가 초과를 잡으면 게이트 문구(또는 해당 task Blocked-by prose)를 줄인다 — task 본문 분할은 불요.
- **spec 브랜치 의존**: 이 브랜치는 `chore/spec-harness-finalize-blocked-by` 위에 쌓인다. spec PR이 먼저 머지되면 rebase로 정리.
- **`.claude/commands/implement-agent-task.md` 래퍼는 존재하지 않음**(확인 완료 — `implement-plan.md`만 존재) — 워크플로 문서 외 추가 동기화 불요.
