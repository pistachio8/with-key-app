// scripts/post-release-note.mjs
// 릴리즈 노트 문서의 사용자 공지 본문을 Slack Incoming Webhook 으로 발송한다.
// 의존성: dotenv (기존 스크립트 관례). Node 20 global fetch 사용.
//
// 사용법:
//   pnpm release:notify docs/release-notes/2026-05-28.md            # 실제 발송
//   pnpm release:notify docs/release-notes/2026-05-28.md --dry-run  # 페이로드만 출력
// 웹훅 URL: .env.local 의 SLACK_RELEASE_WEBHOOK_URL.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// 모노레포: 루트(cwd)에서 실행되며 env 는 apps/web 으로 이동했다(EVAL-0010).
config({ path: "apps/web/.env.local", quiet: true });

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
