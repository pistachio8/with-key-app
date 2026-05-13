---
spec: 2026-05-13-team-agent-pre-work-standardization
title: with-key 팀 에이전트 작업 표준화 (Phase 1)
author: ian.jung
date: 2026-05-13
status: draft
---

## Summary

with-key는 곧 1명이 합류해 **2인 + AI 에이전트** 협업 구도가 된다. 합류자는 Codex CLI를 쓰고 Claude Code도 결제할 가능성이 있다. 도구가 다르더라도 동일한 산출물(spec / PR / commit)을 만들고, with-key 가드레일 7개를 누구나 같은 자리에서 볼 수 있게 한다.

핵심은 **새 시스템을 도입하기보다 with-key에 이미 있는 자산을 commit 가시성으로 끌어올리는 것**이다. `.agents/` 같은 신규 SoT(Single Source of Truth) 디렉터리, multi-tool adapter generator, 4-tier 자동 분류 같은 무거운 인프라는 채택하지 않는다.

이전 브레인스토밍 — gbike-labs의 `2026-05-12-team-agent-pre-work-standardization` 설계 — 의 결을 따르되, with-key의 실제 구도(MF 없음 · GitHub · 2인 · 단방향 POC 스키마)에 맞춰 5계층 중 SoT/Adapter는 기존 `@import` 체인으로 해결되었음을 인식하고, **누락된 3계층(Authoring/Validation/Review)만 가볍게 보강**한다.

## Why

with-key의 현 상태가 합류자 합류에 준비되어 있지 않은 4가지 지점:

- **가드레일이 개인 파일에 갇혀 있다.** `.claude/AGENTS.md`(201 lines, gitignored)에 with-key의 7개 핵심 가드레일(Server Action 우선, useEffect+fetch 금지, RLS 전 테이블 ON, 키워드 풀 freeze, AI 일기 4.5s 타임아웃, AnalyticsEvent 1:1, env 접두 규칙)이 있는데 Codex 합류자는 이 파일을 못 본다.
- **도구 무관 진입점이 약하다.** `AGENTS.md`(root, 50 lines)는 Codex CLI의 1차 진입점이지만 Next.js 16 학습 데이터 경고 + 작업 프로토콜만 담겨 있어 핵심 가드레일 부재.
- **문서 작성 시점 가이드가 흩어져 있다.** `docs/superpowers/{plans, specs}/`와 `docs/adr/` 3종이 운영 중이지만 "언제 무엇을 쓰는지" 명문화 없음.
- **자동 검증 게이트 0.** 코드 길이 폭주 · spec 누락 같은 회귀가 PR 리뷰 시점까지 발견 안 됨.

본 spec은 이 4지점을 도구 무관 방식으로 해결한다.

## Impact Scope

### 변경 경로

- 신규: `.github/pull_request_template.md`, `.husky/pre-commit`, `scripts/check-spec-required.mjs`, `scripts/new-doc.mjs`, `docs/superpowers/templates/{plan, spec, adr}.md`, `docs/superpowers/specs/README.md`
- 대규모 개편: `AGENTS.md`(root, 50줄 → ~180줄), `.claude/AGENTS.md`(201줄 → ~60줄, gitignored 유지)
- 수정: `package.json`(scripts · devDeps · lint-staged config), `eslint.config.*`(max-lines rule), `.github/workflows/ci.yml`(check-spec-required 한 줄), `docs/adr/README.md`(언제 ADR을 쓰는가)

### src/ 영향

없음. 본 spec은 협업 표준 도입이며 애플리케이션 코드 미수정.

### Supabase / RLS / migration 영향

없음.

### 외부 서비스

없음.

## Design

### Architecture — with-key용 4계층

원본 gbike-labs spec의 5계층(SoT / Adapter / Authoring / Validation / Review) 중 SoT/Adapter는 with-key에 이미 적합한 구현이 존재한다.

| 계층       | 위치                                                                                                 | 비고             |
| ---------- | ---------------------------------------------------------------------------------------------------- | ---------------- |
| SoT        | `docs/QUALITY_GATE.md` + `AGENTS.md`(root) + `docs/superpowers/{plans,specs}/` + `docs/adr/`         | 기존 자산 활용   |
| Adapter    | `CLAUDE.md`의 `@import` 체인(Claude) + `AGENTS.md` 직접 자동 로드(Codex CLI)                         | 신규 generator 0 |
| Authoring  | `pnpm new <plan\|spec\|adr> <topic>`                                                                 | **신규**         |
| Validation | `scripts/check-spec-required.mjs`(CI-soft) · `eslint max-lines: warn 800` · `lint-staged` pre-commit | **신규**         |
| Review     | `.github/pull_request_template.md`(한국어 · 체크박스 4개)                                            | **신규**         |

