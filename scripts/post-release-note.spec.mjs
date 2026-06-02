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
