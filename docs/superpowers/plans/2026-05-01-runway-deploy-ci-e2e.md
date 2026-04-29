# Runway: CI + Playwright E2E + Preview Deploy 구현 계획 (Day 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Day 2 에서 배선된 실DB + BFF 위에 **GitHub Actions CI(lint/type/unit/integration/e2e) + Playwright E2E + Vercel Preview 배포** 만 추가해 "내 로컬에서만 green" 부채를 회수한다. POC 스케일이라 원격 Supabase 는 **기존 `with-key` 프로젝트 1개를 local/CI/preview 가 공유**한다 (dev/prod 분리는 v1 컷오버 시점에 한 번에).

**Architecture:**

- **단일 Supabase 프로젝트 공유 (POC 스케일)**: 기존 `with-key` 프로젝트(ref `ohvcaytmzzwxkbxsmyny`, 마이그레이션 0001~0006 이미 반영됨)를 local 개발 + CI 통합 테스트 + Vercel preview 가 모두 사용한다. **안전 근거**: `truncate_test_data` RPC 가 `email like '%@test.local'` 로 스코핑되어 있어([supabase/migrations/0003_state_transitions.sql:53-84](supabase/migrations/0003_state_transitions.sql#L53-L84)) CI 통합 테스트가 수동 검증 데이터를 파괴할 수 없음. 분리 비용 > 얻는 격리 이득. dev/prod 분리는 v1 컷오버 ADR 로 이월.
- **CI 단계 분리**: `quick`(lint + typecheck + unit, 모든 PR blocking, <5분) + `integration`(원격 Supabase 에 real RLS) + `e2e`(integration 뒤 체이닝). `integration`/`e2e` 는 secrets 접근 필요 → repo-owned PR 에만 blocking.
- **Playwright auth strategy**: 실제 이메일 수신 없이 Supabase Admin API `generateLink` → `verifyOtp` 로 세션 주입 (integration harness 와 동일 패턴). `storageState.json` 재사용해 테스트당 OTP 왕복 회피. E2E 가 만든 `e2e+<ts>@test.local` 유저는 `truncate_test_data` 가 정리.
- **Preview deploy**: Vercel GitHub Integration + env 를 기존 `with-key` 프로젝트 키로 매핑. Preview URL 이 PR 댓글로 자동 게시.

**Tech Stack:** GitHub Actions · Supabase CLI 2.x · @playwright/test 1.49+ · Vercel · pnpm 10.7 · Node 20 · Next.js 16.

---

## 0. 사전 이해 — 이 plan 이 해결하는 것

Day 2 (`2026-04-30`) 종료 시점 실측 상태:

1. ~~**원격 Supabase 에 DDL 미반영**~~ → **이미 해결됨**. `pnpm exec supabase migration list --linked` 결과 0001~0006 Local=Remote 동기화 확인. 프로젝트 ref `ohvcaytmzzwxkbxsmyny`, link 파일은 [supabase/.temp/linked-project.json](supabase/.temp/linked-project.json).
2. **CI 없음**: `.github/` 폴더 부재. 모든 검증이 사람 로컬에서만 실행됨.
3. **E2E 없음**: `@playwright/test` 의존성 없음. `tests/` 아래 `integration` 폴더만 있음.
4. **Preview 배포 없음**: `vercel.json` 부재. PR 리뷰어가 실UI 를 확인할 방법 없음.
5. **env 문서 없음**: `ONBOARDING.md` 가 CI secrets + Vercel env 매핑 절차를 담지 않음.

**Plan 의 범위**: (2)(3)(4)(5) 만 해결. (1)은 Day 2 에서 끝났으므로 "새 프로젝트 생성 + db:push" 같은 Sprint 0 작업은 **이 plan 에서 제거됨**. 대신 Sprint 0 은 "기존 `with-key` 프로젝트의 키를 CI/Vercel secret 으로 등록"으로 재정의.

---

## 0.5 실행 가드레일 (Pre-flight)

### 의존성 순서

```
S0 (secrets 등록 + Vercel 연결) →
S1 (CI quick: lint/type/unit) →
S2 (CI integration: real RLS 테스트) →
S3 (Playwright E2E + auth bootstrap) →
S4 (CI e2e job + 아티팩트) →
S5 (ONBOARDING + DEPLOY + D-014/015)
```

- S0 없이 S2 로 가면 `SUPABASE_*` secret 이 없어 job 이 fail.
- S3 는 S0 의 Vercel 연결 없이도 로컬에서 실행은 가능하나, S4 에서 CI 실행할 때 secret 이 필요.
- S4 는 S3 의 로컬 green 확인 후.
- 마지막 ADR (S5) 은 S0 Vercel 매핑 + S4 결과가 확정된 뒤.

### 환경 가드

- [ ] GitHub repo admin 권한 보유(branch protection + secrets 등록).
- [ ] Supabase 대시보드 접근(access token 발급 + API 키 복사).
- [ ] Vercel 계정 + GitHub 연결.
- [ ] `gh` CLI 인증(`gh auth status` → `Logged in to github.com as pistachio8`).

### Secrets 맵 (최종 목표)

GitHub Actions secrets(전부 기존 `with-key` Supabase 프로젝트 한 개에서 파생):

| 이름 | 값 출처 | 사용 위치 |
|---|---|---|
| `SUPABASE_URL` | 대시보드 → Project Settings → API → Project URL | integration + e2e job env |
| `SUPABASE_PUBLISHABLE_KEY` | 대시보드 → API → publishable (sb_publishable_*) | integration + e2e |
| `SUPABASE_SECRET_KEY` | 대시보드 → API → secret (sb_secret_*) | integration + e2e setup |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens | 신규 migration 이 들어올 때만 `supabase db push` (선택) |
| `SUPABASE_DB_PASSWORD` | `.env.local` 에 이미 저장돼 있는 DB 비밀번호, 또는 대시보드 → Database → Reset password | `supabase db push` CLI 프롬프트 |

**보안 경계**: `SUPABASE_SECRET_KEY` 는 **POC 단일 프로젝트** 라 CI+Preview+local 모두에서 사용. v1 컷오버 시 prod 프로젝트의 secret 은 **Vercel Production scope 에만** 저장하고 CI/Preview 는 dev 전용 secret 으로 분리.

---

## 1. File Structure

### 1.0 Secrets + 문서 (Sprint 0)

- Modify: `.env.example` — CI secret 명칭이 `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` (접미사 없음) 임을 주석으로 명시. POC 스케일이라 local env 변수 이름과 secret 이름이 동일.

### 1.1 CI — quick lane (Sprint 1)

- Create: `.github/actions/setup-pnpm/action.yml` — pnpm + node setup composite action.
- Create: `.github/workflows/ci.yml` — `quick` job: pnpm install + lint + typecheck + unit tests.
- Modify: `package.json` — `test:ci` = `vitest run --project unit --reporter=dot`.

### 1.2 CI — integration lane (Sprint 2)

- Modify: `.github/workflows/ci.yml` — `integration` job 추가(quick 성공 후 실행).
- Create: `scripts/ci/apply-migrations.sh` — **선택**: 새 migration 이 PR 에 포함된 경우에만 `supabase db push`. 현재 PR 에 `supabase/migrations/` 변경이 없으면 no-op.
- Create: `supabase/migrations/0007_ci_rls_audit.sql` — `audit_rls_status()` RPC (integration smoke 테스트용).
- Create: `tests/integration/ci-health.spec.ts` — CI 에서 RLS ON 여부 확인.

### 1.3 Playwright E2E (Sprint 3)

- Create: `playwright.config.ts` — baseURL, storageState 공통 사용.
- Create: `tests/e2e/global-setup.ts` — admin `generateLink` → verifyOtp → 쿠키 저장.
- Create: `tests/e2e/fixtures.ts` — 인증된 context + groupId fixture.
- Create: `tests/e2e/auth-login.spec.ts` — 이메일 입력 → magic link 요청 토스트.
- Create: `tests/e2e/challenge-create.spec.ts` — `/challenge/new?groupId=...` → 상세 리다이렉트.
- Create: `tests/e2e/pledge-sign.spec.ts` — 2명 서명 → challenge.status=active.
- Create: `src/app/api/me/route.ts` — E2E fixture 가 userId 조회할 때 쓰는 얇은 엔드포인트.
- Modify: `package.json` — `test:e2e` · `test:e2e:ui` + devDependency `@playwright/test`.
- Modify: `.gitignore` — `/test-results/`, `/playwright-report/`, `/tests/e2e/.auth/`.

### 1.4 CI — e2e lane (Sprint 4)

- Modify: `.github/workflows/ci.yml` — `e2e` job(integration 후 실행, Next prod build + start, 아티팩트 업로드).

### 1.5 Vercel Preview (Sprint 4 병행)

- Create: `vercel.json` — 리전 `icn1`.
- Create: `docs/DEPLOY.md` — Vercel 연결/env/preview runbook.

### 1.6 문서 + ADR (Sprint 5)

- Modify: `docs/ONBOARDING.md` — "CI & 배포" 섹션 append.
- Modify: `docs/TEAM_SHARE_DECISIONS.md` — **D-014 / D-015** append.

---

## 2. Tasks

### Sprint 0 — Secrets 등록

---

### Task 1: GitHub Actions secrets 등록

> **근거**: 기존 `with-key` Supabase 프로젝트는 이미 운영 중이고 마이그레이션도 적용됨. Runway 는 이 프로젝트의 키를 CI 에서 사용할 수 있게 하는 것이 전부. 신규 프로젝트 생성은 불필요(POC 스케일 · YAGNI).

**Files:**
- Modify: `.env.example`

- [ ] **Step 1 (수동): Supabase 대시보드에서 값 확인**

https://supabase.com/dashboard/project/ohvcaytmzzwxkbxsmyny/settings/api 에서 다음 4 값을 확인:
- Project URL (예: `https://ohvcaytmzzwxkbxsmyny.supabase.co`)
- publishable key (`sb_publishable_...`)
- secret key (`sb_secret_...`)
- DB password: 기존 `.env.local` 에 있으면 재사용. 없으면 대시보드 → Database → Reset database password 로 재발급 후 저장.

Personal access token:
- https://supabase.com/dashboard/account/tokens → "Generate new token" → 이름 `gh-actions`.

- [ ] **Step 2 (수동): GitHub secrets 등록**

Run: `gh secret set SUPABASE_URL`
Paste: Step 1 의 Project URL.

이어서 다음도 각각 실행(값은 대시보드에서 복사):
```bash
gh secret set SUPABASE_PUBLISHABLE_KEY
gh secret set SUPABASE_SECRET_KEY
gh secret set SUPABASE_ACCESS_TOKEN
gh secret set SUPABASE_DB_PASSWORD
```

Run(검증): `gh secret list`

Expected 출력:
```
SUPABASE_ACCESS_TOKEN      Updated YYYY-MM-DD
SUPABASE_DB_PASSWORD       Updated YYYY-MM-DD
SUPABASE_PUBLISHABLE_KEY   Updated YYYY-MM-DD
SUPABASE_SECRET_KEY        Updated YYYY-MM-DD
SUPABASE_URL               Updated YYYY-MM-DD
```

- [ ] **Step 3: `.env.example` 에 CI secret 매핑 주석 추가**

Edit `.env.example` — `# --- Supabase ---` 블록 **맨 아래**에 다음을 append:

```dotenv
#
# GitHub Actions 는 동일한 값을 다음 secret 이름으로 저장한다(POC 단일 프로젝트):
#   SUPABASE_URL               = NEXT_PUBLIC_SUPABASE_URL 과 동일
#   SUPABASE_PUBLISHABLE_KEY   = NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 와 동일
#   SUPABASE_SECRET_KEY        = SUPABASE_SECRET_KEY 와 동일
#   SUPABASE_ACCESS_TOKEN      = https://supabase.com/dashboard/account/tokens 에서 발급
#   SUPABASE_DB_PASSWORD       = 대시보드 → Database → Connection password
# ci.yml 의 각 job env 블록이 이 secret 들을 NEXT_PUBLIC_* 이름으로 매핑한다.
```

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore(ci): document secret name mapping for runway"
```

---

### Sprint 1 — CI quick lane (lint + type + unit)

---

### Task 2: pnpm setup 공유 composite action

> **근거**: quick/integration/e2e 3개 job 이 모두 pnpm install 을 반복. 공통 구간을 composite action 으로 빼면 yaml 중복이 줄고 Node/pnpm 버전 관리가 한 곳에서 됨.

**Files:**
- Create: `.github/actions/setup-pnpm/action.yml`

- [ ] **Step 1: composite action 작성**

Run: `mkdir -p .github/actions/setup-pnpm`

Create `.github/actions/setup-pnpm/action.yml`:

```yaml
name: "Setup pnpm + Node"
description: "Setup Node 20 + pnpm 10.7 + install deps with cache"
runs:
  using: "composite"
  steps:
    - uses: pnpm/action-setup@v4
      with:
        version: 10.7.0
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: pnpm
    - shell: bash
      run: pnpm install --frozen-lockfile
```

- [ ] **Step 2: Commit (아직 workflow 는 없음 — 다음 Task)**

```bash
git add .github/actions/setup-pnpm/action.yml
git commit -m "chore(ci): add setup-pnpm composite action"
```

---

### Task 3: `ci.yml` — quick job

> **근거**: 모든 PR 에 blocking 되는 가장 빠른 lane. 로컬 훅이 놓친 lint/type 을 서버 쪽에서 잡는다. 5분 이내가 목표.

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

- [ ] **Step 1: `test:ci` script 추가**

Edit `package.json` — `scripts` 섹션의 `"test"` 라인 **뒤**에 한 줄 추가:

```json
    "test:ci": "vitest run --project unit --reporter=dot",
```

최종 scripts 블록 일부 (참고):

```json
    "test": "vitest run --project unit",
    "test:ci": "vitest run --project unit --reporter=dot",
    "test:integration": "vitest run --project integration",
```

- [ ] **Step 2: `ci.yml` 작성 (quick job 만)**

Run: `mkdir -p .github/workflows`

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [develop, main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quick:
    name: Lint + Type + Unit
    runs-on: ubuntu-latest
    timeout-minutes: 8
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-pnpm
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:ci
```

- [ ] **Step 3: 로컬 sanity check**

Run: `pnpm lint && pnpm typecheck && pnpm test:ci`

Expected: 3개 모두 exit 0. 아니면 quick job 이 CI 에서 실패할 것이므로 여기서 먼저 고친다.

- [ ] **Step 4: 브랜치 + PR 생성 → CI 실검증**

```bash
git checkout -b feat/ci-runway
git add package.json .github/workflows/ci.yml
git commit -m "feat(ci): add quick lane — lint + typecheck + unit on every PR"
git push -u origin feat/ci-runway
gh pr create --base develop --title "ci: runway (WIP)" --body "Tracking 2026-05-01 runway plan. CI + E2E + preview deploy."
```

- [ ] **Step 5: Actions 탭에서 green 확인**

Run: `gh pr checks`
Expected: `Lint + Type + Unit` 가 `pass` 표시. 실패 시 `gh run view --log-failed` 로 원인 확인.

- [ ] **Step 6 (수동): branch protection 설정**

Repo → Settings → Rules → Rulesets → New ruleset:
- Name: `protect-develop`
- Target branches: `develop`, `main`
- Require status checks to pass: 추가 → `Lint + Type + Unit`
- Require pull request before merging: on, approvals = 1
- Dismiss stale pull request approvals when new commits are pushed: on

저장 후 PR 페이지에서 `Lint + Type + Unit` 옆에 "Required" 표시 확인.

---

### Sprint 2 — CI integration lane

---

### Task 4: `audit_rls_status` RPC + CI 헬스 테스트

> **근거**: integration job 이 올바른 DB 에 붙었고 RLS 가 전부 ON 인지를 가장 얇게 검증. 실패 시 후속 테스트들이 의미 없이 깨지는 혼란을 방지.

**Files:**
- Create: `supabase/migrations/0007_ci_rls_audit.sql`
- Create: `tests/integration/ci-health.spec.ts`

- [ ] **Step 1: migration 작성**

Create `supabase/migrations/0007_ci_rls_audit.sql`:

```sql
-- CI 스모크용. 애플리케이션 테이블별 RLS ON/OFF 반환.
-- service_role 만 호출 가능(anon/authenticated 은 막힘).
create or replace function public.audit_rls_status()
returns table (tablename text, rowsecurity boolean)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select c.relname::text, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not like '\_%'
    and c.relname not in ('schema_migrations');
$$;

revoke all on function public.audit_rls_status() from public, anon, authenticated;
grant execute on function public.audit_rls_status() to service_role;
```

- [ ] **Step 2: 원격에 push**

Run: `pnpm db:push`

Expected:
```
Applying migration 0007_ci_rls_audit.sql...
Finished supabase db push.
```

- [ ] **Step 3: 실패 테스트 작성**

Create `tests/integration/ci-health.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { admin } from "./setup";

describe("ci health", () => {
  it("RLS is ON for every application table", async () => {
    const { data, error } = await admin.rpc("audit_rls_status");
    if (error) throw error;
    const rows = (data ?? []) as { tablename: string; rowsecurity: boolean }[];
    const withoutRls = rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
    expect(withoutRls).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  it("truncate_test_data RPC is reachable", async () => {
    const { error } = await admin.rpc("truncate_test_data");
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 4: 로컬에서 통과 확인**

Run: `pnpm test:integration tests/integration/ci-health.spec.ts`

Expected: `2 passed`. 만약 `withoutRls` 가 비어있지 않으면 해당 테이블 migration 을 고친 뒤 다시.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_ci_rls_audit.sql tests/integration/ci-health.spec.ts
git commit -m "test(ci): add audit_rls_status RPC + RLS health smoke"
git push
```

---

### Task 5: `apply-migrations.sh` — 신규 migration 자동 apply 스크립트

> **근거**: 현재 시점에는 원격에 0001~0007 가 이미 반영돼 있어 CI 에서 매 run 마다 push 할 필요가 없다. 하지만 **이후 PR 에 새 migration 이 포함되면** 누군가 수동으로 `pnpm db:push` 를 해야 integration/e2e job 이 통과한다. 이 스크립트는 "이번 커밋에 migration 변경이 있고, 원격에 없으면" 만 push 한다(no-op 안전).

**Files:**
- Create: `scripts/ci/apply-migrations.sh`

- [ ] **Step 1: 스크립트 작성**

Run: `mkdir -p scripts/ci`

Create `scripts/ci/apply-migrations.sh`:

```bash
#!/usr/bin/env bash
# Apply any new migrations to the linked (shared) with-key project.
# No-op if Local == Remote. Used by ci.yml integration job.
# Requires env: SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD.
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?required}"
: "${SUPABASE_DB_PASSWORD:?required}"

# Re-link (idempotent) — CI runners don't have a persisted .supabase/ folder.
# The project ref is hardcoded because this plan intentionally uses a single
# shared Supabase project at POC scale (see D-014).
: "${SUPABASE_PROJECT_REF:=ohvcaytmzzwxkbxsmyny}"

pnpm exec supabase link --project-ref "$SUPABASE_PROJECT_REF"

# `db push` is idempotent: if all migrations are already applied it exits 0
# with "Remote database is up to date."
pnpm exec supabase db push --linked --include-all --password "$SUPABASE_DB_PASSWORD"

echo "[ci] migrations applied (or already up to date) on $SUPABASE_PROJECT_REF"
```

Run: `chmod +x scripts/ci/apply-migrations.sh`

- [ ] **Step 2: 로컬에서 dry-run**

Run:
```bash
SUPABASE_ACCESS_TOKEN="$(grep SUPABASE_ACCESS_TOKEN .env.local | cut -d= -f2- | tr -d \")" \
SUPABASE_DB_PASSWORD="$(grep SUPABASE_DB_PASSWORD .env.local | cut -d= -f2- | tr -d \")" \
bash scripts/ci/apply-migrations.sh
```

**주의**: `.env.local` 에 `SUPABASE_DB_PASSWORD` 가 없다면 대시보드 → Database → Connection password 에서 확인해 환경변수로 직접 주입.

Expected: `Remote database is up to date.` 또는 `Applying migration ...` 후 `Finished supabase db push.`

- [ ] **Step 3: Commit**

```bash
git add scripts/ci/apply-migrations.sh
git commit -m "chore(ci): add idempotent migration apply script"
```

---

### Task 6: `ci.yml` — integration job

> **근거**: integration 은 `SUPABASE_SECRET_KEY` 접근 필요 → fork PR 은 secrets 미노출이라 자동 skip. repo-owned PR + push(develop/main) 에서만 실행.

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: integration job append**

Edit `.github/workflows/ci.yml` — `quick` job 블록 바로 아래에 append:

```yaml
  integration:
    name: Integration (shared with-key project)
    needs: quick
    runs-on: ubuntu-latest
    timeout-minutes: 15
    if: github.event.pull_request.head.repo.full_name == github.repository || github.event_name == 'push'
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
      SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      NEXT_PUBLIC_APP_CODENAME: with-key
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-pnpm
      - name: Apply pending migrations (no-op if up to date)
        run: bash scripts/ci/apply-migrations.sh
      - name: Run integration tests
        run: pnpm test:integration
```

- [ ] **Step 2: Commit + push + Actions 확인**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): add integration lane against shared with-key project"
git push
```

Run: `gh pr checks`

Expected: `Integration (shared with-key project)` 가 pass. 첫 run 이라면 `Apply pending migrations (no-op if up to date)` 출력에 `Remote database is up to date.` 가 있어야 함.

- [ ] **Step 3: Troubleshoot**

증상별 대응:
- `connection refused` / `unauthorized` → `SUPABASE_ACCESS_TOKEN` 만료. 대시보드에서 재발급 → `gh secret set SUPABASE_ACCESS_TOKEN`.
- `password authentication failed` → `SUPABASE_DB_PASSWORD` 가 대시보드 값과 불일치. Reset → 재등록.
- `test expects migrations applied` → `apply-migrations.sh` step 이 skip/fail. 로그 확인.
- `RLS denied` 가 수많이 나오면 → 이 플랜이 건드리지 않은 기존 `tests/integration/` 이 local Supabase 전제였는지 확인(정상적으로는 원격에서도 동일 스키마라 pass).

- [ ] **Step 4 (수동): branch protection 에 integration 추가**

Repo → Settings → Rules → `protect-develop` → "Require status checks" 에 `Integration (shared with-key project)` 를 추가 저장.

---

### Sprint 3 — Playwright E2E

---

### Task 7: Playwright 설치 + 기본 config

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: 의존성 설치**

Run:
```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

Expected: `@playwright/test` 가 `package.json` devDependencies 에 추가. chromium 바이너리 다운로드 완료.

- [ ] **Step 2: `playwright.config.ts` 작성**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    storageState: "tests/e2e/.auth/user.json",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

- [ ] **Step 3: scripts 추가**

Edit `package.json` — `test:integration` 아래에 두 줄 추가:

```json
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
```

- [ ] **Step 4: `.gitignore` append**

Edit `.gitignore` — 맨 아래에 블록 추가:

```
# Playwright
/test-results/
/playwright-report/
/tests/e2e/.auth/
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts .gitignore
git commit -m "chore(e2e): install playwright and add config"
```

---

### Task 8: `/api/me` 엔드포인트 + E2E global setup

> **근거**: E2E fixture 가 현재 로그인된 유저의 `id` 를 가져오려면 서버에서 세션을 해석한 결과가 필요. client-side 에서 읽기 어려우므로 얇은 read-only 엔드포인트 1개 추가. global setup 은 매 테스트마다 OTP 왕복 안 하도록 1회만 실행.

**Files:**
- Create: `src/app/api/me/route.ts`
- Create: `tests/e2e/global-setup.ts`

- [ ] **Step 1: `/api/me` route 작성**

Create `src/app/api/me/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ id: user.id, email: user.email });
}
```

- [ ] **Step 2: 로컬에서 엔드포인트 동작 확인**

Run(로그인된 상태로 dev 서버):
```bash
pnpm dev &
sleep 5
curl -i http://localhost:3000/api/me
kill %1
```

Expected(로그인 상태 아니면):
```
HTTP/1.1 401
{"error":"unauthorized"}
```

로그인 상태라면 200 + `{"id":"...","email":"..."}`.

- [ ] **Step 3: global-setup 작성**

Run: `mkdir -p tests/e2e/.auth`

Create `tests/e2e/global-setup.ts`:

```ts
import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE) {
  throw new Error(
    "E2E requires Supabase env (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY)",
  );
}

export default async function globalSetup(_config: FullConfig) {
  const email = `e2e+${Date.now()}@test.local`;
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && created.error.status !== 422) throw created.error;

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const otp = data.properties?.email_otp;
  if (!otp) throw new Error("no email_otp returned");

  const baseURL = `http://127.0.0.1:${process.env.E2E_PORT ?? 3000}`;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(baseURL + "/login");
  await page.evaluate(
    async ({ url, key, email, otp }) => {
      const mod = await import("https://esm.sh/@supabase/supabase-js@2.105.1");
      const c = mod.createClient(url, key, { auth: { persistSession: true } });
      const r = await c.auth.verifyOtp({ email, token: otp, type: "magiclink" });
      if (r.error) throw r.error;
    },
    { url: SUPABASE_URL!, key: ANON_KEY!, email, otp },
  );

  await context.storageState({ path: "tests/e2e/.auth/user.json" });
  await browser.close();
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/me/route.ts tests/e2e/global-setup.ts
git commit -m "feat(e2e): add /api/me helper + global setup for magic-link session"
```

---

### Task 9: E2E — 로그인 폼 smoke

> **근거**: global-setup 이 세션을 주입하지만, 실UI 경로("이메일 입력 → 성공 토스트")도 최소 1번은 커버해야 auth 폼 자체의 회귀가 잡힌다. 이 테스트만 storageState 를 비워 anonymous 로 실행.

**Files:**
- Create: `tests/e2e/auth-login.spec.ts`

- [ ] **Step 1: 테스트 작성**

Create `tests/e2e/auth-login.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("anonymous user can request a magic link", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByLabel("이메일").fill(`smoke+${Date.now()}@test.local`);
  await page.getByRole("button", { name: /이메일|로그인|보내기/ }).click();
  await expect(page.getByText("로그인 링크를 이메일로 보냈어요")).toBeVisible({
    timeout: 10_000,
  });
});
```

- [ ] **Step 2: 로컬 실행**

Run: `pnpm exec playwright test tests/e2e/auth-login.spec.ts --project chromium`

Expected: `1 passed`.

- [ ] **Step 3: 실패 시 debug**

- 버튼 name regex 가 매치 안 되면 [src/app/(auth)/login/page.tsx](src/app/(auth)/login/page.tsx) 에서 실제 텍스트 확인 후 regex 보완.
- 토스트 문구는 같은 파일의 `toast.success(...)` 라인 확인.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/auth-login.spec.ts
git commit -m "test(e2e): add magic-link login smoke"
```