핵심 invariant:

- with-key 가드레일 7개는 **commit된 `AGENTS.md`(root)에만** 존재한다. 개인 파일에 가드레일을 두지 않는다.
- 자동 검증은 **soft 우선 · hard 회피**다. lint-staged는 자동 수정만, `check-spec-required`는 stderr 경고만, ESLint `max-lines`는 warn level.
- 신규 인프라(husky · 스크립트 2개 · PR 템플릿)는 **외부 의존성 2개**(`husky` + `lint-staged`)만 추가한다. `gray-matter` 같은 frontmatter 파서는 도입하지 않는다.

### Components

#### C1. `AGENTS.md`(root) 확장 — 50줄 → ~180줄

`AGENTS.md`는 Codex CLI의 1차 진입점이자 Claude의 `@import` 대상. with-key의 모든 핵심을 한 파일에서 볼 수 있도록 통합한다.

구조(8섹션):

```
AGENTS.md
├── (서두) Next.js 16 학습 데이터 경고 [기존 유지]
├── 1. 프로젝트 요약                       [신규 ~6줄]
├── 2. 작업 시작 프로토콜                   [기존 + 통합]
├── 3. with-key 가드레일 (절대 원칙)         [신규 — 7 서브섹션 bullet 압축, ~50줄]
│      §아키텍처 / §타입·검증 / §Supabase·RLS
│      §키워드 풀 / §AI 일기 / §AnalyticsEvent / §env·시크릿
├── 4. spec-required 경로 매핑              [신규 7행 표]
├── 5. 실행 스타일 + 작업 원칙               [기존 + 통합]
├── 6. 검증 (요약 + QUALITY_GATE 위임)       [신규 ~8줄]
├── 7. PR · 커밋 · hook 안내                 [신규 ~12줄, 한국어 PR · bypass 채널]
└── 8. 작업 종료 보고                       [기존]
```

압축 원칙: prose를 bullet으로 옮기되, **결정/금지에는 "왜" 1줄 동반**([doc-readability.md](../../../.claude/rules/common/doc-readability.md) §"왜"를 함께 남긴다).

#### C2. `.claude/AGENTS.md` slim화 — 201줄 → ~60줄, gitignored 유지

C1으로 이전된 섹션 제거. 잔류 항목:

- Technical Scribe (PROJECT_LOG.md 업데이트 정책) — PROJECT_LOG는 개인 파일이므로 정책도 개인 위치에 잔류
- ECC plugin 매핑 (`everything-claude-code:planner` 등 Claude 전용 skill 참조)
- 참고 커맨드(`.claude/commands/*.md` 링크) — Claude 전용

#### C3. `scripts/new-doc.mjs` — 문서 scaffolding (~50줄, 의존성 0)

CLI:

```bash
pnpm new plan <topic-kebab>    # → docs/superpowers/plans/YYYY-MM-DD-<topic>.md
pnpm new spec <topic-kebab>    # → docs/superpowers/specs/YYYY-MM-DD-<topic>.md
pnpm new adr  <topic-kebab>    # → docs/adr/NNNN-<topic>.md (다음 번호 자동)
```

구현 요점:

- 템플릿은 `docs/superpowers/templates/{plan,spec,adr}.md`에서 읽음 — 템플릿 수정 시 스크립트 변경 불요
- 치환 변수: `{{date}}`, `{{title}}`, `{{author}}`, `{{topic}}` — `git config user.name` 활용, 미설정 시 빈 문자열 + stderr 경고
- ADR 번호: `docs/adr/*.md` 중 최대값 + 1
- 같은 날짜 · 같은 topic 중복: `-2`, `-3` suffix 자동 (거부하지 않음 — 2인 팀에서 거부는 마찰만 ↑)
- `gray-matter` 등 외부 의존성 없음. 단순 문자열 치환.

#### C4. `scripts/check-spec-required.mjs` — CI-soft spec 게이트

CLI:

```bash
pnpm exec node scripts/check-spec-required.mjs --base develop
```

동작:

