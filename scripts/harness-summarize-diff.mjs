#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function parseStatusLine(line) {
  const status = line.slice(0, 2).trim() || "??";
  const file = line.slice(3).trim();
  return { status, file };
}

const statusOutput = git(["status", "--short"]);
const changedFiles = statusOutput
  ? statusOutput.split(/\r?\n/).filter(Boolean).map(parseStatusLine)
  : [];

const diffStat = git(["diff", "--stat", "--", "."]);
const stagedDiffStat = git(["diff", "--cached", "--stat", "--", "."]);

console.log(`# Harness Diff Summary

## Changed Files
`);

if (changedFiles.length === 0) {
  console.log("No working tree changes.");
} else {
  for (const item of changedFiles) {
    console.log(`- ${item.status} ${item.file}`);
  }
}

console.log(`
## Diff Stat

\`\`\`text
${diffStat || "(no unstaged diff)"}
\`\`\`

## Staged Diff Stat

\`\`\`text
${stagedDiffStat || "(no staged diff)"}
\`\`\`

## Harness Impact Check

1. Did this task introduce a new folder structure?
2. Did this task introduce a new naming convention?
3. Did this task introduce a new dependency?
4. Did this task change verification commands?
5. Did this task reveal that the current harness instructions are outdated?
6. Should any .agents document be updated?
`);
