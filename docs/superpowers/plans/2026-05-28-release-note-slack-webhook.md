# 릴리즈 노트 Slack 웹훅 발송 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/release-note`가 생성한 사용자 공지를, 같은 흐름의 마지막 단계에서 Slack 특정 채널로 발송한다(수동 트리거 + dry-run + 중복 방지 마커).

**Architecture:** 의존성 최소 Node 스크립트(`scripts/post-release-note.mjs`)가 발송 엔진 — 문서의 `---` 아래 공지 본문만 추출 → Slack mrkdwn 변환 → Incoming Webhook POST. 순수 함수는 분리해 `node:test`로 단위 검증. `/release-note` 커맨드가 확인 게이트를 거쳐 이 스크립트를 호출. 스케줄 자동화는 범위 외.

**Tech Stack:** Node 20(`>=20 <21`, global `fetch`), ESM `.mjs`, `dotenv`(기존 스크립트 관례), `node:test` + `node:assert/strict`, pnpm 10.

**Spec:** [`docs/superpowers/specs/2026-05-28-release-note-slack-webhook-design.md`](../specs/2026-05-28-release-note-slack-webhook-design.md)

> **커밋 정책(사용자 지정):** 작업 중 중간 커밋을 만들지 않는다. **Task 6에서 단 한 번** 스펙·플랜·구현을 묶어 커밋한다.

---

## File Structure

| 파일                                 | 역할                                                                         | 신규/수정 |
| ------------------------------------ | ---------------------------------------------------------------------------- | --------- |
| `scripts/post-release-note.mjs`      | 발송 엔진: 본문 추출·mrkdwn 변환·payload 빌드·POST·dry-run. 순수 함수 export | 신규      |
| `scripts/post-release-note.spec.mjs` | 순수 함수 `node:test` 단위 테스트                                            | 신규      |
| `package.json`                       | `release:notify` 스크립트 alias                                              | 수정      |
| `.env.example`                       | `SLACK_RELEASE_WEBHOOK_URL` 섹션                                             | 수정      |
| `.claude/commands/release-note.md`   | 절차에 "Slack 발송" 단계 통합                                                | 수정      |
| `docs/release-notes/TEMPLATE.md`     | `slack-sent` 마커 안내 1줄                                                   | 수정      |

검증 메모: `pnpm test`는 `vitest --project unit`이며 include가 `src/**`·`tests/unit/**`의 `.ts/.tsx`뿐이라 `scripts/*.mjs`를 잡지 않는다. 따라서 스크립트 테스트는 `node --test`로 실행한다. env는 기존 스크립트(`dev-login-link.mjs`)와 동일하게 `dotenv`의 `config({ path: ".env.local" })`로 로드한다.

---

## Task 1: 순수 함수 (extractAnnouncement · toSlackMrkdwn · buildPayload)

**Files:**

- Create: `scripts/post-release-note.spec.mjs`
- Create: `scripts/post-release-note.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `scripts/post-release-note.spec.mjs`:

```js
// scripts/post-release-note.spec.mjs
// 실행: node --test scripts/post-release-note.spec.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAnnouncement, toSlackMrkdwn, buildPayload } from "./post-release-note.mjs";

test("extractAnnouncement: '---' 위 메타 제거하고 본문만 반환", () => {
  const md = ["# title", "> 대상 PR: #1", "", "---", "", "📢 공지", "- 항목"].join("\n");
  assert.equal(extractAnnouncement(md), "📢 공지\n- 항목");
});

test("extractAnnouncement: '---' 여러 개여도 첫 구분선 기준", () => {
  assert.equal(extractAnnouncement("meta\n---\nbody1\n---\nbody2"), "body1\n---\nbody2");
});

test("extractAnnouncement: '---' 없으면 전체를 trim", () => {
  assert.equal(extractAnnouncement("\n본문만\n"), "본문만");
});

test("toSlackMrkdwn: **굵게** → *굵게*, 불릿·이모지 보존", () => {
  assert.equal(toSlackMrkdwn("- **새 기능** ✨"), "- *새 기능* ✨");
});