1. `git diff $BASE..HEAD --name-only`로 변경 파일 목록 추출
2. 화이트리스트(아래 표) 매칭 여부 검사
3. 매칭 시: 같은 PR에 `docs/superpowers/specs/*.md` 또는 `docs/adr/*.md` 추가/수정이 있는가?
4. 없으면 stderr에 경고 출력. exit code 0 (soft).

화이트리스트 — **spec-required 경로 7개** (grill Q8 매핑):

| 트리거 경로                           | 권장 산출물 | 이유                                                         |
| ------------------------------------- | ----------- | ------------------------------------------------------------ |
| `supabase/migrations/**`              | **ADR**     | 단방향(POC 정책), 데이터 손실 가능                           |
| `src/lib/supabase/**`                 | **ADR**     | admin/client/server/middleware 전부 인증 백본                |
| `middleware.ts`                       | **ADR**     | Next.js 인증 진입점                                          |
| `src/lib/keywords/pool.ts`            | **ADR**     | POC freeze 정책(PRD §4.6) — PO 승인 + VALIDATION 재논의 필요 |
| `src/lib/validators/**`               | **spec**    | 도메인 7개가 기능 진화 따라 빈번히 변경                      |
| `src/lib/analytics/track.ts`          | **spec**    | PRD §9.1과 1:1 동기화                                        |
| `src/lib/ai/**` (PROMPT_VERSION bump) | **spec**    | 프롬프트 가역, A/B 비교 가능                                 |

스크립트는 권장이 ADR이든 spec이든 **둘 중 하나만 있으면 통과**시키되, stderr 경고 메시지에 권장 산출물을 함께 출력한다("권장은 ADR이었습니다 — `docs/adr/`에 추가 검토").

##### 2~4주 후 HARD 승격 검토

도입 후 false positive율 데이터를 확보한 뒤 `.github/workflows/ci.yml`에서 exit 코드를 막도록 변경 검토. 본 spec에서는 soft로 시작.

#### C5. `.husky/pre-commit` + `lint-staged` — 저마찰 pre-commit

학습 가치(합류자 husky 첫 경험) + 저마찰을 둘 다 만족시키기 위해 **자동 수정만 하고 차단하지 않는** 구성.

`.husky/pre-commit`:

```bash
[ "$WITHKEY_HOOKS" = "skip" ] && exit 0
pnpm lint-staged
```

`package.json`:

```json
{
  "scripts": {
    "prepare": "husky",
    "new": "node scripts/new-doc.mjs"
  },
  "lint-staged": {
    "*.{ts,tsx,js,mjs}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css,yml,yaml}": ["prettier --write"]
  },
  "devDependencies": {
    "husky": "^9",
    "lint-staged": "^15"
  }
}
```

의도적으로 빼는 것:

- `pnpm typecheck` 같은 4~15초 페널티 — CI에 위임
- `pnpm test` — 동일
- commit-msg validation(commitlint) — squash-merge면 main에 안 남고, 마찰 ↑
- `check-spec-required` — pre-commit에 두면 "spec 미작성으로 commit 차단" = 저마찰 위반
- 파일 길이 budget — 작성 도중 일시적 800줄 초과는 정상. PR 리뷰가 적절

우회 채널 — 둘 다 지원:

- `git commit --no-verify` — 표준 Git 우회
- `WITHKEY_HOOKS=skip git commit ...` — 의도가 명시적인 우회 신호. AGENTS.md에 명문화

`*.sql`은 lint-staged에서 제외 — prettier가 SQL을 잘 다루지 못함.

#### C6. `.github/pull_request_template.md` — 한국어 + 4 체크박스

GitHub는 단일 템플릿을 모든 PR에 자동 prefill. 두 명 모두 동일한 양식으로 시작.

골격:

```markdown
## Summary

<!-- 무엇을 왜 바꿨는지 1~3 bullet -->

## Spec / ADR

<!-- spec-required 경로 변경이면 docs/superpowers/specs/...md 또는 docs/adr/...md 링크 -->
<!-- 해당 없으면 "해당 없음" -->

## with-key 가드레일 체크

- [ ] Supabase migration 추가 또는 RLS 변경 없음 — 또는 추가/변경 + spec/ADR 첨부 + 역할별 접근 검증 완료
- [ ] `src/lib/{validators,analytics/track,keywords/pool}.ts` 미변경 — 또는 변경 + spec/ADR 첨부
- [ ] `middleware.ts` 미변경 — 또는 변경 + 로그인 플로우 수동 검증
- [ ] 신규 env 변수 시 `.env.example` 동기화

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] (해당 시) `pnpm test:integration` / `pnpm test:e2e`
- [ ] 모바일 뷰 수동 확인 (UI 변경 시)

## Rollback

<!-- 되돌리는 방법 1~2줄. 트리비얼하면 "revert 1 commit" -->

---

<!-- 본 PR body는 한국어로 작성. 섹션 헤더는 영어 유지 가능. -->
```