---

### Task 10: E2E fixture — groupId 자동 준비

**Files:**
- Create: `tests/e2e/fixtures.ts`

- [ ] **Step 1: fixture 작성**

Create `tests/e2e/fixtures.ts`:

```ts
import { test as base } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type MyFixtures = {
  groupId: string;
};

export const test = base.extend<MyFixtures>({
  groupId: async ({ page }, use) => {
    await page.goto("/home");
    const userId = await page.evaluate(async () => {
      const res = await fetch("/api/me");
      if (!res.ok) return null;
      const j = (await res.json()) as { id: string };
      return j.id;
    });
    if (!userId) throw new Error("cannot resolve authenticated user id via /api/me");

    const { data, error } = await admin
      .from("groups")
      .insert({ name: `e2e-group-${Date.now()}`, owner_id: userId })
      .select("id")
      .single();
    if (error) throw error;

    const memberInsert = await admin
      .from("group_members")
      .insert({ group_id: data.id, user_id: userId, role: "owner" });
    if (memberInsert.error) throw memberInsert.error;

    await use(data.id);
    // Cleanup: truncate_test_data (afterEach in integration harness) 에 준하는
    // 스코프가 e2e 에는 없으므로 fixture 가 명시적으로 지운다.
    await admin.from("groups").delete().eq("id", data.id);
  },
});

export { expect } from "@playwright/test";
```