test("buildPayload: 짧은 본문 → 단일 section + text 폴백", () => {
  const p = buildPayload("hi");
  assert.equal(p.text, "hi");
  assert.equal(p.blocks.length, 1);
  assert.equal(p.blocks[0].type, "section");
  assert.equal(p.blocks[0].text.type, "mrkdwn");
  assert.equal(p.blocks[0].text.text, "hi");
});

test("buildPayload: 3000자 초과 → 빈 줄 기준 다중 section", () => {
  const para = "x".repeat(2000);
  const p = buildPayload(`${para}\n\n${para}`);
  assert.ok(p.blocks.length >= 2);
  for (const b of p.blocks) assert.ok(b.text.text.length <= 2900);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test scripts/post-release-note.spec.mjs`
Expected: FAIL — `Cannot find module '.../scripts/post-release-note.mjs'` (아직 구현 파일 없음)

- [ ] **Step 3: 순수 함수만 최소 구현**

Create `scripts/post-release-note.mjs` (이 Task에서는 순수 함수 + export만; CLI는 Task 2):

```js
// scripts/post-release-note.mjs
// 릴리즈 노트 문서의 사용자 공지 본문을 Slack Incoming Webhook 으로 발송한다.
// 의존성: dotenv (기존 스크립트 관례). Node 20 global fetch 사용.
//
// 사용법:
//   pnpm release:notify docs/release-notes/2026-05-28.md            # 실제 발송
//   pnpm release:notify docs/release-notes/2026-05-28.md --dry-run  # 페이로드만 출력
// 웹훅 URL: .env.local 의 SLACK_RELEASE_WEBHOOK_URL.

const SLACK_SECTION_LIMIT = 2900; // Slack section text 3000 제한 + 버퍼

// '---' 단독 줄 기준으로 잘라 그 아래(사용자 공지 본문)만 반환.
// '---' 가 없으면 전체를 본문으로 본다(방어적).
export function extractAnnouncement(md) {
  const lines = md.split("\n");
  const idx = lines.findIndex((l) => l.trim() === "---");
  const body = idx === -1 ? md : lines.slice(idx + 1).join("\n");
  return body.trim();
}

// 표준 마크다운 → Slack mrkdwn 최소 변환: **굵게** → *굵게*.
export function toSlackMrkdwn(s) {
  return s.replace(/\*\*(.+?)\*\*/g, "*$1*");
}

// 3000자 제한 → 길면 빈 줄(문단) 기준으로 여러 section 으로 분할.
export function buildPayload(text) {
  const chunks = [];
  if (text.length <= SLACK_SECTION_LIMIT) {
    chunks.push(text);
  } else {
    let cur = "";
    for (const para of text.split(/\n{2,}/)) {
      const candidate = cur ? `${cur}\n\n${para}` : para;
      if (candidate.length > SLACK_SECTION_LIMIT && cur) {
        chunks.push(cur);
        cur = para;
      } else {
        cur = candidate;
      }
    }
    if (cur) chunks.push(cur);
  }
  return {
    text,
    blocks: chunks.map((c) => ({ type: "section", text: { type: "mrkdwn", text: c } })),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test scripts/post-release-note.spec.mjs`
Expected: PASS — `# pass 6`, `# fail 0`

---

## Task 2: CLI 래퍼 (인자 파싱 · env · dry-run · POST · exit 코드)

**Files:**

- Modify: `scripts/post-release-note.mjs` (Task 1 파일 상단에 import, 하단에 CLI 추가)

- [ ] **Step 1: import 추가 (파일 최상단)**

`scripts/post-release-note.mjs` 맨 위(주석 다음, `const SLACK_SECTION_LIMIT` 앞)에 추가:

```js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: ".env.local" });
```

- [ ] **Step 2: CLI main + 진입 가드 추가 (파일 맨 끝)**

`scripts/post-release-note.mjs` 맨 끝(`buildPayload` 정의 다음)에 추가:

```js
function maskUrl(url) {
  return url.replace(/\/[^/]+$/, "/****");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error("Usage: pnpm release:notify <path-to-md> [--dry-run]");
    process.exit(1);
  }

  let md;
  try {
    md = readFileSync(filePath, "utf8");
  } catch {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const body = toSlackMrkdwn(extractAnnouncement(md));
  if (!body) {
    console.error(`No announcement body below '---' in ${filePath}`);
    process.exit(1);
  }
  const payload = buildPayload(body);
  const webhook = process.env.SLACK_RELEASE_WEBHOOK_URL;

  if (dryRun) {
    console.log(
      "[dry-run] target:",
      webhook ? maskUrl(webhook) : "(SLACK_RELEASE_WEBHOOK_URL unset)",
    );
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }

  if (!webhook) {
    console.error("Missing SLACK_RELEASE_WEBHOOK_URL (set it in .env.local).");
    process.exit(1);
  }

  let res;
  try {
    res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`Slack POST failed: ${err.message}`);
    process.exit(2);
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    console.error(`Slack returned ${res.status}: ${text}`);
    process.exit(2);
  }
  console.log(`Sent to Slack (${res.status}).`);
}

// 직접 실행될 때만 main() — 테스트가 import 할 때는 실행하지 않는다.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 3: 순수 함수 회귀 없음 확인**

Run: `node --test scripts/post-release-note.spec.mjs`
Expected: PASS — `# pass 6`, `# fail 0` (CLI 추가가 export 를 깨지 않음)

- [ ] **Step 4: dry-run 동작 확인 (실제 발송 없음)**

Run: `node scripts/post-release-note.mjs docs/release-notes/2026-05-28.md --dry-run`
Expected: `[dry-run] target: (SLACK_RELEASE_WEBHOOK_URL unset)` (또는 .env.local 에 값이 있으면 마스킹된 URL) + payload JSON 출력. `blocks[0].text.text` 가 `📢 with-key 업데이트 (5/28)` 로 시작하고 `---` 위 메타가 없어야 함. exit 0.

- [ ] **Step 5: 미설정 시 발송 거부 확인**

Run: `env -u SLACK_RELEASE_WEBHOOK_URL node scripts/post-release-note.mjs docs/release-notes/2026-05-28.md`
Expected: `Missing SLACK_RELEASE_WEBHOOK_URL (set it in .env.local).`, exit 1. (확인: `echo $?` → 1)

> 주의: `.env.local` 에 `SLACK_RELEASE_WEBHOOK_URL` 이 이미 있으면 dotenv 가 로드해 이 테스트가 무효. 그 경우 `.env.local` 값을 임시로 비우거나, 값이 없는 상태에서 검증.

- [ ] **Step 6: 인자 누락 확인**

Run: `node scripts/post-release-note.mjs`
Expected: `Usage: pnpm release:notify <path-to-md> [--dry-run]`, exit 1.

---

## Task 3: package.json alias + .env.example

**Files:**

- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: `release:notify` 스크립트 추가**

`package.json` `scripts` 블록에서 `"seed:action-log": "node scripts/dev-seed-action-log.mjs",` 다음 줄에 추가:

```json
    "release:notify": "node scripts/post-release-note.mjs",
```

- [ ] **Step 2: alias 동작 확인**

Run: `pnpm release:notify docs/release-notes/2026-05-28.md --dry-run`
Expected: Task 2 Step 4 와 동일한 dry-run 출력, exit 0.

- [ ] **Step 3: `.env.example` 섹션 추가**

`.env.example` 의 `# --- Web Push (VAPID) ---` 섹션 바로 위(또는 `# --- Cron (Vercel) ---` 위)에 추가:

```bash
# --- Slack (릴리즈 노트 공지) ---
# /release-note 가 사용자 업데이트 공지를 발송하는 Slack Incoming Webhook URL.
# 사용자 대상 채널 전용 — 개발자 push 알림용 SLACK_DEVELOP_WEBHOOK_URL 과 분리한다.
# 서버/로컬 전용 — NEXT_PUBLIC_ 접두 금지(웹훅 URL 자체가 발송 권한).
# 로컬 수동 발송은 .env.local 에 둔다. (스케줄 자동화는 현재 범위 외)
SLACK_RELEASE_WEBHOOK_URL=
```

- [ ] **Step 4: 형식 확인**

Run: `grep -n "SLACK_RELEASE_WEBHOOK_URL" .env.example`
Expected: 한 줄(`SLACK_RELEASE_WEBHOOK_URL=`)이 매칭됨.

---

## Task 4: `/release-note` 커맨드 발송 단계 + 템플릿 마커 안내

**Files:**

- Modify: `.claude/commands/release-note.md`
- Modify: `docs/release-notes/TEMPLATE.md`

- [ ] **Step 1: 절차에 "Slack 발송" 단계 추가**

`.claude/commands/release-note.md` 의 `## 절차` 마지막 항목(`6. **저장** — ...`) 다음에 추가:

```markdown
7. **Slack 발송** — 생성·커밋 후:
   1. 대상 파일에 `<!-- slack-sent: ... -->` 마커가 있으면 "이미 발송됨 — 재발송할까요?"로 한 번 더 확인.
   2. `pnpm release:notify <파일> --dry-run` 으로 페이로드 미리보기를 사용자에게 보여준다.
   3. "#채널로 발송할까요?" 확인 게이트 — 승인 시에만 진행. **왜**: 공유 채널·사용자 대상 발송은 되돌리기 어려운 가시적 행동.
   4. 승인 시 `pnpm release:notify <파일>` 실행. 성공하면 파일 상단 메타(`---` 위)에 `<!-- slack-sent: <ISO8601> -->` 한 줄을 추가하고 그 변경을 커밋한다.
   5. `SLACK_RELEASE_WEBHOOK_URL` 미설정이면 발송만 스킵하고 "`.env.local` 에 SLACK_RELEASE_WEBHOOK_URL 설정 필요"를 보고(문서는 이미 생성·커밋됨).
```

- [ ] **Step 2: 금지 항목 추가**

같은 파일 `## 금지` 섹션 끝에 추가:

```markdown
- 확인 게이트 없이 자동 발송 금지.
- `---` 위 개발자 메타를 발송 본문에 포함 금지(스크립트가 자동 제외하지만, 커맨드도 본문만 다룬다).
```

- [ ] **Step 3: 보고 형식 추가**

같은 파일 `## 보고 형식` 목록 끝에 추가:

```markdown
- Slack 발송 결과(전송 / 스킵 / 실패)와 `slack-sent` 마커 추가 여부
```

- [ ] **Step 4: 템플릿에 마커 안내 1줄**

`docs/release-notes/TEMPLATE.md` 상단 주석 블록의 ``- 작성 규칙은 `.claude/commands/release-note.md` 참조.`` 줄 앞에 추가:

```markdown
- Slack 발송에 성공하면 커맨드가 상단 메타에 `<!-- slack-sent: <ISO8601> -->` 마커를 추가합니다(중복 발송 방지).
```

- [ ] **Step 5: 문서 링크 검증**

Run: `pnpm validate:docs`
Expected: `OK: no broken references`

---

## Task 5: 전체 검증

**Files:** (변경 없음 — 게이트 실행만)

- [ ] **Step 1: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 0 (`.mjs` 스크립트는 `tsc` 대상 아님 — 회귀만 확인).

- [ ] **Step 2: 린트**

Run: `pnpm lint`
Expected: 에러 0. (실패 시 `pnpm eslint --fix scripts/post-release-note.mjs scripts/post-release-note.spec.mjs`)

- [ ] **Step 3: vitest 단위 (회귀)**

Run: `pnpm test`
Expected: 기존 스위트 PASS (신규 스크립트는 미포함이 정상).

- [ ] **Step 4: 스크립트 단위 (node:test)**

Run: `node --test scripts/post-release-note.spec.mjs`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: 문서 검증**

Run: `pnpm validate:docs`
Expected: `OK: no broken references`.

- [ ] **Step 6: dry-run 최종 미리보기**

Run: `pnpm release:notify docs/release-notes/2026-05-28.md --dry-run`
Expected: payload 의 `blocks[0].text.text` 가 `📢 with-key 업데이트 (5/28)` 로 시작, `대상 PR` 메타 미포함, exit 0.

---

## Task 6: 단일 커밋 (스펙 + 플랜 + 구현)

> 사용자 지정: 중간 커밋 없이 여기서 한 번만 커밋. git 계정 `pistachio8`. 커밋 전 사용자에게 최종 확인을 받는다(프로젝트 가드레일).

**Files:** (커밋만)

- [ ] **Step 1: 상태 확인**

Run: `git status`
Expected: 아래 파일들이 staged 전(untracked/modified)으로 보임 —
`scripts/post-release-note.mjs`, `scripts/post-release-note.spec.mjs`, `package.json`, `.env.example`, `.claude/commands/release-note.md`, `docs/release-notes/TEMPLATE.md`, `docs/release-notes/2026-05-28.md`, `docs/README.md`, `docs/superpowers/specs/2026-05-28-release-note-slack-webhook-design.md`, `docs/superpowers/plans/2026-05-28-release-note-slack-webhook.md`.

> `.claude/commands/release-note.md` 가 `git status`에 안 보이면 `.gitignore` 대상일 수 있음 — `git check-ignore .claude/commands/release-note.md`로 확인 후 사용자에게 보고.

- [ ] **Step 2: 명시적 staging (와일드카드 금지)**

```bash
git add \
  scripts/post-release-note.mjs \
  scripts/post-release-note.spec.mjs \
  package.json \
  .env.example \
  .claude/commands/release-note.md \
  docs/release-notes/TEMPLATE.md \
  docs/release-notes/2026-05-28.md \
  docs/README.md \
  docs/superpowers/specs/2026-05-28-release-note-slack-webhook-design.md \
  docs/superpowers/plans/2026-05-28-release-note-slack-webhook.md
```

- [ ] **Step 3: 커밋**

```bash
git commit -m "$(cat <<'EOF'
feat(tooling): /release-note Slack 웹훅 발송 + 릴리즈 노트 커맨드/템플릿 추가

PR 범위에서 사용자 공지를 생성(/release-note)하고, 같은 흐름 마지막에
scripts/post-release-note.mjs 로 Slack 채널에 발송(dry-run·중복 마커·확인 게이트).
스케줄 자동화는 범위 외, catch-up 은 "마지막 노트 이후" 윈도로 처리.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: 커밋 확인**

Run: `git status`
Expected: working tree clean (또는 의도한 파일만 정리됨).

---

## Self-Review (작성자 점검 완료)

- **Spec coverage**: 발송 엔진(C1)→Task 1·2 / 커맨드 통합(C2)→Task 4 / 전용 시크릿→Task 3 / 단일 mrkdwn section·3000자 분할→Task 1 / 중복 마커→Task 4 / dry-run→Task 2 / catch-up→커맨드 기존 동작(변경 없음, Task 4 문맥) / 단일 커밋→Task 6. 누락 없음.
- **Placeholder scan**: 모든 코드 step 에 실제 코드/명령/기대 출력 포함. TBD/TODO 없음.
- **Type consistency**: `extractAnnouncement`·`toSlackMrkdwn`·`buildPayload` 시그니처가 Task 1 정의 ↔ Task 2 사용 ↔ spec 일치. payload 모양(`{text, blocks:[{type:"section",...}]}`)이 테스트·CLI·spec 동일.
- **알려진 한계**: vitest 게이트(`pnpm test`)에는 스크립트 테스트가 포함되지 않음 → `node --test`로 별도 실행(Task 5 Step 4). CI 자동화는 범위 외.