#### C7. ESLint `max-lines` 규칙

`eslint.config.*`에 추가:

```js
{
  rules: {
    "max-lines": ["warn", { max: 800, skipBlankLines: true, skipComments: true }],
  }
}
// 테스트 파일 override
{
  files: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.test.ts", "**/*.test.tsx"],
  rules: { "max-lines": "off" }
}
```

`warn` 레벨이라 기존 CI `pnpm lint` job이 차단하지 않음. GitHub Actions annotation으로 가시성 확보.

### Data flow

```
[작업 의뢰]
   │
   ▼
pnpm new <plan|spec|adr> <topic>            (C3)
   │  templates/<type>.md 읽어 docs/<...>/YYYY-MM-DD-<topic>.md 생성
   ▼
[작성자 + 에이전트 협업]
   │  Codex / Claude — 어느 도구든 AGENTS.md(root, C1)에서 가드레일 7개 + spec-required 매핑 확인
   ▼
git commit
   │  .husky/pre-commit (C5):
   │  - lint-staged (prettier · eslint --fix) — 자동 수정만
   │  - 우회: WITHKEY_HOOKS=skip 또는 --no-verify
   ▼
git push → GitHub PR open
   │  .github/pull_request_template.md (C6)가 본문 prefill
   ▼
GitHub Actions CI
   │  quick job (lint · typecheck · validate:docs · test:ci · check-spec-required)
   │  - check-spec-required.mjs (C4): 화이트리스트 매칭 시 spec/ADR 존재 검증 → 부재 시 stderr 경고 (soft)
   │  - max-lines (C7): 800줄 초과 시 warn annotation
   │  integration job (Supabase migration + integration tests)
   │  e2e job (Playwright)
   ▼
[리뷰어가 PR body 체크리스트 따라 검토]
```

### File-length budget — ESLint로만, source code 한정

`src/**/*.{ts,tsx}` 800줄 warn. 테스트 파일 off. AGENTS.md · QUALITY_GATE.md 같은 SoT 문서는 enforcement 없음(단일 SoT라 자연 통제 + PR 리뷰가 잡음).

원본 gbike-labs spec의 글로벌 token-budget 합계 검증은 with-key에 적용하지 않는다 — generator drift 시나리오가 없어 ROI 없음.

### Context discipline (SOFT, 행동 규칙)

원본 spec의 7개 행동 규칙은 with-key에서 [.claude/rules/common/performance.md](../../../.claude/rules/common/performance.md) + [docs/QUALITY_GATE.md](../../QUALITY_GATE.md) "AI 에이전트 비용·컨텍스트 운영"에 이미 반영되어 있다. 본 spec에서는 신규 규칙을 추가하지 않고, **AGENTS.md(C1) §"실행 스타일"에서 위 두 문서를 명시적으로 링크**한다.

## 의도적으로 안 채택한 것

원본 gbike-labs spec과의 차이 — with-key에는 다른 답이 더 맞는 부분.

| 원본 제안                                            | with-key 미채택 | 이유                                                                          |
| ---------------------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `.agents/` SoT 디렉터리                              | ❌              | `@import` 체인이 이미 SoT 어댑터 역할. 2인 팀에서 신규 디렉터리는 ROI 음수    |
| `agents-sync.js` + 5 generator + drift HARD          | ❌              | adapter 생성 대상 없음(단일 SoT). drift 가능성 0                              |
| 4-tier 시스템(T0~T3) + 자동 추정                     | ❌              | MF 위험 없음. 경로 7개 화이트리스트로 충분                                    |
| `manifest.json` + plugin generator                   | ❌              | 위와 동일                                                                     |
| commitlint + tier-aware trailer                      | ❌              | squash-merge면 커밋 메시지가 main에 안 남음. 마찰 ↑                           |
| GitLab MR 템플릿 3종                                 | ❌              | with-key는 GitHub. 단일 템플릿                                                |
| MF Guardrails 체크박스                               | 치환            | with-key용 4개 체크박스(DB/RLS · lib contract · middleware · env)로 의미 보존 |
| husky pre-commit HARD drift / budget / spec-required | ❌              | drift 대상 없음 + 저마찰 원칙. 모두 CI 책임                                   |
| `gray-matter` 의존성                                 | ❌              | 단순 문자열 치환으로 충분                                                     |
| token-budget 합계 검증                               | ❌              | 단일 SoT라 자연 통제                                                          |