**주의**: `groups.owner_id` 컬럼 이름이 스키마와 일치하는지 확인. 다르면 실제 컬럼명으로 교체.

Run: `grep -n "owner_id\|created_by" supabase/migrations/0001_init.sql | head -5`

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/fixtures.ts
git commit -m "test(e2e): add groupId fixture that seeds + cleans via service_role"
```

---

### Task 11: E2E — challenge 생성 경로

**Files:**
- Create: `tests/e2e/challenge-create.spec.ts`

- [ ] **Step 1: 테스트 작성**

Create `tests/e2e/challenge-create.spec.ts`:

```ts
import { test, expect } from "./fixtures";

test("user creates a challenge and lands on the detail page", async ({ page, groupId }) => {
  await page.goto(`/challenge/new?groupId=${groupId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The form has a pre-filled title; just submit.
  await page.getByRole("button", { name: /제출|만들|생성|다음/ }).click();

  await page.waitForURL(/\/challenge\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/challenge\/[0-9a-f-]{36}$/);
});
```

- [ ] **Step 2: 로컬 실행**

Run: `pnpm exec playwright test tests/e2e/challenge-create.spec.ts`

Expected: `1 passed`. 실패 시 `test-results/` 의 trace.zip 을 `pnpm exec playwright show-trace` 로 열어 어느 셀렉터가 맞지 않았는지 확인.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/challenge-create.spec.ts
git commit -m "test(e2e): add challenge create flow"
```

---

### Task 12: E2E — pledge 서명 → active 전이

**Files:**
- Create: `tests/e2e/pledge-sign.spec.ts`

- [ ] **Step 1: 테스트 작성**

Create `tests/e2e/pledge-sign.spec.ts`:

```ts
import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

test("last signer triggers challenge activation", async ({ page, groupId }) => {
  // Arrange: 2-participant challenge with one already signed.
  const { data: ch, error: chErr } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: "서명 전이 테스트",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "draft",
    })
    .select("id")
    .single();
  if (chErr) throw chErr;

  const { data: otherUser, error: userErr } = await admin.auth.admin.createUser({
    email: `e2e-other+${Date.now()}@test.local`,
    email_confirm: true,
  });
  if (userErr) throw userErr;
  if (!otherUser?.user) throw new Error("failed to create second user");

  await admin.from("group_members").insert({
    group_id: groupId,
    user_id: otherUser.user.id,
    role: "member",
  });
  await admin.from("challenge_participants").insert([
    {
      challenge_id: ch.id,
      user_id: otherUser.user.id,
      signed_at: new Date().toISOString(),
    },
  ]);

  // Act: the current (authed) user signs via UI.
  await page.goto(`/pledge?challengeId=${ch.id}`);
  await page.getByRole("button", { name: /서명|동의/ }).click();
  await page.waitForURL(/\/challenge\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  // Assert: DB status transitioned.
  const { data: updated, error } = await admin
    .from("challenges")
    .select("status")
    .eq("id", ch.id)
    .single();
  if (error) throw error;
  expect(updated?.status).toBe("active");
});
```

- [ ] **Step 2: 로컬 실행**

Run: `pnpm exec playwright test tests/e2e/pledge-sign.spec.ts`

Expected: `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/pledge-sign.spec.ts
git commit -m "test(e2e): verify sign_and_maybe_activate transitions to active"
```

---

### Sprint 4 — CI e2e job + Vercel Preview

---

### Task 13: `ci.yml` — e2e job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: e2e job append**

Edit `.github/workflows/ci.yml` — `integration` 블록 바로 아래에 append:

```yaml
  e2e:
    name: Playwright E2E
    needs: integration
    runs-on: ubuntu-latest
    timeout-minutes: 20
    if: github.event.pull_request.head.repo.full_name == github.repository || github.event_name == 'push'
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
      SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
      NEXT_PUBLIC_APP_URL: http://127.0.0.1:3000
      NEXT_PUBLIC_APP_CODENAME: with-key
      OPENAI_API_KEY: sk-dummy-ci
      OPENAI_MODEL: gpt-4o-mini
      AI_MONTHLY_BUDGET_KRW: "50000"
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: dummy
      VAPID_PRIVATE_KEY: dummy
      VAPID_SUBJECT: mailto:ci@with-key.local
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-pnpm
      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium
      - name: Run Playwright tests
        run: pnpm test:e2e
      - name: Upload HTML report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report
          retention-days: 14
      - name: Upload traces on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-traces
          path: test-results
          retention-days: 7
```

- [ ] **Step 2: Commit + push + 실CI 확인**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): add playwright e2e job with report/trace artifacts"
git push
```

Run: `gh pr checks --watch`

Expected: `quick` → `Integration (shared with-key project)` → `Playwright E2E` 순차 green.

- [ ] **Step 3: Troubleshoot**

증상별 대응:
- `webServer timeout` → `playwright.config.ts` 의 `webServer.timeout` 을 240_000 로 상향 시도.
- E2E 가 CI 에서만 selector 실패 → `playwright-traces` 아티팩트 다운로드 → 로컬에서 `pnpm exec playwright show-trace` 로 확인.
- `global-setup` 이 OTP 를 못 받으면 → `SUPABASE_SECRET_KEY` secret 이 올바른 값인지, 기존 `e2e@test.local` 유저가 꼬여있지 않은지 확인(dashboard → Auth → Users 에서 `@test.local` 대량 삭제).

---

### Task 14: Vercel 프로젝트 연결 + `vercel.json`

> **근거**: Preview URL 이 PR 에 달리면 리뷰어가 실UI 로 QA 가능. 단일 Supabase 프로젝트 공유 전제라 Preview 도 동일한 `with-key` 키를 쓴다.

**Files:**
- Create: `vercel.json`
- Create: `docs/DEPLOY.md`

- [ ] **Step 1: `vercel.json` 작성**

Create `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["icn1"],
  "cleanUrls": false
}
```

- [ ] **Step 2 (수동): Vercel 프로젝트 import**

https://vercel.com/new → "Import Git Repository" → `with-key` 선택.

설정:
- Framework preset: **Next.js** (자동 감지 확인).
- Install command: `pnpm install --frozen-lockfile`.
- Build command / Output: 기본값.
- Root directory: `./`.

Deploy 는 일단 실패할 것(env 없어서) — 다음 Step 에서 env 채움.

- [ ] **Step 3 (수동): Preview scope env 등록**

Project → Settings → Environment Variables → "Preview" scope 로 다음을 추가(기존 `with-key` 프로젝트 값과 동일):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` 값 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local` 의 동일 값 |
| `SUPABASE_SECRET_KEY` | `.env.local` 의 동일 값 |
| `NEXT_PUBLIC_APP_URL` | `https://$VERCEL_URL` 리터럴 그대로 |
| `NEXT_PUBLIC_APP_CODENAME` | `with-key` |
| `OPENAI_API_KEY` | `sk-dummy-preview` (Day 2 이월; 실연동은 B 트랙) |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `AI_MONTHLY_BUDGET_KRW` | `50000` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `dummy` |
| `VAPID_PRIVATE_KEY` | `dummy` |
| `VAPID_SUBJECT` | `mailto:preview@with-key.local` |

**주의**: `Production` scope 는 **비워둔다**. Production 배포 시도 방지. v1 컷오버 시 별도 ADR 에서 prod 프로젝트 생성 + 이 scope 채움.

- [ ] **Step 4 (수동): Re-deploy 트리거 + Preview URL 확인**

Vercel 대시보드 → Deployments → 최근 실패한 deploy → "Redeploy".

Expected: 성공 후 Deployments 목록에서 Preview 컬럼 URL 클릭 → `/login` 이 200.

- [ ] **Step 5: `docs/DEPLOY.md` 작성**

Create `docs/DEPLOY.md`:

```markdown
# 배포 & Preview 런북

## 환경 매트릭스

| 환경 | Supabase | Vercel scope | URL 패턴 |
|---|---|---|---|
| local | `with-key` (공유) | — | http://localhost:3000 |
| preview | `with-key` (공유) | Preview | https://with-key-git-<branch>-<team>.vercel.app |
| production | `with-key-prod` (v1 컷오버 시 신규 생성) | Production | TBD |

POC 스케일 결정: local/CI/preview 모두 동일한 `with-key` 프로젝트 사용.
`truncate_test_data` 가 `@test.local` 이메일로 스코핑되어 수동 검증 데이터가 보호됨.

## Preview 가 뜨지 않을 때

1. Vercel → Deployments → 해당 커밋의 build log.
2. 대부분은 env 누락. Settings → Environment Variables → **Preview** scope 확인.
3. Build 성공 후 런타임 에러면 Preview URL 의 `/login` 에 직접 접속 → 브라우저 Network 탭.

## Secrets rotation

Supabase publishable 키는 공개 가능. secret 키가 노출된 경우:
1. Supabase → Settings → API → "Generate new secret key".
2. **4곳 동시 교체**: GitHub secrets(`SUPABASE_SECRET_KEY`) · Vercel Preview env · 로컬 `.env.local` · 팀원 공유 비밀번호 관리자.
3. 배포된 preview 는 dummy commit 으로 재빌드 유도.

## Production 컷오버 체크리스트 (v1)

별도 ADR 예정. 최소한:
- `with-key-prod` Supabase 프로젝트 생성 + `pnpm db:push`.
- Vercel Production scope env 를 prod 키로 채움(Preview 와 분리).
- `main` 에 branch protection 강화(approvals=2, required checks 포함).
- Sentry DSN 등록(`NEXT_PUBLIC_SENTRY_DSN`).
- CI secrets 를 prod/ci 로 분리(단일 공유 모델 해제).
```

- [ ] **Step 6: Commit**

```bash
git add vercel.json docs/DEPLOY.md
git commit -m "chore(deploy): add vercel config + DEPLOY runbook"
git push
```

---

### Sprint 5 — 문서 + ADR

---

### Task 15: `ONBOARDING.md` — CI & 배포 섹션 추가

**Files:**
- Modify: `docs/ONBOARDING.md`

- [ ] **Step 1: 현행 섹션 구조 확인**

Run: `grep -n "^##" docs/ONBOARDING.md | head -15`

Expected: 기존 섹션 번호 확인. 새 섹션은 파일 끝에 append 해서 앵커를 깨지 않음.

- [ ] **Step 2: 섹션 append**

Edit `docs/ONBOARDING.md` — 파일 **맨 아래**에 append:

```markdown

## CI & 배포 (Runway 완료 시점)

### GitHub Actions 파이프라인

- `quick` — 모든 PR blocking. 2~5분. lint + typecheck + unit.
- `integration` — repo-owned PR 만 blocking. 5~10분. 원격 `with-key` 프로젝트에 real RLS 질의.
- `e2e` — integration 뒤 실행. Playwright chromium 단일. 8~15분.

### Supabase 프로젝트 분리 정책 (POC 스케일)

현재 `with-key` 프로젝트 **1개**를 local/CI/preview 가 공유한다. 안전 근거는
`truncate_test_data` 가 `@test.local` 이메일로 스코핑되어 있다는 점
([supabase/migrations/0003_state_transitions.sql](../supabase/migrations/0003_state_transitions.sql)).

v1 컷오버 시 `with-key-prod` 를 별도 생성하며, 그때까지는 이 단일 공유 모델 유지.
자세한 배경은 DECISIONS 의 **D-014**.

### 새 개발자 체크리스트

- [ ] `.env.local` 을 팀원에게 요청하거나 Supabase 대시보드에서 직접 채움.
- [ ] `pnpm exec supabase link --project-ref ohvcaytmzzwxkbxsmyny` 로 로컬 link.
- [ ] Vercel 팀에 초대 요청(Preview URL 접근 권한).
- [ ] `gh auth login` 으로 PR 생성 + required check 통과 권한 확인.

### Secrets 를 새로 추가할 때

1. GitHub → Settings → Secrets and variables → Actions 에서 `gh secret set <NAME>`.
2. `.github/workflows/ci.yml` 의 **각 job env 블록**에 새 키를 명시적으로 매핑(secrets 는 자동 전파되지 않음).
3. Vercel → Settings → Environment Variables 에도 동일 값 등록(Preview scope).
4. `scripts/check-env.ts` 의 `REQUIRED` 에 추가(로컬 누락 감지).

### 배포 런북

[docs/DEPLOY.md](./DEPLOY.md).
```

- [ ] **Step 3: Commit**

```bash
git add docs/ONBOARDING.md
git commit -m "docs(onboarding): add CI & deploy section for runway milestone"
```

---

### Task 16: DECISIONS — D-014 / D-015 로그

> **근거**: Day 2 에서 D-013 까지 기록됨. 이 plan 에서 내려진 비자명한 결정 2건만 ADR 로 남긴다(3번째 후보 "Preview 가 shared project 사용" 은 D-014 의 직접 파생이라 별도 ID 불필요).

**Files:**
- Modify: `docs/TEAM_SHARE_DECISIONS.md`

- [ ] **Step 1: 최신 ID 확인**

Run: `grep -n "^## D-" docs/TEAM_SHARE_DECISIONS.md | tail -3`

Expected: `D-013` 이 가장 최근.

- [ ] **Step 2: 2 ADR append**

Edit `docs/TEAM_SHARE_DECISIONS.md` — 파일 **맨 아래**에 append:

```markdown

---

## D-014 — POC 단일 Supabase 프로젝트 공유 (local + CI + preview)

**Status:** Accepted · **Date:** 2026-05-01 · **Owner:** @pistachio8

**Context.** Runway 구축 시점에 원격 Supabase 는 `with-key` 프로젝트 1개만 존재하고 마이그레이션 0001~0006 이 이미 반영되어 있었다. 표준 가이드라인은 dev/ci/prod 3개 분리지만, POC 스케일에서 3개 프로젝트는 과투자다.

**Options considered.**
1. `with-key-ci` 신규 생성 → CI 전용. dev 와 데이터 격리.
2. 단일 프로젝트를 local/CI/preview 가 공유.

**Decision.** Option 2. 안전 근거: `truncate_test_data` RPC([supabase/migrations/0003_state_transitions.sql:53-84](../supabase/migrations/0003_state_transitions.sql#L53-L84)) 가 `email like '%@test.local'` 로 스코핑되어 있어, CI 통합 테스트가 수동 검증 데이터를 지울 수 없다. 분리 운영 비용(2중 프로젝트 관리 · 마이그레이션 2중 apply · link 실수 리스크) > 얻는 격리 이득.

**Consequences.**
- 동일 `SUPABASE_SECRET_KEY` 가 GitHub secrets · Vercel Preview · 로컬 `.env.local` 3곳에 존재. 노출 시 3곳 동시 rotation 필요([docs/DEPLOY.md](../DEPLOY.md)).
- v1 컷오버 시 `with-key-prod` 를 신규 생성하며 이 결정을 D-0xx 로 갱신한다.
- Preview 에서 만든 테스트 row(`e2e+*` 아님 · 리뷰어가 수동으로 만든 실데이터) 는 수동 정리 필요.

## D-015 — E2E 인증: admin generateLink + verifyOtp, 단일 storageState 재사용

**Status:** Accepted · **Date:** 2026-05-01 · **Owner:** @pistachio8

**Context.** E2E 에서 이메일 수신을 실제로 기다리면 Inbucket/Mailtrap 같은 메일 서버가 필요하고 플레이크가 심하다. 반대로 "폼 입력 → 링크 클릭" 전체를 mock 하면 auth 배선 자체의 회귀가 잡히지 않는다.

**Decision.** integration harness([tests/integration/setup.ts](../../tests/integration/setup.ts)) 와 동일한 패턴: `admin.auth.admin.generateLink({ type: "magiclink" })` → OTP 추출 → 브라우저 컨텍스트에서 `verifyOtp` 로 세션 주입. storageState.json 에 저장 후 모든 테스트가 재사용. 별도로 `auth-login.spec.ts` 한 개가 실폼 → 토스트 경로를 단독 커버.

**Consequences.**
- CI 에서 `SUPABASE_SECRET_KEY` 가 필요. POC 스케일에서는 D-014 와 같은 공유 secret 을 사용(권한 경계가 명확해지면 분리).
- 프로덕션 E2E 는 이 패턴 **사용 불가**(prod 에서는 service_role 을 CI 에 노출하면 안 됨). v1 에서는 seed user + password 또는 Supabase SSO 테스트 유틸로 재설계 예정.
- `@test.local` 도메인은 `truncate_test_data` 에 hardcoded 되어 있으므로 E2E 가 만드는 모든 유저도 이 도메인을 사용해야 자동 정리됨.
```

- [ ] **Step 3: 검증**

Run: `grep -n "^## D-01[4-5]" docs/TEAM_SHARE_DECISIONS.md`

Expected: `D-014`, `D-015` 2 줄.

- [ ] **Step 4: Commit + PR ready**

```bash
git add docs/TEAM_SHARE_DECISIONS.md
git commit -m "docs(decisions): log D-014/D-015 — shared supabase project, e2e auth pattern"
git push
gh pr ready 2>/dev/null || true
```

PR 설명에 Runway 체크리스트 추가:

```markdown
## Runway 달성 확인
- [x] GitHub secrets 등록 (SUPABASE_URL/_PUBLISHABLE_KEY/_SECRET_KEY/_ACCESS_TOKEN/_DB_PASSWORD)
- [x] CI `quick` (lint + type + unit) green
- [x] CI `integration` (shared with-key) green
- [x] CI `e2e` (Playwright chromium) green
- [x] Vercel Preview URL 접근 가능
- [x] `docs/DEPLOY.md` · `docs/ONBOARDING.md` 업데이트
- [x] D-014 / D-015 로그됨
```

---

## 3. Out of Scope (이 계획에서 하지 않는 것)

- **`with-key-prod` Supabase 프로젝트 생성** — v1 컷오버 직전 별도 ADR + plan.
- **Production Vercel 환경변수 매핑** — 위와 함께.
- **Sentry / 관측** — `SENTRY_DSN` 은 `.env.example` 의 placeholder 만. 배선은 별도 plan.
- **OpenAI 실연동 / Web Push 실연동** — Day 2 이월. B 트랙.
- **pgTAP RLS 스냅샷 테스트** — C 트랙.
- **Lighthouse CI / CWV 기준선** — C 트랙.
- **Playwright webkit / firefox / visual regression** — v1.
- **CI 에서의 accessibility 회귀(axe-core)** — C 트랙.
- **Secrets rotation 자동화** — 수동 절차만 `DEPLOY.md` 에 문서화.
- **Forked PR 에서의 integration/e2e 실행** — secret 미노출 기본 정책 유지.

## 4. Follow-up (다음 PR 후보)

- [ ] B 트랙: OpenAI `submitActionLog` 실연동 + rate limit + budget guard.
- [ ] B 트랙: Web Push 실키 + subscribe 플로 + `notifications` 테이블.
- [ ] C 트랙: pgTAP RLS 회귀 스냅샷.
- [ ] C 트랙: Lighthouse CI + CWV 아티팩트.
- [ ] C 트랙: nonce 기반 CSP 적용.
- [ ] 접근성: axe-core Playwright integration + `/login`, `/challenge/new` 회귀.
- [ ] v1 컷오버: `with-key-prod` 생성 + Vercel Production scope + Sentry + D-014 갱신.
- [ ] Preview 배너: 현재 커밋 SHA + DB 대상 표시(리뷰어 오해 방지).

---

## 5. 자체 검토 (Self-Review)

### 5.1 Spec coverage

- **원격 Supabase 연결** → Day 2 에서 이미 완료. Section 0 에서 명시, 이 plan 에서는 secret 등록만 수행(Task 1) ✅
- **GitHub Actions CI (lint/type/unit)** → Task 2, 3 ✅
- **GitHub Actions CI (integration + RLS)** → Task 4, 5, 6 ✅
- **Playwright E2E (magic link · challenge · pledge)** → Task 7, 8, 9, 10, 11, 12 ✅
- **E2E CI job** → Task 13 ✅
- **Vercel preview 배포** → Task 14 ✅
- **문서(`ONBOARDING`, `DEPLOY`, ADR)** → Task 15, 16 ✅

### 5.2 Placeholder scan

- TBD — 의도적 1곳: `docs/DEPLOY.md` "Production URL 패턴 TBD"(v1 컷오버 전까지 결정 불가).
- "add appropriate error handling" / "similar to Task N" — 없음.
- 모든 Step 에 완전한 코드 블록 · Run 명령 · Expected 출력 존재.

### 5.3 Type consistency

- CI env var 이름: 단일 프로젝트 공유 전제에 맞춰 **모두 `SUPABASE_*` (CI 접두 제거)**. Task 1 (secret 등록) · Task 5 (apply-migrations.sh) · Task 6 (integration job) · Task 13 (e2e job) 에서 동일.
- `tests/e2e/.auth/user.json` 경로는 `playwright.config.ts` · `global-setup.ts` · `.gitignore` 에서 일치.
- fixture 의 `groupId: string` 는 `challenge-create.spec.ts` · `pledge-sign.spec.ts` consumer 와 정렬.
- `/api/me` 응답 `{ id: string, email: string | null }` 는 fixture 의 `userId` 추출 로직과 일치.
- `groups` insert 컬럼은 `owner_id` (Task 10 Step 1 에서 schema 확인 지시 포함).

### 5.4 POC 스케일 검토 (이번 플랜 특이)

- "신규 Supabase 프로젝트 생성" 단계 **전부 제거**됨. 기존 `with-key` 프로젝트(ref `ohvcaytmzzwxkbxsmyny`) 하나를 공유.
- `@test.local` scope 덕에 CI 가 preview 데이터를 파괴하지 않음(D-014 근거).
- dev/prod 분리는 v1 컷오버 plan 에서 한 번에 수행하도록 Follow-up 에 명시.

---

## 6. 실행 핸드오프

**Plan complete and saved to `docs/superpowers/plans/2026-05-01-runway-deploy-ci-e2e.md`. Two execution options:**

**1. Inline Execution + 3 Batch (권장)** — 수동 step 이 4회(Task 1 Step 1-2, Task 3 Step 6, Task 14 Step 2-4, Task 16 Step 4). inline 연속 실행이 가장 빠름.

- **Batch A**: Task 1~3 (secrets + CI quick). 끝나면 `gh pr checks` 로 `Lint + Type + Unit` green 확인.
- **Batch B**: Task 4~6 (CI integration). 끝나면 `Integration (shared with-key project)` green 확인.
- **Batch C**: Task 7~16 (E2E + Vercel + 문서). Task 14 의 Vercel 연결이 수동이라 이 사이에 사람이 1회 개입. 나머지는 연속.

**2. Subagent-Driven (하이브리드)** — 수동 step 을 사람에게 넘기고 나머지만 subagent 로. Task 별 컨텍스트가 작아 품질은 나쁘지 않지만, CI yaml 은 `quick → integration → e2e` 한 파일에 누적되므로 subagent 가 Task 3/6/13 사이의 **이전 job 블록을 보존해야** 한다(프롬프트에 강조 필요).

**어느 방식으로 진행할까요?**
