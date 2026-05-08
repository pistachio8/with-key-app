#!/usr/bin/env node
// 컨텍스트 문서가 가리키는 파일 경로가 실제 존재하는지 검증.
// CI / pre-push 시점에 stale reference 를 차단해 E1(참조 정확도) 회귀를 방지한다.
//
// 검사 대상: 레포 전체에서 파일명이 정확히 다음인 것만
//   - CLAUDE.md, AGENTS.md, README.md
//   (시점 동결된 plan / journal 같은 임의 .md 는 의도적으로 제외)
//
// 인식하는 참조 패턴:
//   1) @import:        ^@<path>$
//   2) markdown link:  [text](<path>)
//   3) backtick span:  `<path>`  (path 에 / 포함하고 알려진 확장자)
//
// 제외 규칙:
//   - http(s):// · mailto: · #anchor 만의 참조
//   - 글롭/와일드카드: * 또는 < > { } 포함
//   - 라인 번호 suffix(:42) · 쿼리/프래그먼트는 제거 후 검증

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const CONTEXT_NAMES = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git', '.turbo']);

const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
const ATIMPORT_RE = /^@([A-Za-z0-9_\-./]+\.[A-Za-z]+)\s*$/gm;
const KNOWN_EXT = '(?:md|mdx|ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|sql|sh|env|toml|css)';
const BACKTICK_PATH_RE = new RegExp('`([A-Za-z0-9_./\\-]+\\.' + KNOWN_EXT + ')`', 'g');

function isExternal(p) {
  return /^[a-z][a-z0-9+.\-]*:\/\//i.test(p) || p.startsWith('mailto:') || p.startsWith('#');
}

function isTemplate(p) {
  return p.includes('*') || p.includes('<') || p.includes('>') || p.includes('{') || p.includes('}');
}

function stripFragment(p) {
  return p.replace(/[?#].*$/, '').replace(/:\d+(:\d+)?$/, '').trim();
}

const ignoreCache = new Map();
function isGitIgnored(absPath) {
  if (ignoreCache.has(absPath)) return ignoreCache.get(absPath);
  let result = false;
  try {
    execFileSync('git', ['check-ignore', '-q', '--', absPath], { cwd: ROOT, stdio: 'pipe' });
    result = true; // exit 0 = ignored
  } catch {
    result = false; // exit non-zero = not ignored
  }
  ignoreCache.set(absPath, result);
  return result;
}

function refResolves(fromFile, ref, kind) {
  // 가능한 resolve 후보 수집 (절대/상대/file-relative/repo-root 컨벤션 모두 시도)
  const candidates = [];
  if (ref.startsWith('/')) {
    candidates.push(join(ROOT, ref.slice(1)));
  } else if (ref.startsWith('./') || ref.startsWith('../') || kind === 'mdlink') {
    candidates.push(resolve(dirname(fromFile), ref));
  } else {
    // backtick / @import: repo root 우선 + 파일 상대 fallback
    candidates.push(join(ROOT, ref));
    candidates.push(resolve(dirname(fromFile), ref));
  }
  // 1) 실제 존재
  for (const p of candidates) if (existsSync(p)) return true;
  // 2) 의도적으로 gitignored 된 path (예: .claude/AGENTS.md, docs/JOURNAL.md) 는 broken 아님
  for (const p of candidates) if (isGitIgnored(p)) return true;
  return false;
}

async function collectContextFiles(dir, out) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await collectContextFiles(p, out);
    } else if (e.isFile() && CONTEXT_NAMES.has(e.name)) {
      out.push(p);
    }
  }
}

function relRoot(p) {
  return p.startsWith(ROOT + '/') ? p.slice(ROOT.length + 1) : p;
}

async function main() {
  const files = [];
  await collectContextFiles(ROOT, files);
  files.sort();

  const broken = [];
  let totalRefs = 0;

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const candidates = []; // { ref, kind }
    const seen = new Set();
    function add(ref, kind) {
      const key = `${kind}|${ref}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ ref, kind });
    }

    for (const m of text.matchAll(MD_LINK_RE)) {
      if (!isExternal(m[1])) add(m[1], 'mdlink');
    }
    for (const m of text.matchAll(ATIMPORT_RE)) {
      add(m[1], 'atimport');
    }
    for (const m of text.matchAll(BACKTICK_PATH_RE)) {
      if (m[1].includes('/')) add(m[1], 'backtick');
    }

    for (const { ref: raw, kind } of candidates) {
      const ref = stripFragment(raw);
      if (!ref) continue;
      if (isExternal(ref)) continue;
      if (isTemplate(ref)) continue;
      totalRefs++;
      if (!refResolves(file, ref, kind)) {
        broken.push({ file: relRoot(file), ref, kind });
      }
    }
  }

  console.log(`scanned ${files.length} markdown files · ${totalRefs} references`);
  if (broken.length === 0) {
    console.log('OK: no broken references');
    return;
  }

  console.error(`FAIL: ${broken.length} broken references`);
  for (const b of broken) console.error(`  ${b.file} → ${b.ref}  [${b.kind}]`);
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