## Verification

### 명령

```bash
# 1. 새 브랜치에서 husky 설치 동작
pnpm install
ls -la .husky/pre-commit  # 파일 존재 확인

# 2. lint-staged 자동 수정
echo "const x=1" > /tmp/a.ts && cp /tmp/a.ts src/_tmp_test.ts
git add src/_tmp_test.ts
git commit -m "test: lint-staged dryrun"  # prettier가 'const x = 1\n'으로 자동 수정 + 재-stage
git reset --hard HEAD~1 && rm -f src/_tmp_test.ts

# 3. WITHKEY_HOOKS bypass
WITHKEY_HOOKS=skip git commit --allow-empty -m "test: bypass"  # hook 미실행 확인
git reset --hard HEAD~1

# 4. Scaffolding
pnpm new plan hello-world
ls docs/superpowers/plans/2026-05-13-hello-world.md  # 존재 확인
pnpm new spec test-spec
ls docs/superpowers/specs/2026-05-13-test-spec.md
pnpm new adr test-adr
ls docs/adr/0002-test-adr.md  # 다음 번호 자동
# 정리
rm docs/superpowers/{plans,specs}/2026-05-13-*.md docs/adr/0002-*.md

# 5. ESLint max-lines
pnpm lint  # 현재 코드베이스에 warn 출력 (있으면 갯수만 확인)

# 6. check-spec-required
git checkout -b test/spec-check
echo "" >> middleware.ts
git add middleware.ts && git commit -m "test"
pnpm exec node scripts/check-spec-required.mjs --base develop  # stderr 경고 확인, exit 0
git checkout develop && git branch -D test/spec-check

# 7. PR 템플릿
gh pr create --draft  # 본문 prefill 확인

# 8. 문서 링크 검증
pnpm validate:docs
```

### 시나리오 검증

- **합류자 첫 commit 시나리오**: 코드 1줄 + prettier 미적용 상태로 commit 시도 → lint-staged가 자동 수정 후 commit 성공. 합류자에게 표시되는 결과는 "commit 됐고 파일이 깔끔해짐" 뿐. 차단 0.
- **spec-required 경로 변경 PR**: `supabase/migrations/000X_*.sql` 추가만 한 PR open → CI quick job stderr에 "ADR 권장 — `docs/adr/`에 결정 기록" 경고. merge는 차단 안 됨(soft).
- **PR 템플릿 미작성 시나리오**: gh PR open 시 본문 prefill 확인. 작성자가 체크박스 다 비워도 차단 안 됨(리뷰어 책임).
- **`pnpm new`의 author 미설정**: `git config user.name` 비어있는 환경에서 `pnpm new spec foo` → 파일 생성 + stderr 경고("author 비어있음. git config user.name 설정 권장").
- **AGENTS.md 링크 검증**: 신규 AGENTS.md의 모든 내부 링크(`docs/QUALITY_GATE.md`, `.claude/rules/...`)가 `pnpm validate:docs`를 통과.

## Rollout

본 spec은 **spec PR + 구현 PR 1개**(또는 2개)로 진행.

순서:

1. (spec PR — 본 문서) 본 spec 머지.
2. (구현 PR) C1 + C2 — `AGENTS.md`(root) 전면 개편 + `.claude/AGENTS.md` slim. 한 commit.
3. (구현 PR 이어서) C3 + C4 — `scripts/new-doc.mjs` + `scripts/check-spec-required.mjs` + `docs/superpowers/templates/*` + `docs/{superpowers/specs, adr}/README.md`.
4. (구현 PR 이어서) C5 — husky 설치 + lint-staged config + `.husky/pre-commit` + `package.json` 변경.
5. (구현 PR 이어서) C6 — `.github/pull_request_template.md`.
6. (구현 PR 이어서) C7 — `eslint.config.*`에 `max-lines` 규칙.
7. (구현 PR 이어서) `.github/workflows/ci.yml`에 `pnpm exec node scripts/check-spec-required.mjs --base $GITHUB_BASE_REF` 한 줄.
8. (dogfood) 다음 spec-required 변경 작업(예: 다음 migration · validators 수정)을 본 시스템으로 진행. 마찰 지점은 GitHub issue로 즉시 기록.
9. (운영 2~4주 후) `check-spec-required`의 CI hard 승격 여부 검토 — false positive율 데이터 기준.

### 롤백

- 신규 파일 8개 제거: `.github/pull_request_template.md`, `.husky/pre-commit`, `scripts/check-spec-required.mjs`, `scripts/new-doc.mjs`, `docs/superpowers/templates/*`(3개), `docs/superpowers/specs/README.md`
- `AGENTS.md`(root) revert
- `.claude/AGENTS.md` 복원 (gitignored라 commit 영향 없음 — 본인 환경에서 복원)
- `package.json`, `eslint.config.*`, `.github/workflows/ci.yml`, `docs/adr/README.md` revert
- 구현 PR 1개 revert로 복귀 가능

## Out of scope

- `.agents/` SoT 디렉터리, `agents-sync.js`, multi-tool adapter generator
- Tier 시스템(T0~T3), 자동 tier 추정 스크립트, declared vs computed 비교
- commitlint / conventional commits 강제, tier-aware commit trailer
- pre-push hook(typecheck 등) — 합류자가 husky 친숙해진 후 별도 spec으로 검토
- husky로 spec-required / budget-check 강제 (모두 CI 책임으로 남김)
- `docs/QUALITY_GATE.md` 자체 수정 — 이미 SoT로 안정. AGENTS.md가 위임만 추가.
- `.claude/AGENTS.md` 잔류 ECC plugin 매핑의 Codex 친화 변환 — Codex는 ECC skill 비대상이라 가치 없음
- Remote 6개 / 멀티 저장소 이식 — with-key는 단일 저장소
- Token-efficiency 집계, telemetry, MCP 선언화 — 원본 spec의 Phase 4 영역, 본 spec 범위 아님
- 합류자 합류 자체의 절차(접근 권한 부여, 환경 설정 가이드) — 별도 onboarding 문서 영역

## 후속 작업 (Phase 2 후보 — 본 spec 범위 아님)

운영 데이터를 4~8주 축적한 뒤 검토:

- `check-spec-required.mjs`의 HARD 승격 (CI block)
- 합류자 동의 하에 pre-push hook에 `pnpm typecheck` 추가
- `docs/superpowers/templates/postmortem.md` 추가 — 인시던트 회고 양식
- `eslint max-lines`의 error 승격 + `--max-warnings 0` 적용 검토
- `.claude/AGENTS.md` 잔류분이 더 줄면 `.gitignore`에서 빼고 commit 전환 검토

## 용어집

- **adapter generator**: SoT를 읽어 각 도구가 인식하는 파일 포맷으로 자동 생성하는 스크립트. 원본 gbike-labs spec의 `agents-sync.js`. with-key는 미채택.
- **ADR**: Architecture Decision Record. 되돌리기 비용이 큰 결정을 보존하는 짧은 기록. with-key는 `docs/adr/`에 ADR-lite 운영.
- **drift HARD**: SoT 변경 후 adapter 재생성을 안 한 상태로 commit하면 강제 차단하는 패턴. with-key는 adapter generator 없으므로 미적용.
- **lint-staged**: 변경된(staged) 파일에만 lint/prettier를 실행하는 npm 도구. 전체 코드베이스 검사 대비 매우 빠름.
- **MF**: Module Federation. webpack의 멀티 앱 공유 모듈 시스템. gbike-labs는 MF host, with-key는 단일 Next.js 앱이라 무관.
- **PRD §9.1**: PRD(Product Requirements Document) 9.1 — AnalyticsEvent 이벤트 표. `src/lib/analytics/track.ts`의 유니온과 1:1 정렬 필요.
- **SoT**: Single Source of Truth. 중복 정의 없이 한 곳을 기준으로 삼는 원본.
- **spec-required 경로**: with-key에서 변경 시 `docs/superpowers/specs/` 또는 `docs/adr/`에 설계 문서를 함께 추가해야 하는 7개 코드 경로.
- **squash-merge**: PR의 여러 commit을 main에 1개 commit으로 합쳐 머지하는 GitHub 기본 옵션. 개별 commit 메시지가 main 히스토리에 남지 않음.
- **WITHKEY_HOOKS=skip**: with-key 합의된 husky 우회 환경변수. `--no-verify`와 동일한 효과지만 의도가 명시적.
