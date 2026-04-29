# DB + BFF 실배선 구현 계획 (Day 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `2026-04-28-ui-proto-alignment.md` 에서 만든 mock Server Action 3종(`createChallenge`·`signPledge`·`submitActionLog`)과 3개 read 지점(`home.fetchActiveChallenge`·`challenge/[id].MOCK_DETAIL`·`pledge.mock`)을 실제 Supabase Postgres + RLS 에 배선하고, 이 과정에서 RLS 회귀 방어를 가능하게 하는 integration test harness + 읽기 전용 BFF 레이어(`src/lib/db/reads/*`)를 구축한다.

**Architecture:**

- **순서 역전**: "테이블 먼저 → 정책 나중 → 쿼리 나중" 이 아니라 **Auth 실배선 + harness → RLS contract 확정 → DDL → BFF write → BFF read** 순. 이유: RLS 가 프로젝트의 진짜 보안 경계인데, real auth 없이는 한 줄의 정책도 검증이 불가능하고, forward-only 마이그레이션 규칙(ONBOARDING §4.3) 때문에 나중에 정책 drift 를 역으로 쫓는 비용이 크다.
- **BFF 분리**: Write 는 기존 Server Action + Zod + `withUser` + `ActionResult<T>` 패턴 재사용(Batch A 계약 유지). Read 는 `src/lib/db/reads/*.ts` 에 RSC 친화적 함수로 모으고, page component 는 supabase-js 를 **직접 부르지 않는다**(cache/materialized view 교체 여지 확보).
- **Error taxonomy 확장**: 현재 `unauthorized | invalid_input` 2 코드 → `+ forbidden | conflict | not_found | upstream_error` 4 코드 추가. RLS denial · unique 충돌 · FK 위반 · AI 실패를 기계 코드로 분류.
- **Transaction 경계**: `signPledge` 의 "마지막 서명자면 active 전이" 같은 다중 쓰기는 Postgres RPC(`SECURITY INVOKER`)로 내려 race condition 방어. RPC 안에서도 RLS 가 `auth.uid()` 로 재확인되므로 권한 경계 유지.

**Tech Stack:** Next.js 16 App Router · Supabase (Postgres 15 + RLS + Auth + Storage) · Supabase CLI 2.x (로컬 dev) · @supabase/ssr · Zod · Vitest (단위 + `integration` project) · pgTAP(선택) · TypeScript strict.

---

## 0. 사전 이해 — 이 plan 이 해결하는 것

세 세션 실행 결과 현재 repo 의 공백:

1. **Auth 실배선 없음**: `pnpm dev` 가 `DEV_BYPASS_AUTH=1` 로 layout guard 를 우회 중. `.env.local` 에 Supabase publishable/secret key 없음.
2. **0001/0002 마이그레이션 빈 스텁**: 주석만 있고 DDL 없음. `supabase/seed.sql` 도 없음.
3. **3 Server Action 이 mock UUID 반환**: DB insert 없고 `crypto.randomUUID()` 로 id 만 생성.
4. **3 read 지점이 inline mock**: `fetchActiveChallenge()`·`MOCK_DETAIL`·`mock` 이 하드코딩. 교체 지점은 명시됨.
5. **RLS 정책 없음**: `BE_SCHEMA §7` 에 matrix 만 있고 실제 `CREATE POLICY` 문 없음.
6. **Error taxonomy 2 코드**: `unauthorized` / `invalid_input` 뿐. RLS deny, FK 위반, AI 실패를 분류할 code 없음.
7. **Integration test harness 없음**: Batch A/B/C 의 71 tests 는 모두 단위/컴포넌트 테스트. DB 호출은 0 건.

---

## 0.5 실행 가드레일 (Pre-flight)

### 의존성 순서 (반드시 이 순서로)

```
S0 (Auth + harness) → S1 (RLS contract) → S2 (DDL) → S3 (write BFF) → S4 (read BFF) → S5 (ownership/error taxonomy)
```

- S0 을 건너뛰고 S2 먼저 하면 정책 회귀 검증 수단이 없어진다.
- S1 을 건너뛰고 S2 먼저 하면 테이블 shape 요구가 역류해 `0003_*.sql` 부담이 커진다.
- S3 을 S4 보다 먼저: write 가 실DB 에 들어가야 read 가 볼 데이터가 생긴다.
- S5 는 S3/S4 가 **RLS 실패를 실제로 겪은 뒤** 타당 분류가 드러난 시점에 설계한다(premature taxonomy 회피).

### Task × ECC 에이전트 매핑

| Sprint | Task | ECC 호출 | 체크 포인트 |
|---|---|---|---|
| S0 | 1~4 (auth harness) | security-reviewer | `.env.local` 누수 여부, `supabase start` 포트 노출 |
| S1 | 5 (RLS contract) | type-design-analyzer + database-reviewer | matrix 가 predicate 로 번역 가능한지, 인덱스 필요량 |
| S2 | 6~8 (DDL) | database-reviewer + security-reviewer | 인덱스 배치 + RLS 전 테이블 ON |
| S3 | 9~11 (write) | security-reviewer + silent-failure-hunter | RLS deny → ActionResult.error 매핑, race condition |
| S4 | 12~14 (read) | /code-review | RSC 경계 유지, cache 전략 |
| S5 | 15~16 (error taxonomy) | type-design-analyzer | discriminated union 회귀 |
| 최종 | 17 (/verify) | /verify | 통합 검증 |
| 최종 | 18 (DECISIONS) | architecture-decision-records | **D-011 / D-012 / D-013** 로그 |

### 환경 가드

- [ ] `supabase` CLI 는 `devDependency` 로 이미 설치됨(`pnpm-lock.yaml` 확인). `pnpm exec supabase --version` 으로 버전 확인.
- [ ] Docker Desktop 실행 중 (supabase 로컬은 docker 컨테이너).
- [ ] `.env.local` 은 **반드시 gitignore 됨**(`.gitignore` 최상단에 `.env.local` 엔트리 존재 확인). 실 credential 커밋 금지.
- [ ] `DEV_BYPASS_AUTH=1` 은 **S0 Task 4 에서 제거**됨. S3 이후로는 real auth 만 쓴다.

---

## 1. File Structure

### 1.0 환경/하니스 (Sprint 0)

- Create: `.env.local` — **커밋 금지**(`.gitignore` 대상). 실제 Supabase 로컬 키로 채움.
- Modify: `.env.example` — Supabase 로컬 개발용 샘플 값 주석 추가.
- Modify: `package.json` — `test:integration` script · `db:start` · `db:reset` · `db:types` script 추가.
- Create: `tests/integration/setup.ts` — supabase-js 테스트 클라이언트 헬퍼, `asUser(uid)` 팩토리.
- Create: `tests/integration/factories.ts` — `createUser()`·`createGroup()`·`createChallenge()` 테스트 팩토리.
- Modify: `vitest.config.ts` — `projects` 로 `unit`(기존)·`integration`(node + 순차 실행) 분리.
- Create: `supabase/config.toml` — `supabase init` 자동 생성. `site_url` 만 조정.
- Modify: `scripts/check-env.ts` — 로컬 개발 전용 경고 메시지 추가.

### 1.1 RLS Contract 문서 (Sprint 1)

- Create: `docs/BE_SCHEMA_RLS.md` — 테이블별 SELECT/INSERT/UPDATE/DELETE matrix 를 **실제 predicate 의사코드**로 정리. `BE_SCHEMA.md §7` 의 matrix 를 predicate 단위로 확장.

### 1.2 마이그레이션 + 타입 (Sprint 2)

- Modify: `supabase/migrations/0001_init.sql` — `BE_SCHEMA §5` 의 10 테이블 + 제약 + `BE_SCHEMA §6` 의 8 인덱스 + `BE_SCHEMA §7` 의 UPDATE 가드(`action_logs` 5분·`challenges.status` 전이 금지).
- Modify: `supabase/migrations/0002_rls.sql` — `is_group_member` 헬퍼 + 10 테이블 RLS 정책 (BE_SCHEMA §7 matrix 기준).
- Create: `supabase/migrations/0003_state_transitions.sql` — `sign_and_maybe_activate(p_challenge_id uuid)` RPC 함수. `signPledge` 의 "마지막 서명자면 active" 원자 전이.
- Create: `supabase/seed.sql` — no-op placeholder (실제 유저는 magic link 로 생성).
- Create: `src/types/supabase.ts` — `supabase gen types typescript --local` 결과 checked-in.

### 1.3 BFF Write 레이어 (Sprint 3)

- Modify: `src/lib/actions/response.ts` — error taxonomy 확장 (`ErrorCode` 유니언 export).
- Modify: `src/lib/actions/response.spec.ts` — 새 코드 회귀 테스트.
- Create: `src/lib/actions/supabase-error.ts` — Supabase error 를 `ActionResult.error` 기계 코드로 매핑(`42501`·`23505`·`23503`·`PGRST116`).
- Create: `src/lib/actions/supabase-error.spec.ts`
- Modify: `src/lib/actions/error-messages.ts` — 6 코드 모두 한국어 카피.
- Modify: `src/lib/actions/error-messages.spec.ts`
- Modify: `src/app/(app)/challenge/new/_actions.ts` — mock 제거, 실 insert.
- Modify: `src/app/(app)/challenge/new/page.tsx` — submit 호출부에 `groupId` 파라미터 주입.
- Modify: `src/app/(app)/pledge/_actions.ts` — 실 RPC 호출.
- Modify: `src/app/(app)/action/_actions.ts` — 실 insert + ownership 이중 방어.
- Create: `tests/integration/actions/create-challenge.spec.ts`
- Create: `tests/integration/actions/sign-pledge.spec.ts`
- Create: `tests/integration/actions/submit-action-log.spec.ts`

### 1.4 BFF Read 레이어 (Sprint 4)

- Create: `src/lib/db/reads/active-challenge.ts` — `fetchActiveChallenge(userId)` 단일 함수.
- Create: `src/lib/db/reads/challenge-detail.ts` — `fetchChallengeDetail(challengeId)`.
- Create: `src/lib/db/reads/pledge.ts` — `fetchPendingPledge(userId)`.
- Create: `tests/integration/reads/active-challenge.spec.ts`
- Modify: `src/app/(app)/home/page.tsx` — inline mock 제거, BFF import.
- Modify: `src/app/(app)/challenge/[id]/page.tsx` — `MOCK_DETAIL` 제거, BFF import.
- Modify: `src/app/(app)/pledge/page.tsx` — mock 제거, BFF import.
- Create: `src/app/(app)/pledge/_components/pledge-sheet.tsx` — client state 분리.

### 1.5 Kudos + 검증 + 문서 (Sprint 5)

- Create: `src/app/(app)/challenge/[id]/_actions.ts` — `toggleKudos`.
- Create: `tests/integration/actions/give-kudos.spec.ts`
- Modify: `docs/TEAM_SHARE_DECISIONS.md` — **D-011 / D-012 / D-013** append.

### 1.6 Auth (Sprint 0 Task 2)

- Create: `src/app/(auth)/login/_actions.ts` — `requestMagicLink`.
- Create: `src/app/auth/callback/route.ts` — OTP code 교환.
- Modify: `src/app/(auth)/login/page.tsx` — 이메일 입력 배선.
- Modify: `src/app/(app)/layout.tsx` — DEV_BYPASS_AUTH 분기 제거.
- Modify: `package.json` — `dev` script 에서 `DEV_BYPASS_AUTH=1` 제거.

---

## 2. Tasks

### Sprint 0 — Auth 실배선 + Integration Test Harness

---

### Task 1: Supabase 로컬 스택 기동 + `.env.local` 세팅

> **근거**: RLS 정책은 `auth.uid()` 를 참조한다. 실제 auth 없이는 한 줄도 검증할 방법이 없다. 로컬 Supabase 를 docker 로 띄우고 발급되는 key 를 `.env.local` 에 넣어 이후 모든 작업의 기반을 만든다.

**Files:**

- Modify: `package.json` (scripts 섹션)
- Create: `.env.local` (gitignore 대상)
- Modify: `.env.example`
- Modify: `scripts/check-env.ts`

- [ ] **Step 1: `.gitignore` 확인**

Run: `grep -E '^\.env\.local|^\.env$' .gitignore`
Expected: `.env.local` 포함. 없으면 `.env.local` 한 줄 추가.

- [ ] **Step 2: `supabase init` 실행**

Run: `pnpm exec supabase init`
Expected: `supabase/config.toml` 생성. 이미 존재하면 "already initialized" 메시지만 보고 skip.

- [ ] **Step 3: `supabase start` 로 로컬 스택 기동**

Run: `pnpm exec supabase start`
Expected: 30~60초 후 다음 형태 출력:

```
         API URL: http://127.0.0.1:54321
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      JWT secret: super-secret-...
        anon key: eyJhbGciOi...
service_role key: eyJhbGciOi...
```

출력된 **anon key** 와 **service_role key** 를 복사(로컬 전용 임의 값 → 공개해도 안전).

- [ ] **Step 4: `.env.local` 생성**

Create `.env.local` with the following content, replacing the placeholders with Step 3 output:

```dotenv
# --- App ---
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_CODENAME=with-key

# --- Supabase (local via `supabase start`) ---
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<STEP_3_ANON_KEY>
SUPABASE_SECRET_KEY=<STEP_3_SERVICE_ROLE_KEY>

# --- OpenAI (Day 2 이월, 일단 더미) ---
OPENAI_API_KEY=sk-dummy-day2
OPENAI_MODEL=gpt-4o-mini
AI_MONTHLY_BUDGET_KRW=50000

# --- Web Push (Day 2 이월) ---
NEXT_PUBLIC_VAPID_PUBLIC_KEY=dummy
VAPID_PRIVATE_KEY=dummy
VAPID_SUBJECT=mailto:wjaden0107@gmail.com

# --- KakaoPay (Day 2 이월) ---
NEXT_PUBLIC_KAKAOPAY_SEND_URL=
```

- [ ] **Step 5: `package.json` scripts 확장**

Edit `package.json` `"scripts"` 블록 전체를 다음으로 교체 (기존 `dev` 에서 `DEV_BYPASS_AUTH=1` **제거**):

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run --project unit",
  "test:integration": "vitest run --project integration",
  "test:watch": "vitest",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:reset": "supabase db reset",
  "db:types": "supabase gen types typescript --local > src/types/supabase.ts"
}
```

> `DEV_BYPASS_AUTH=1` 제거 사유: Task 2 이후 real auth 가 동작하므로 우회 불필요. 2848772 커밋의 "OAuth 이전 임시" 목적 완료.

- [ ] **Step 6: `.env.example` 주석 갱신**

Edit `.env.example` — `# --- Supabase ---` 섹션의 4줄(6~9행)을 다음으로 교체:

```dotenv
# --- Supabase ---
# 로컬 개발: `pnpm db:start` 출력의 API URL 과 anon key / service_role key 사용.
# 프로덕션: Supabase Dashboard → Settings → API.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...                                # 서버 전용 — sb_secret_* 형식 (레거시 SERVICE_ROLE_KEY 대체)
```

- [ ] **Step 7: `scripts/check-env.ts` 에 로컬 안내 추가**

Replace `scripts/check-env.ts` 전체:

```ts
// 필수 env 변수 존재 여부만 확인. 값 유효성은 런타임에.
const REQUIRED = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "OPENAI_API_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error("Missing env:", missing.join(", "));
  process.exit(1);
}

if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1")) {
  console.log("env OK (local Supabase — run `pnpm db:start` if not already running)");
} else {
  console.log("env OK");
}
```

- [ ] **Step 8: 수동 확인**

Run: `pnpm dev`
Expected: `http://localhost:3000/login` 이 정상 렌더. 비로그인 상태로 `/home` 접근 시 `/login` 리다이렉트(더 이상 BYPASS 안 됨).

- [ ] **Step 9: `git status` 로 `.env.local` 미추적 확인**

Run: `git status --porcelain .env.local`
Expected: `?? .env.local` (untracked). 만약 `A` 또는 `M` 이면 즉시 `.gitignore` 재확인.

- [ ] **Step 10: Commit**

```bash
git add package.json .env.example scripts/check-env.ts supabase/config.toml .gitignore
git commit -m "chore(supabase): wire local dev stack and remove DEV_BYPASS_AUTH"
```

> `.env.local` 은 **커밋하지 않는다**.

---

### Task 2: Magic Link 로 로컬 로그인 동작

> **근거**: 카카오 OAuth 프로비저닝은 외부 계정·redirect URL 설정이 필요해 Day 2 범위 밖. 로컬 dev 는 Supabase 내장 email OTP(magic link) 로 충분. 프로덕션 OAuth 는 별도 PR(이월).

**Files:**

- Create: `src/app/(auth)/login/_actions.ts`
- Create: `src/app/auth/callback/route.ts`
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Server Action 작성**

Create `src/app/(auth)/login/_actions.ts`:

```ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionResult } from "@/lib/actions/response";

const emailSchema = z.string().email();

export async function requestMagicLink(email: string): Promise<ActionResult<{ sent: true }>> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return failure("invalid_input", { email: ["이메일 형식이 올바르지 않아요."] });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    console.error("[requestMagicLink] supabase error:", error.message);
    return failure("upstream_error");
  }
  return success({ sent: true });
}
```

- [ ] **Step 2: Callback route 작성**

Create `src/app/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error("[auth/callback] exchange failed:", error.message);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
```

- [ ] **Step 3: Login 페이지 재작성**

Replace `src/app/(auth)/login/page.tsx` 전체:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestMagicLink } from "./_actions";
import { makeUserMessage, FALLBACK_ERROR_MESSAGE } from "@/lib/actions/error-messages";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const messages = makeUserMessage();

  function submit() {
    startTransition(async () => {
      try {
        const res = await requestMagicLink(email);
        if (!res.ok) {
          toast.error(messages[res.error] ?? FALLBACK_ERROR_MESSAGE);
          return;
        }
        toast.success(
          "로그인 링크를 보냈어요. 메일함(Inbucket http://127.0.0.1:54324)을 확인해주세요.",
        );
      } catch (e) {
        console.error(e);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col justify-between px-6 py-10">
      <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-4xl font-black tracking-tight">윗키</h1>
        <p className="text-muted-foreground break-keep">친구와 함께하는 운동 서약서</p>
      </section>

      <section className="flex flex-col gap-3">
        <Button size="lg" disabled className="h-12 w-full bg-[#FEE500] text-[#191919]">
          <MessageCircle aria-hidden />
          카카오로 시작하기 (v1)
        </Button>
        <div className="flex flex-col gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-12"
            aria-label="이메일"
          />
          <Button
            size="lg"
            variant="outline"
            className="h-12 w-full"
            onClick={submit}
            disabled={pending || email.length === 0}
          >
            {pending ? "링크 보내는 중..." : "이메일로 로그인 링크 받기"}
          </Button>
        </div>
        <p className="text-muted-foreground text-center text-xs">
          계속하면 개인정보 처리방침에 동의한 것으로 간주돼요.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: 수동 확인**

Run: `pnpm dev`
1. `/login` 에서 `test@example.com` 입력 → "이메일로 로그인 링크 받기".
2. `http://127.0.0.1:54324` (Inbucket) 에서 이메일 확인 → 링크 클릭.
3. `/home` 으로 리다이렉트, 세션 유지.

Expected: 전부 성공. 실패 시 `pnpm exec supabase logs` 로 컨테이너 로그 확인.

- [ ] **Step 5: typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/login/page.tsx" "src/app/(auth)/login/_actions.ts" "src/app/auth/callback/route.ts"
git commit -m "feat(auth): wire magic link sign-in for local dev"
```

---

### Task 3: Integration test harness — vitest projects 분리 + `asUser`

> **근거**: 단위 테스트(jsdom)와 integration 테스트(node + 실 DB)는 환경·격리 요구가 다르다. vitest 의 `projects` 로 분리해 `pnpm test` 는 빠른 단위만, `pnpm test:integration` 은 순차 실행.

**Files:**

- Modify: `vitest.config.ts`
- Create: `tests/integration/setup.ts`
- Create: `tests/integration/factories.ts`
- Create: `tests/integration/harness.spec.ts`

- [ ] **Step 1: vitest 설정 분리**

Replace `vitest.config.ts` 전체:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          environmentMatchGlobs: [
            ["**/*.spec.tsx", "jsdom"],
            ["**/_components/**", "jsdom"],
            ["**", "node"],
          ],
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: ["tests/integration/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          include: ["tests/integration/**/*.{test,spec}.ts"],
          fileParallelism: false,
          hookTimeout: 30_000,
          testTimeout: 30_000,
          setupFiles: ["tests/integration/setup.ts"],
        },
      },
    ],
  },
});
```

- [ ] **Step 2: 하니스 헬퍼 작성**

Create `tests/integration/setup.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll } from "vitest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;

if (!ANON_KEY || !SERVICE_ROLE) {
  throw new Error(
    "integration tests require NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY from .env.local",
  );
}

// admin: RLS 우회. factory 에서 seed 할 때만 사용.
export const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// anon client 를 유저별로 sign in 시켜 반환.
export async function asUser(userId: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: `${userId}@test.local`,
  });
  if (error) throw error;
  const otp = data.properties?.email_otp;
  if (!otp) throw new Error("no email_otp");
  const verify = await client.auth.verifyOtp({
    email: `${userId}@test.local`,
    token: otp,
    type: "magiclink",
  });
  if (verify.error) throw verify.error;
  return client;
}

async function resetDb() {
  const { error } = await admin.rpc("truncate_test_data");
  if (error) throw error;
}

beforeAll(async () => {
  const { error } = await admin.from("users").select("id").limit(1);
  if (error && error.code === "42P01") {
    throw new Error(
      "integration tests expect migrations applied — run `pnpm db:reset` before tests",
    );
  }
});

afterEach(async () => {
  await resetDb();
});

export function expectRlsDenied(err: unknown) {
  if (!err || typeof err !== "object") throw new Error("expected an error");
  const code = (err as { code?: string }).code;
  if (code !== "42501" && code !== "PGRST116") {
    throw new Error(`expected RLS denial, got code=${code}`);
  }
}
```

- [ ] **Step 3: 팩토리 작성**

Create `tests/integration/factories.ts`:

```ts
import { admin } from "./setup";

export async function createUser(opts: { displayName?: string } = {}) {
  const suffix = Math.random().toString(36).slice(2, 10);
  const email = `u-${suffix}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;
  const { error: insertErr } = await admin.from("users").insert({
    id: userId,
    display_name: opts.displayName ?? `User-${userId.slice(0, 4)}`,
  });
  // handle_new_auth_user trigger 가 이미 insert 했을 수 있으므로 unique 충돌은 무시.
  if (insertErr && insertErr.code !== "23505") throw insertErr;
  return { id: userId, email };
}

export async function createGroup(ownerId: string, opts: { name?: string } = {}) {
  const { data, error } = await admin
    .from("groups")
    .insert({ owner_id: ownerId, name: opts.name ?? "테스트 그룹" })
    .select()
    .single();
  if (error) throw error;
  await admin.from("group_members").insert({
    group_id: data.id,
    user_id: ownerId,
    role: "owner",
  });
  return data as { id: string; owner_id: string; name: string };
}

export async function addMember(groupId: string, userId: string) {
  const { error } = await admin
    .from("group_members")
    .insert({ group_id: groupId, user_id: userId, role: "member" });
  if (error) throw error;
}

export async function createPendingChallenge(
  groupId: string,
  opts: { title?: string; penaltyAmount?: number; durationDays?: number; goalCount?: number } = {},
) {
  const { data, error } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: opts.title ?? "주 3회 헬스장",
      type: "fitness",
      goal_count: opts.goalCount ?? 3,
      duration_days: opts.durationDays ?? 7,
      penalty_amount: opts.penaltyAmount ?? 3000,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; group_id: string; status: string };
}
```

- [ ] **Step 4: Smoke test 작성**

Create `tests/integration/harness.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { asUser } from "./setup";
import { createUser } from "./factories";

describe("integration harness", () => {
  it("creates an auth user and signs in", async () => {
    const u = await createUser({ displayName: "해리스" });
    const client = await asUser(u.id);
    const { data, error } = await client.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(u.id);
  });

  it("isolates between tests (afterEach truncate)", async () => {
    const u = await createUser();
    expect(u.id).toBeTruthy();
  });
});
```

- [ ] **Step 5: 지금은 실행하지 않는다**

> 이 Task 는 설정 준비까지. 실행은 Task 8 (DDL + RLS + `truncate_test_data` RPC 완료) 이후. 지금 실행하면 "truncate_test_data 미존재" 로 실패하는 것이 정상.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/integration/setup.ts tests/integration/factories.ts tests/integration/harness.spec.ts
git commit -m "test(harness): add integration test harness with asUser and factories"
```

---

### Task 4: 기존 `(app)/layout.tsx` 의 DEV_BYPASS_AUTH 분기 제거

> **근거**: Task 1 에서 `pnpm dev` 의 env prefix 를 뺐고, Task 2 에서 real auth 가 동작한다. double-guard 가 있지만 분기 자체를 없애는 편이 안전.

**Files:**

- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: 기존 분기 확인**

Run: `grep -n DEV_BYPASS_AUTH "src/app/(app)/layout.tsx"`
Expected: 2~3 줄 매치 (guard 분기 + warning 로그).

- [ ] **Step 2: 분기 제거, guard 본체만 남기기**

Replace `src/app/(app)/layout.tsx` 전체:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/app-shell/bottom-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col">
      <main id="main" className="flex-1">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 3: 수동 확인**

Run: `pnpm dev`
비로그인 → `/home` → `/login` 리다이렉트.
Task 2 의 magic link 로 로그인 → `/home` 진입(아직 mock 데이터이지만 렌더 확인).

- [ ] **Step 4: typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "chore(auth): remove DEV_BYPASS_AUTH now that magic link works"
```

---

### Sprint 1 — RLS Contract 확정

---

### Task 5: `docs/BE_SCHEMA_RLS.md` 작성 — 정책 predicate + 인덱스 요구

> **근거**: `BE_SCHEMA §7` 의 matrix 는 "누가 무엇을 읽고 쓰는가" 를 요약하지만 **SQL predicate 수준으로는 번역되지 않았음**. DDL 작성 전에 predicate 의사코드와 그를 값싸게 만드는 인덱스 요구를 문서로 박는다. Task 6/7 은 이 문서를 그대로 SQL 로 옮기는 작업.

**Files:**

- Create: `docs/BE_SCHEMA_RLS.md`

- [ ] **Step 1: 문서 작성**

Create `docs/BE_SCHEMA_RLS.md`:

````markdown
# BE_SCHEMA RLS Policy Contract

> **문서 상태**: Draft v0.1 · **작성일**: 2026-04-30
> **상위**: [BE_SCHEMA.md](./BE_SCHEMA.md) §7
> **역할**: `BE_SCHEMA §7` 의 matrix 를 실제 `CREATE POLICY` predicate 수준으로 구체화. `0002_rls.sql` 은 이 문서를 SQL 로 옮긴 결과.

## 0. 공통 헬퍼

```sql
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql stable security invoker
set search_path = public as $$
  select exists(
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;
```

- **`stable`**: 같은 트랜잭션 내 결과 재사용 허용 → planner 가 caller predicate 와 결합 효율화.
- **`security invoker`**: 호출자의 RLS 가 `group_members` 에도 적용.

## 1. 테이블별 정책

### 1.1 `users`
| Op | Predicate | 인덱스 요구 |
|---|---|---|
| SELECT | `id = auth.uid() OR EXISTS(gm1 JOIN gm2 ON group_id WHERE gm1.user_id = auth.uid() AND gm2.user_id = users.id)` | `group_members(user_id, group_id)` |
| INSERT | `id = auth.uid()` | — |
| UPDATE | `id = auth.uid()` (USING + WITH CHECK) | — |
| DELETE | `false` | — |

### 1.2 `groups`
| Op | Predicate |
|---|---|
| SELECT | `is_group_member(id)` |
| INSERT | `owner_id = auth.uid()` (WITH CHECK) |
| UPDATE | `owner_id = auth.uid()` (USING + WITH CHECK) |
| DELETE | `false` |

### 1.3 `group_members`
| Op | Predicate |
|---|---|
| SELECT | `is_group_member(group_id)` |
| INSERT | service_role only (초대 수락 Server Action 경유) |
| UPDATE | `false` |
| DELETE | `user_id = auth.uid() OR EXISTS(groups.owner_id = auth.uid())` |

### 1.4 `invites`
| Op | Predicate |
|---|---|
| SELECT | owner only |
| INSERT | owner only |
| UPDATE | `false` |
| DELETE | owner only |

### 1.5 `challenges`
| Op | Predicate |
|---|---|
| SELECT | `is_group_member(group_id)` |
| INSERT | owner only (WITH CHECK) |
| UPDATE | `status='pending'` AND owner AND NEW.status IN ('pending','accepted') |
| DELETE | `false` |

> `accepted→active` 전이는 RPC(`sign_and_maybe_activate`) 에서 `security invoker` 로 수행. 정책은 해당 RPC 내부 UPDATE 만 허용하도록 인수 검증.

### 1.6 `challenge_participants`
| Op | Predicate |
|---|---|
| SELECT | `is_group_member(challenges.group_id)` via inner join |
| INSERT | service_role only |
| UPDATE | `user_id = auth.uid()` (signed_at 만 변경) |
| DELETE | `false` |

### 1.7 `action_logs`
| Op | Predicate |
|---|---|
| SELECT | `is_group_member(challenges.group_id)` |
| INSERT | `user_id = auth.uid()` AND challenge active AND 기간 내 |
| UPDATE | `user_id = auth.uid()` AND `created_at > now() - interval '5 minutes'` |
| DELETE | `false` (PRD §4.3 AC-6) |

> AI 컬럼(ai_summary, template_fallback, regenerate_count, prompt_version)의 클라이언트 변경 차단은 BEFORE UPDATE 트리거(`prevent_ai_column_update`)로 방어 — RLS 가 column-level 제한을 직접 표현할 수 없음.

### 1.8 `kudos`
| Op | Predicate |
|---|---|
| SELECT | `is_group_member(challenges.group_id)` via action_logs JOIN |
| INSERT | `user_id = auth.uid()` AND `action_log.user_id != auth.uid()` AND 같은 그룹 |
| UPDATE | `false` |
| DELETE | `user_id = auth.uid()` (토글 취소) |

### 1.9 `push_subscriptions`
| Op | Predicate |
|---|---|
| ALL | `user_id = auth.uid()` |

### 1.10 `events`
| Op | Predicate |
|---|---|
| SELECT | service_role only |
| INSERT | `user_id = auth.uid() OR user_id IS NULL` |
| UPDATE/DELETE | `false` |

## 2. 인덱스 요약

`BE_SCHEMA §6` 의 8 인덱스 전부 필요 + 추가:

- **`group_members(user_id, group_id)`** — `users` SELECT 정책 inner loop 가속. §6 에 누락되어 있으므로 `0001_init.sql` 에 추가.

## 3. Realtime publication (POC 결정)

POC 범위 **비활성**. 이유: 4명 소규모 그룹 체감 이슈 낮음 + RLS 호환 publication 설정 비용. v1 에서 "피드 실시간" 이 hot path 되면 재검토.

## 4. Follow-up

- [ ] pgTAP 기반 RLS 스모크 테스트 (v1)
- [ ] `challenges.status` 전이 RPC `security definer` 감사 로그 (v1)
- [ ] `events.props` jsonb schema validation (v1)
````

- [ ] **Step 2: Commit**

```bash
git add docs/BE_SCHEMA_RLS.md
git commit -m "docs(rls): add RLS policy contract with predicates and index requirements"
```

---

### Sprint 2 — Migration + Types

---

### Task 6: `0001_init.sql` — 10 테이블 + 제약 + 인덱스

> **근거**: `BE_SCHEMA §5/§6` 정의와 `BE_SCHEMA_RLS §2` 인덱스 요구를 한 파일에 응축. forward-only 원칙(ONBOARDING §4.3)상 Day 1 DDL 은 단일 파일.

**Files:**

- Modify: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: DDL 작성**

Replace `supabase/migrations/0001_init.sql` 전체:

```sql
-- 0001_init.sql — BE_SCHEMA §5/§6 구체화.
-- 테이블 10개 + 제약 + 인덱스. RLS 정책은 0002_rls.sql.
-- 원칙: forward-only (ONBOARDING §4.3). 재실행 전제 X.

-- ============================================================
-- 1. users (auth.users 확장)
-- ============================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. groups
-- ============================================================
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id),
  name text check (char_length(name) between 1 and 30),
  status text not null default 'active' check (status in ('active','disbanded')),
  disbanded_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. group_members
-- ============================================================
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id),
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- BE_SCHEMA_RLS §2: users SELECT 정책의 group-intersection 가속.
create index idx_group_members_user_group on public.group_members(user_id, group_id);

-- ============================================================
-- 4. invites
-- ============================================================
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '72 hours'),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create index idx_invites_token on public.invites(token);

-- ============================================================
-- 5. challenges
-- ============================================================
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  title text not null check (char_length(title) between 1 and 30),
  type text not null default 'fitness' check (type in ('fitness')),
  goal_count int not null default 3 check (goal_count between 1 and 7),
  duration_days int not null default 7 check (duration_days between 1 and 90),
  penalty_amount int not null
    check (penalty_amount between 1000 and 10000 and penalty_amount % 1000 = 0),
  status text not null default 'pending'
    check (status in ('pending','accepted','active','closed')),
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_challenges_group_status on public.challenges(group_id, status);

-- ============================================================
-- 6. challenge_participants
-- ============================================================
create table public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.users(id),
  signed_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- ============================================================
-- 7. action_logs (+ AI 컬럼 흡수)
-- ============================================================
create table public.action_logs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id),
  user_id uuid not null references public.users(id),
  activity_type text not null check (activity_type in ('running','gym','yoga','other')),
  photo_url text not null,
  selected_keywords text[] not null check (array_length(selected_keywords, 1) between 1 and 3),
  shown_keywords text[] not null,
  reroll_count int not null default 0 check (reroll_count between 0 and 5),
  memo text check (char_length(memo) <= 100),
  ai_summary text not null check (char_length(ai_summary) <= 150),
  template_fallback boolean not null default false,
  regenerate_count int not null default 0 check (regenerate_count between 0 and 2),
  prompt_version text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index idx_action_logs_challenge_user_created
  on public.action_logs(challenge_id, user_id, created_at desc);
create index idx_action_logs_user_created
  on public.action_logs(user_id, created_at desc);
create index idx_action_logs_keywords_gin
  on public.action_logs using gin (selected_keywords);

-- ============================================================
-- 8. kudos
-- ============================================================
create table public.kudos (
  id uuid primary key default gen_random_uuid(),
  action_log_id uuid not null references public.action_logs(id) on delete cascade,
  user_id uuid not null references public.users(id),
  emoji text not null check (emoji in ('🔥','💪','👏')),
  created_at timestamptz not null default now(),
  unique (action_log_id, user_id, emoji)
);

create index idx_kudos_action_log on public.kudos(action_log_id);

-- ============================================================
-- 9. push_subscriptions
-- ============================================================
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index idx_push_sub_user on public.push_subscriptions(user_id);

-- ============================================================
-- 10. events
-- ============================================================
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id),
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_events_name_created on public.events(name, created_at desc);

-- ============================================================
-- Auto-provision public.users on auth.users insert
-- ============================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `pnpm db:reset`
Expected: 마이그레이션 적용 성공 로그. 에러 시 메시지 확인 후 수정.

- [ ] **Step 3: 테이블 존재 확인**

Studio (`http://127.0.0.1:54323`) → Table Editor → 10 테이블 + 인덱스 노출 확인.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat(db): initial schema with 10 tables, constraints, indexes"
```

---

### Task 7: `0002_rls.sql` — 전 테이블 RLS + 정책

> **근거**: `docs/BE_SCHEMA_RLS §1` 을 SQL 로 옮긴다. 정책 하나하나가 `expectRlsDenied` 로 검증 가능해야 함.

**Files:**

- Modify: `supabase/migrations/0002_rls.sql`

- [ ] **Step 1: RLS 파일 작성**

Replace `supabase/migrations/0002_rls.sql` 전체:

```sql
-- 0002_rls.sql — Row Level Security.
-- BE_SCHEMA_RLS.md §1 의 predicate 를 SQL 로 옮김. 전 테이블 ON (ONBOARDING §6.1).

-- ============================================================
-- 헬퍼
-- ============================================================
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql stable security invoker
set search_path = public as $$
  select exists(
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- ============================================================
-- users
-- ============================================================
alter table public.users enable row level security;

create policy users_select_self_or_group on public.users
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = public.users.id
    )
  );

create policy users_insert_self on public.users
  for insert with check (id = auth.uid());

create policy users_update_self on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================
-- groups
-- ============================================================
alter table public.groups enable row level security;

create policy groups_select_member on public.groups
  for select using (public.is_group_member(id));

create policy groups_insert_owner_self on public.groups
  for insert with check (owner_id = auth.uid());

create policy groups_update_owner on public.groups
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ============================================================
-- group_members
-- ============================================================
alter table public.group_members enable row level security;

create policy gm_select_member on public.group_members
  for select using (public.is_group_member(group_id));

-- INSERT: service_role 만. anon/authenticated 기본 deny (정책 없음).

create policy gm_delete_self_or_owner on public.group_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- ============================================================
-- invites
-- ============================================================
alter table public.invites enable row level security;

create policy invites_select_owner on public.invites
  for select using (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

create policy invites_insert_owner on public.invites
  for insert with check (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

create policy invites_delete_owner on public.invites
  for delete using (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- ============================================================
-- challenges
-- ============================================================
alter table public.challenges enable row level security;

create policy challenges_select_member on public.challenges
  for select using (public.is_group_member(group_id));

create policy challenges_insert_owner on public.challenges
  for insert with check (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

create policy challenges_update_pending_owner on public.challenges
  for update
  using (
    status = 'pending'
    and exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  )
  with check (
    status in ('pending','accepted')
    and exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- ============================================================
-- challenge_participants
-- ============================================================
alter table public.challenge_participants enable row level security;

create policy cp_select_member on public.challenge_participants
  for select using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_member(c.group_id)
    )
  );

-- INSERT: service_role 만.

create policy cp_update_self_sign on public.challenge_participants
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- action_logs
-- ============================================================
alter table public.action_logs enable row level security;

create policy al_select_member on public.action_logs
  for select using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_member(c.group_id)
    )
  );

create policy al_insert_self_active on public.action_logs
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id
        and c.status = 'active'
        and now() between c.start_at and c.end_at
    )
  );

create policy al_update_self_5min on public.action_logs
  for update
  using (user_id = auth.uid() and created_at > now() - interval '5 minutes')
  with check (user_id = auth.uid() and created_at > now() - interval '5 minutes');

-- 트리거: AI 컬럼 클라이언트 수정 차단.
create or replace function public.prevent_ai_column_update()
returns trigger
language plpgsql as $$
declare
  v_role text;
begin
  if new.ai_summary is distinct from old.ai_summary
     or new.template_fallback is distinct from old.template_fallback
     or new.regenerate_count is distinct from old.regenerate_count
     or new.prompt_version is distinct from old.prompt_version
  then
    v_role := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
    if v_role <> 'service_role' then
      raise exception 'action_logs AI columns are server-managed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger al_guard_ai_columns
  before update on public.action_logs
  for each row execute function public.prevent_ai_column_update();

-- ============================================================
-- kudos
-- ============================================================
alter table public.kudos enable row level security;

create policy kudos_select_member on public.kudos
  for select using (
    exists (
      select 1 from public.action_logs a
      join public.challenges c on c.id = a.challenge_id
      where a.id = action_log_id and public.is_group_member(c.group_id)
    )
  );

create policy kudos_insert_self_not_own on public.kudos
  for insert with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.action_logs a
      where a.id = action_log_id and a.user_id = auth.uid()
    )
    and exists (
      select 1 from public.action_logs a
      join public.challenges c on c.id = a.challenge_id
      where a.id = action_log_id and public.is_group_member(c.group_id)
    )
  );

create policy kudos_delete_self on public.kudos
  for delete using (user_id = auth.uid());

-- ============================================================
-- push_subscriptions
-- ============================================================
alter table public.push_subscriptions enable row level security;

create policy ps_all_self on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- events
-- ============================================================
alter table public.events enable row level security;

create policy events_insert_self_or_anon on public.events
  for insert with check (user_id = auth.uid() or user_id is null);
-- SELECT/UPDATE/DELETE: service_role 전용 (정책 없음 = deny).
```

- [ ] **Step 2: 적용**

Run: `pnpm db:reset`
Expected: 0001 + 0002 모두 적용. 에러 0건.

- [ ] **Step 3: RLS smoke**

Studio SQL Editor 에서 실행:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in (
  'users','groups','group_members','invites','challenges',
  'challenge_participants','action_logs','kudos','push_subscriptions','events'
);
```

Expected: 10 rows 모두 `rowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_rls.sql
git commit -m "feat(db): row level security policies for all 10 tables"
```

---

### Task 8: `0003_state_transitions.sql` — RPC + seed + truncate

> **근거**: `signPledge` 의 "마지막 서명자면 active + start_at/end_at 파생" 은 다중 쓰기라 race condition 방어 위해 RPC 로 원자화. integration test 의 `afterEach` 가 쓸 `truncate_test_data` RPC 도 같은 파일.

**Files:**

- Create: `supabase/migrations/0003_state_transitions.sql`
- Create: `supabase/seed.sql`

- [ ] **Step 1: RPC 파일 작성**

Create `supabase/migrations/0003_state_transitions.sql`:

```sql
-- 0003_state_transitions.sql — 원자적 상태 전이 + 테스트 헬퍼.

-- ============================================================
-- sign_and_maybe_activate
-- 마지막 서명자 action 에서 호출. 호출자 = auth.uid() 서명 기록 후
-- 전원 서명이면 status→active + start/end 파생.
-- ============================================================
create or replace function public.sign_and_maybe_activate(p_challenge_id uuid)
returns table (status text, start_at timestamptz, end_at timestamptz)
language plpgsql security invoker
set search_path = public as $$
declare
  v_unsigned_count int;
  v_duration_days int;
  v_is_participant boolean;
begin
  select exists(
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = auth.uid()
  ) into v_is_participant;
  if not v_is_participant then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  update public.challenge_participants
    set signed_at = coalesce(signed_at, now())
    where challenge_id = p_challenge_id and user_id = auth.uid();

  select count(*) into v_unsigned_count
    from public.challenge_participants
    where challenge_id = p_challenge_id and signed_at is null;

  if v_unsigned_count = 0 then
    select duration_days into v_duration_days from public.challenges
      where id = p_challenge_id for update;
    update public.challenges
      set status = 'active',
          start_at = now(),
          end_at = now() + make_interval(days => v_duration_days)
      where id = p_challenge_id and status in ('pending','accepted');
  end if;

  return query
    select c.status, c.start_at, c.end_at
      from public.challenges c where c.id = p_challenge_id;
end;
$$;

-- ============================================================
-- truncate_test_data — integration test 전용. service_role 만.
-- ============================================================
create or replace function public.truncate_test_data()
returns void
language plpgsql security definer
set search_path = public as $$
begin
  truncate table public.kudos, public.action_logs, public.challenge_participants,
                 public.challenges, public.invites, public.group_members,
                 public.groups, public.events, public.push_subscriptions restart identity cascade;
  delete from auth.users where email like '%@test.local';
end;
$$;

revoke all on function public.truncate_test_data() from public, anon, authenticated;
grant execute on function public.truncate_test_data() to service_role;
```

- [ ] **Step 2: seed 작성**

Create `supabase/seed.sql`:

```sql
-- supabase/seed.sql — 로컬 수동 확인용.
-- auth.users 는 supabase.auth.admin.createUser 로만 생성. 실제 사용자 1명은 `pnpm dev` 의 magic link 로 생성.
select 1 where false;  -- no-op placeholder
```

- [ ] **Step 3: 적용 + 함수 확인**

Run: `pnpm db:reset`
Expected: 3개 마이그레이션 + seed 적용 성공.

Studio SQL Editor:
```sql
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('is_group_member','sign_and_maybe_activate','truncate_test_data','handle_new_auth_user','prevent_ai_column_update')
  order by proname;
```
Expected: 5 rows.

- [ ] **Step 4: 타입 생성**

Run: `pnpm db:types`
Expected: `src/types/supabase.ts` 생성 (200~400 줄).

- [ ] **Step 5: integration harness smoke**

Run: `pnpm test:integration tests/integration/harness.spec.ts`
Expected: 2 tests PASS. 실패 시 env 로딩 확인 — vitest 는 기본적으로 `.env.local` 을 안 읽으므로 CLI 앞에 `pnpm exec dotenv -e .env.local --` 가 필요할 수 있다. 필요 시 `package.json` 의 `test:integration` 을 `"dotenv -e .env.local -- vitest run --project integration"` 로 업데이트하고 `dotenv-cli` 를 `pnpm add -D dotenv-cli`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_state_transitions.sql supabase/seed.sql src/types/supabase.ts
git commit -m "feat(db): sign_and_activate RPC, test truncate helper, seed, typed client"
```

---

### Sprint 3 — BFF Write 레이어

---

### Task 9: Error taxonomy 확장 + Supabase error 매핑

> **근거**: 현재 `ActionResult.error` 는 2 코드. 실 DB 연동 후 RLS deny(42501) · unique(23505) · FK(23503) · PGRST116(no rows) 등이 나타나며 UI 분기가 다르다. 기계 코드로 분류해 discriminated union 유지.

**Files:**

- Modify: `src/lib/actions/response.ts`
- Modify: `src/lib/actions/response.spec.ts`
- Create: `src/lib/actions/supabase-error.ts`
- Create: `src/lib/actions/supabase-error.spec.ts`
- Modify: `src/lib/actions/error-messages.ts`
- Modify: `src/lib/actions/error-messages.spec.ts`

- [ ] **Step 1: response.ts 확장**

Replace `src/lib/actions/response.ts` 전체:

```ts
import type { ZodError } from "zod";

/**
 * Machine error codes. UI maps these to Korean copy via `makeUserMessage()`.
 */
export type ErrorCode =
  | "unauthorized"      // 세션 없음 또는 만료
  | "forbidden"         // RLS 거부 또는 비소유
  | "invalid_input"     // Zod 또는 DB check/FK 실패
  | "not_found"         // 대상 row 없음 (PGRST116)
  | "conflict"          // unique 위반
  | "upstream_error";   // AI / 외부 서비스 장애 / 알 수 없음

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = {
  ok: false;
  error: ErrorCode;
  issues?: Record<string, string[] | undefined>;
};
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export function success<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

export function failure(error: ErrorCode, issues?: ActionFailure["issues"]): ActionFailure {
  return { ok: false, error, ...(issues ? { issues } : {}) };
}

export function validationFailure<T>(err: ZodError<T>): ActionFailure {
  return {
    ok: false,
    error: "invalid_input",
    issues: err.flatten().fieldErrors as Record<string, string[] | undefined>,
  };
}
```

- [ ] **Step 2: response.spec.ts 회귀 + 새 케이스**

Append to `src/lib/actions/response.spec.ts`:

```ts
describe("ErrorCode coverage", () => {
  it("accepts all declared codes in failure()", () => {
    const codes = [
      "unauthorized",
      "forbidden",
      "invalid_input",
      "not_found",
      "conflict",
      "upstream_error",
    ] as const;
    for (const c of codes) {
      expect(failure(c).error).toBe(c);
    }
  });
});
```

- [ ] **Step 3: supabase-error.ts — 테스트 먼저**

Create `src/lib/actions/supabase-error.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapSupabaseError } from "./supabase-error";

describe("mapSupabaseError", () => {
  it("maps RLS denial (42501) to forbidden", () => {
    expect(mapSupabaseError({ code: "42501", message: "RLS" })).toBe("forbidden");
  });

  it("maps PGRST116 (no rows) to not_found", () => {
    expect(mapSupabaseError({ code: "PGRST116", message: "no rows" })).toBe("not_found");
  });

  it("maps unique violation (23505) to conflict", () => {
    expect(mapSupabaseError({ code: "23505", message: "dup" })).toBe("conflict");
  });

  it("maps FK (23503), check (23514), not-null (23502) to invalid_input", () => {
    expect(mapSupabaseError({ code: "23503", message: "fk" })).toBe("invalid_input");
    expect(mapSupabaseError({ code: "23514", message: "check" })).toBe("invalid_input");
    expect(mapSupabaseError({ code: "23502", message: "null" })).toBe("invalid_input");
  });

  it("falls back to upstream_error for unknown / null", () => {
    expect(mapSupabaseError({ code: "99999", message: "?" })).toBe("upstream_error");
    expect(mapSupabaseError(null)).toBe("upstream_error");
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `pnpm test -- supabase-error`
Expected: FAIL — 모듈 미존재.

- [ ] **Step 5: supabase-error.ts 구현**

Create `src/lib/actions/supabase-error.ts`:

```ts
import type { ErrorCode } from "./response";

type PgErrorLike = { code?: string | null; message?: string | null };

/**
 * PostgREST / Postgres error code → machine ErrorCode.
 * Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
 * PostgREST specific: PGRST116 (no rows).
 */
export function mapSupabaseError(err: PgErrorLike | null | undefined): ErrorCode {
  if (!err?.code) return "upstream_error";
  switch (err.code) {
    case "42501":
      return "forbidden";
    case "PGRST116":
      return "not_found";
    case "23505":
      return "conflict";
    case "23503":
    case "23514":
    case "23502":
      return "invalid_input";
    default:
      return "upstream_error";
  }
}
```

- [ ] **Step 6: error-messages 확장**

Replace `src/lib/actions/error-messages.ts` 전체:

```ts
import type { ErrorCode } from "./response";

export const FALLBACK_ERROR_MESSAGE = "잠시 후 다시 시도해 주세요.";

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "로그인이 필요해요.",
  forbidden: "접근 권한이 없어요.",
  invalid_input: "입력값을 확인해 주세요.",
  not_found: "대상을 찾을 수 없어요.",
  conflict: "이미 처리된 요청이에요.",
  upstream_error: FALLBACK_ERROR_MESSAGE,
};

export function makeUserMessage(
  overrides?: Partial<Record<ErrorCode, string>>,
): Record<ErrorCode, string> {
  return { ...DEFAULT_MESSAGES, ...(overrides ?? {}) };
}
```

- [ ] **Step 7: error-messages.spec.ts 확장**

Append to `src/lib/actions/error-messages.spec.ts`:

```ts
describe("makeUserMessage (extended codes)", () => {
  it("has Korean copy for every ErrorCode", () => {
    const m = makeUserMessage();
    expect(m.unauthorized).toBeTruthy();
    expect(m.forbidden).toBeTruthy();
    expect(m.invalid_input).toBeTruthy();
    expect(m.not_found).toBeTruthy();
    expect(m.conflict).toBeTruthy();
    expect(m.upstream_error).toBeTruthy();
  });
});
```

- [ ] **Step 8: 실행**

Run: `pnpm test -- response supabase-error error-messages`
Expected: 모두 PASS + 기존 테스트 회귀 0건.

- [ ] **Step 9: Commit**

```bash
git add src/lib/actions/response.ts src/lib/actions/response.spec.ts src/lib/actions/supabase-error.ts src/lib/actions/supabase-error.spec.ts src/lib/actions/error-messages.ts src/lib/actions/error-messages.spec.ts
git commit -m "feat(actions): extend error taxonomy and map Supabase error codes"
```

---

### Task 10: `createChallenge` 실 DB 배선

**Files:**

- Modify: `src/app/(app)/challenge/new/_actions.ts`
- Modify: `src/app/(app)/challenge/new/page.tsx`
- Create: `tests/integration/actions/create-challenge.spec.ts`

- [ ] **Step 1: Integration test 먼저**

Create `tests/integration/actions/create-challenge.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { asUser, admin } from "../setup";
import { createUser, createGroup, addMember } from "../factories";

describe("createChallenge (RLS + insert contract)", () => {
  it("owner can insert challenge in their group", async () => {
    const owner = await createUser();
    const group = await createGroup(owner.id);
    const client = await asUser(owner.id);

    const { data, error } = await client
      .from("challenges")
      .insert({
        group_id: group.id,
        title: "주 3회 헬스장",
        type: "fitness",
        goal_count: 3,
        duration_days: 7,
        penalty_amount: 3000,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe("pending");
  });

  it("non-owner member cannot insert challenge (RLS)", async () => {
    const owner = await createUser();
    const member = await createUser();
    const group = await createGroup(owner.id);
    await addMember(group.id, member.id);
    const client = await asUser(member.id);

    const { error } = await client.from("challenges").insert({
      group_id: group.id,
      title: "x",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
    });
    expect(error).not.toBeNull();
  });

  it("penalty_amount 20000 violates CHECK (23514)", async () => {
    const owner = await createUser();
    const group = await createGroup(owner.id);
    const client = await asUser(owner.id);

    const { error } = await client.from("challenges").insert({
      group_id: group.id,
      title: "x",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 20000,
    });
    expect(error?.code).toBe("23514");
  });
});
```

- [ ] **Step 2: 실행 — 세 케이스 다 PASS 인지 확인**

Run: `pnpm test:integration create-challenge`
Expected: 3 PASS. 만약 FAIL 이면 0001/0002 마이그레이션 누락 확인.

- [ ] **Step 3: `_actions.ts` 리팩터**

Replace `src/app/(app)/challenge/new/_actions.ts` 전체:

```ts
"use server";

import { challengeInputSchema, type ChallengeInput } from "@/lib/validators/challenge";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

type CreateInput = ChallengeInput & { groupId: string };

// BE_SCHEMA §8.1. RLS 가 owner 검증 수행.
export const createChallenge = withUser<CreateInput, { id: string }>(
  async (_user, input): Promise<ActionResult<{ id: string }>> => {
    const { groupId, ...rest } = input;
    const parsed = challengeInputSchema.safeParse(rest);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("challenges")
      .insert({
        group_id: groupId,
        title: parsed.data.title,
        type: parsed.data.type,
        goal_count: parsed.data.goalCount,
        duration_days: parsed.data.durationDays,
        penalty_amount: parsed.data.penaltyAmount,
      })
      .select("id")
      .single();

    if (error) return failure(mapSupabaseError(error));
    if (!data) return failure("upstream_error");

    await track({
      name: "challenge_created",
      props: {
        challengeId: data.id,
        penaltyAmount: parsed.data.penaltyAmount,
        goalCount: parsed.data.goalCount,
      },
    }).catch((err) => console.error("[createChallenge] track failed:", err));

    return success({ id: data.id });
  },
);
```

> `challenge_participants INSERT` 는 RLS 상 service_role 전용이므로 여기에서 owner 본인 seed 하지 않음. 별도 acceptInvite Server Action (이월 항목)이 service key 로 참가자 삽입.

- [ ] **Step 4: page.tsx 호출부 업데이트 — groupId 주입**

Edit `src/app/(app)/challenge/new/page.tsx` — `"use client"` 하단 imports 에 `useSearchParams` 추가하고, 컴포넌트 함수 최상단에 search param 읽기 추가:

```tsx
// 기존 imports 에 추가
import { useSearchParams } from "next/navigation";

// 컴포넌트 함수 상단에 추가
const searchParams = useSearchParams();
const groupId = searchParams.get("groupId") ?? "";
```

그리고 `submit()` 함수의 `createChallenge(...)` 호출을 다음으로 변경:

```tsx
function submit() {
  if (!groupId) {
    toast.error("그룹 정보가 없어요. 홈에서 다시 시도해 주세요.");
    return;
  }
  startTransition(async () => {
    try {
      const res = await createChallenge({
        groupId,
        title,
        type: "fitness",
        goalCount,
        durationDays,
        penaltyAmount,
      });
      if (!res.ok) {
        toast.error(messages[res.error] ?? FALLBACK_ERROR_MESSAGE);
        if (res.error === "unauthorized") router.push("/login");
        return;
      }
      router.push(`/challenge/${res.data.id}`);
    } catch (e) {
      console.error(e);
      toast.error(FALLBACK_ERROR_MESSAGE);
    }
  });
}
```

> `messages`/`router`/`toast` 는 이미 기존 코드에 임포트되어 있음. 변경은 `groupId` 추가 1개 + 인자 확장 1개.

- [ ] **Step 5: typecheck + 수동 확인**

Run: `pnpm typecheck`
Expected: 0 errors.

Run: `pnpm dev`. Studio 에서 유저 + 그룹 + group_members(role=owner) seed 후:
1. magic link 로그인.
2. `/challenge/new?groupId=<그룹_id>` 접근.
3. 폼 제출 → `challenges` row 생성 확인.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/challenge/new/_actions.ts" "src/app/(app)/challenge/new/page.tsx" tests/integration/actions/create-challenge.spec.ts
git commit -m "feat(challenge): wire createChallenge to Supabase with RLS + integration tests"
```

---

### Task 11: `signPledge` 실 RPC 호출 + `submitActionLog` 실 insert

**Files:**

- Modify: `src/app/(app)/pledge/_actions.ts`
- Modify: `src/app/(app)/action/_actions.ts`
- Create: `tests/integration/actions/sign-pledge.spec.ts`
- Create: `tests/integration/actions/submit-action-log.spec.ts`

- [ ] **Step 1: sign-pledge integration test**

Create `tests/integration/actions/sign-pledge.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { asUser, admin } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";

describe("sign_and_maybe_activate RPC", () => {
  it("last signer flips status to active and sets start/end", async () => {
    const owner = await createUser();
    const m2 = await createUser();
    const g = await createGroup(owner.id);
    await addMember(g.id, m2.id);
    const c = await createPendingChallenge(g.id, { durationDays: 7 });
    await admin.from("challenge_participants").insert([
      { challenge_id: c.id, user_id: owner.id },
      { challenge_id: c.id, user_id: m2.id },
    ]);

    const ownerClient = await asUser(owner.id);
    const r1 = await ownerClient.rpc("sign_and_maybe_activate", { p_challenge_id: c.id });
    expect(r1.error).toBeNull();
    expect(r1.data?.[0].status).toBe("pending");

    const m2Client = await asUser(m2.id);
    const r2 = await m2Client.rpc("sign_and_maybe_activate", { p_challenge_id: c.id });
    expect(r2.error).toBeNull();
    expect(r2.data?.[0].status).toBe("active");
    expect(r2.data?.[0].start_at).toBeTruthy();
    expect(r2.data?.[0].end_at).toBeTruthy();
  });

  it("non-participant is rejected (42501)", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);
    await admin.from("challenge_participants").insert({ challenge_id: c.id, user_id: owner.id });

    const client = await asUser(outsider.id);
    const { error } = await client.rpc("sign_and_maybe_activate", { p_challenge_id: c.id });
    expect(error?.code).toBe("42501");
  });
});
```

Run: `pnpm test:integration sign-pledge`
Expected: 2 PASS (DDL + RPC 가 이미 준비됐으므로).

- [ ] **Step 2: signPledge Action 리팩터**

Replace `src/app/(app)/pledge/_actions.ts` 전체:

```ts
"use server";

import { z } from "zod";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

const signInputSchema = z.object({ challengeId: z.string().uuid() });
type SignInput = z.infer<typeof signInputSchema>;

type SignResult = { challengeId: string; status: "pending" | "accepted" | "active" | "closed" };

// BE_SCHEMA §8.4. RPC 가 원자적 상태 전이.
export const signPledge = withUser<SignInput, SignResult>(
  async (user, input): Promise<ActionResult<SignResult>> => {
    const parsed = signInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("sign_and_maybe_activate", {
      p_challenge_id: parsed.data.challengeId,
    });

    if (error) return failure(mapSupabaseError(error));
    const row = data?.[0];
    if (!row) return failure("not_found");

    await track({
      name: "challenge_signed",
      props: { challengeId: parsed.data.challengeId, userId: user.id },
    }).catch((err) => console.error("[signPledge] track failed:", err));

    return success({ challengeId: parsed.data.challengeId, status: row.status });
  },
);
```

- [ ] **Step 3: submit-action-log integration test**

Create `tests/integration/actions/submit-action-log.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { asUser, admin } from "../setup";
import { createUser, createGroup, createPendingChallenge } from "../factories";

async function makeActiveChallenge() {
  const owner = await createUser();
  const g = await createGroup(owner.id);
  const c = await createPendingChallenge(g.id);
  await admin.from("challenge_participants").insert({ challenge_id: c.id, user_id: owner.id });
  await admin
    .from("challenges")
    .update({
      status: "active",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    .eq("id", c.id);
  return { owner, challengeId: c.id };
}

describe("action_logs insert (RLS)", () => {
  it("participant can insert while challenge is active", async () => {
    const { owner, challengeId } = await makeActiveChallenge();
    const client = await asUser(owner.id);
    const { data, error } = await client
      .from("action_logs")
      .insert({
        challenge_id: challengeId,
        user_id: owner.id,
        activity_type: "gym",
        photo_url: "https://example.com/x.jpg",
        selected_keywords: ["펌핑"],
        shown_keywords: ["펌핑", "하체"],
        ai_summary: "오늘 멋지게 운동했어요!",
        prompt_version: "v1",
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.template_fallback).toBe(false);
  });

  it("AI columns update is blocked by trigger (42501)", async () => {
    const { owner, challengeId } = await makeActiveChallenge();
    const client = await asUser(owner.id);
    const inserted = await client
      .from("action_logs")
      .insert({
        challenge_id: challengeId,
        user_id: owner.id,
        activity_type: "gym",
        photo_url: "x",
        selected_keywords: ["a"],
        shown_keywords: ["a"],
        ai_summary: "ok",
        prompt_version: "v1",
      })
      .select()
      .single();
    expect(inserted.error).toBeNull();

    const { error } = await client
      .from("action_logs")
      .update({ ai_summary: "hacked!" })
      .eq("id", inserted.data!.id);
    expect(error?.code).toBe("42501");
  });
});
```

Run: `pnpm test:integration submit-action-log`
Expected: 2 PASS.

- [ ] **Step 4: submitActionLog Action 리팩터**

Replace `src/app/(app)/action/_actions.ts` 전체:

```ts
"use server";

import { actionLogInputSchema, type ActionLogInput } from "@/lib/validators/action-log";
import { generateDiary } from "@/lib/ai/diary";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

type SubmitResult = { id: string; summary: string };

// BE_SCHEMA §8.5. RLS 가 참가자/active/기간 검증.
export const submitActionLog = withUser<ActionLogInput, SubmitResult>(
  async (user, input): Promise<ActionResult<SubmitResult>> => {
    const parsed = actionLogInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();

    // Ownership/active 이중 방어: RLS 가 최종 차단하지만 UX 메시지 분기 위해 선제 체크.
    const { data: membership, error: mErr } = await supabase
      .from("challenge_participants")
      .select("user_id, challenges!inner(status, start_at, end_at)")
      .eq("challenge_id", parsed.data.challengeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (mErr) return failure(mapSupabaseError(mErr));
    if (!membership) return failure("not_found");
    const ch = Array.isArray(membership.challenges)
      ? membership.challenges[0]
      : membership.challenges;
    if (!ch || ch.status !== "active") return failure("forbidden");
    const now = Date.now();
    if (
      !ch.start_at ||
      !ch.end_at ||
      now < new Date(ch.start_at).getTime() ||
      now > new Date(ch.end_at).getTime()
    ) {
      return failure("forbidden");
    }

    const diary = await generateDiary({
      activityType: parsed.data.activityType,
      keywords: parsed.data.selectedKeywords,
      memo: parsed.data.memo,
    });

    const { data, error } = await supabase
      .from("action_logs")
      .insert({
        challenge_id: parsed.data.challengeId,
        user_id: user.id,
        activity_type: parsed.data.activityType,
        photo_url: parsed.data.photoUrl,
        selected_keywords: parsed.data.selectedKeywords,
        shown_keywords: parsed.data.shownKeywords,
        reroll_count: parsed.data.rerollCount,
        memo: parsed.data.memo ?? null,
        ai_summary: diary.summary,
        template_fallback: diary.fallback,
        prompt_version: diary.promptVersion,
      })
      .select("id")
      .single();

    if (error) return failure(mapSupabaseError(error));
    if (!data) return failure("upstream_error");

    void track({
      name: "action_logged",
      props: {
        challengeId: parsed.data.challengeId,
        activityType: parsed.data.activityType,
        selectedKeywords: parsed.data.selectedKeywords,
        keywordCount: parsed.data.selectedKeywords.length,
        hasMemo: Boolean(parsed.data.memo),
        rerollCount: parsed.data.rerollCount,
        photoSize: 0,
      },
    }).catch((e) => console.error("[track] action_logged failed", e));

    void track({
      name: "ai_generated",
      props: {
        actionLogId: data.id,
        latencyMs: diary.latencyMs,
        fallback: diary.fallback,
        keywordCoverage: diary.keywordCoverage,
        promptVersion: diary.promptVersion,
      },
    }).catch((e) => console.error("[track] ai_generated failed", e));

    return success({ id: data.id, summary: diary.summary });
  },
);
```

- [ ] **Step 5: 실행**

Run: `pnpm test:integration`
Expected: harness 2 + create-challenge 3 + sign-pledge 2 + submit-action-log 2 = 9 tests PASS.

Run: `pnpm test`
Expected: 기존 단위 71 + 새 (response 1 + supabase-error 6 + error-messages 1) = 79 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/pledge/_actions.ts" "src/app/(app)/action/_actions.ts" tests/integration/actions/sign-pledge.spec.ts tests/integration/actions/submit-action-log.spec.ts
git commit -m "feat(actions): wire signPledge (RPC) and submitActionLog (insert) with ownership check"
```

---

### Sprint 4 — BFF Read 레이어

---

### Task 12: `fetchActiveChallenge` read model + home page 교체

**Files:**

- Create: `src/lib/db/reads/active-challenge.ts`
- Create: `tests/integration/reads/active-challenge.spec.ts`
- Modify: `src/app/(app)/home/page.tsx`

- [ ] **Step 1: read 함수 작성**

Create `src/lib/db/reads/active-challenge.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export type ActiveChallengeView = {
  id: string;
  groupId: string;
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  status: "pending" | "accepted" | "active" | "closed";
  startAt: string | null;
  endAt: string | null;
  doneCount: number;
  daysLeft: number;
  potTotal: number;
};

/**
 * 내가 속한 그룹 중 가장 최근의 "진행 중 또는 서명 대기" 챌린지 1개.
 * 없으면 null. RLS 가 is_group_member 로 자동 필터링.
 */
export async function fetchActiveChallenge(userId: string): Promise<ActiveChallengeView | null> {
  const supabase = await createClient();

  const { data: challenges, error } = await supabase
    .from("challenges")
    .select(
      "id, group_id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at",
    )
    .in("status", ["pending", "accepted", "active"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !challenges?.[0]) return null;
  const c = challenges[0];

  const { count: doneCount } = await supabase
    .from("action_logs")
    .select("id", { count: "exact", head: true })
    .eq("challenge_id", c.id)
    .eq("user_id", userId);

  const { count: memberCount } = await supabase
    .from("challenge_participants")
    .select("user_id", { count: "exact", head: true })
    .eq("challenge_id", c.id);

  const daysLeft = c.end_at
    ? Math.max(0, Math.ceil((new Date(c.end_at).getTime() - Date.now()) / 86_400_000))
    : c.duration_days;

  return {
    id: c.id,
    groupId: c.group_id,
    title: c.title,
    goalCount: c.goal_count,
    durationDays: c.duration_days,
    penaltyAmount: c.penalty_amount,
    status: c.status,
    startAt: c.start_at,
    endAt: c.end_at,
    doneCount: doneCount ?? 0,
    daysLeft,
    potTotal: (memberCount ?? 0) * c.penalty_amount,
  };
}
```

- [ ] **Step 2: Integration test (RLS filtering)**

Create `tests/integration/reads/active-challenge.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { asUser } from "../setup";
import { createUser, createGroup, createPendingChallenge } from "../factories";

// read 함수는 next/headers 를 요구하므로 직접 호출 대신 동등 쿼리로 RLS 경계 확인.
describe("active-challenge read (RLS filter)", () => {
  it("member sees only their group's challenge", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);

    const outsiderClient = await asUser(outsider.id);
    const { data } = await outsiderClient.from("challenges").select("id").eq("id", c.id);
    expect(data).toEqual([]);

    const ownerClient = await asUser(owner.id);
    const { data: ownerData } = await ownerClient.from("challenges").select("id").eq("id", c.id);
    expect(ownerData?.[0]?.id).toBe(c.id);
  });
});
```

Run: `pnpm test:integration active-challenge`
Expected: 1 PASS.

- [ ] **Step 3: home page 교체**

Replace `src/app/(app)/home/page.tsx` 전체:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ProgressCard } from "./_components/progress-card";
import { createClient } from "@/lib/supabase/server";
import { fetchActiveChallenge } from "@/lib/db/reads/active-challenge";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const active = await fetchActiveChallenge(user.id);

  return (
    <div className="flex flex-col gap-6 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">오늘도 수고하셨어요</h1>
        <Link
          href="/settings"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          설정
        </Link>
      </header>

      {active ? (
        <>
          <ProgressCard
            title={active.title}
            goalCount={active.goalCount}
            doneCount={active.doneCount}
            potTotal={active.potTotal}
            daysLeft={active.daysLeft}
          />
          <Link
            href={`/challenge/${active.id}`}
            className={cn(buttonVariants({ size: "lg" }), "h-12 w-full")}
          >
            현황 보기
          </Link>
        </>
      ) : (
        <section className="bg-card flex flex-col items-center gap-3 rounded-2xl border p-6 text-center">
          <p className="text-muted-foreground break-keep text-sm">
            진행 중인 서약서가 없어요. 친구들과 새 챌린지를 시작해 보세요.
          </p>
          <Link
            href="/challenge/new"
            className={cn(buttonVariants({ size: "lg" }), "h-12 w-full")}
          >
            <Plus aria-hidden /> 새로운 서약서 만들기
          </Link>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: typecheck + 수동 확인**

Run: `pnpm typecheck`
Expected: 0 errors. 만약 Supabase 타입 미스매치면 `src/types/supabase.ts` 를 참조해 local narrow type 사용.

수동: Studio 에서 유저 + 그룹 + pending challenge + participants seed → `/home` → ProgressCard 노출.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/reads/active-challenge.ts "src/app/(app)/home/page.tsx" tests/integration/reads/active-challenge.spec.ts
git commit -m "feat(home): replace mock with fetchActiveChallenge BFF read"
```

---

### Task 13: `fetchChallengeDetail` read model + challenge/[id] page 교체

**Files:**

- Create: `src/lib/db/reads/challenge-detail.ts`
- Modify: `src/app/(app)/challenge/[id]/page.tsx`

- [ ] **Step 1: read 함수 작성**

Create `src/lib/db/reads/challenge-detail.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export type ChallengeMemberView = {
  id: string;
  displayName: string;
  doneCount: number;
  signed: boolean;
};

export type ChallengeDetailView = {
  id: string;
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  status: "pending" | "accepted" | "active" | "closed";
  members: ChallengeMemberView[];
  potTotal: number;
};

export async function fetchChallengeDetail(
  challengeId: string,
): Promise<ChallengeDetailView | null> {
  const supabase = await createClient();
  const { data: c, error } = await supabase
    .from("challenges")
    .select("id, title, goal_count, duration_days, penalty_amount, status")
    .eq("id", challengeId)
    .maybeSingle();
  if (error || !c) return null;

  const { data: parts } = await supabase
    .from("challenge_participants")
    .select("user_id, signed_at, users!inner(display_name)")
    .eq("challenge_id", challengeId);

  const counts = new Map<string, number>();
  const { data: logs } = await supabase
    .from("action_logs")
    .select("user_id")
    .eq("challenge_id", challengeId);
  for (const l of logs ?? []) {
    counts.set(l.user_id, (counts.get(l.user_id) ?? 0) + 1);
  }

  const members: ChallengeMemberView[] = (parts ?? []).map((p) => {
    const u = Array.isArray(p.users) ? p.users[0] : p.users;
    return {
      id: p.user_id,
      displayName: u?.display_name ?? "익명",
      doneCount: counts.get(p.user_id) ?? 0,
      signed: p.signed_at != null,
    };
  });

  return {
    id: c.id,
    title: c.title,
    goalCount: c.goal_count,
    durationDays: c.duration_days,
    penaltyAmount: c.penalty_amount,
    status: c.status,
    members,
    potTotal: members.length * c.penalty_amount,
  };
}
```

- [ ] **Step 2: page 교체**

Replace `src/app/(app)/challenge/[id]/page.tsx` 전체:

```tsx
import { notFound } from "next/navigation";
import { formatKRW } from "@/lib/challenge/penalty";
import { MemberStrip } from "./_components/member-strip";
import { SettlementTrigger } from "./_components/settlement-trigger";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";

type Params = Promise<{ id: string }>;

export default async function ChallengeDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-6 p-4">
      <header>
        <p className="text-muted-foreground text-xs font-mono">{id.slice(0, 8)}</p>
        <h1 className="text-xl font-semibold">{detail.title}</h1>
      </header>
      <section>
        <h2 className="mb-3 text-sm font-semibold">멤버 진행률</h2>
        <MemberStrip goalCount={detail.goalCount} members={detail.members} />
      </section>
      <section className="bg-card flex items-center justify-between rounded-2xl border p-4">
        <div>
          <p className="text-muted-foreground text-xs">모인 예정 벌금</p>
          <p className="text-xl font-bold tabular-nums">{formatKRW(detail.potTotal)}</p>
        </div>
        <SettlementTrigger amount={detail.potTotal} memo={`${detail.title} 벌금`} />
      </section>
    </div>
  );
}
```

> `SettlementTrigger` 의 props 가 `{ amount, memo }` 인지 확인. 기존 컴포넌트가 `onOpen` 콜백 인터페이스였다면 props 를 `{ amount, memo }` 로 받아 내부에서 `SettlementSheet` 를 여는 shape 로 이미 작성되어 있음(Batch C 기록).

- [ ] **Step 3: typecheck + 수동 확인**

Run: `pnpm typecheck`
Expected: 0 errors. Supabase 관계 타입 불일치면 `src/types/supabase.ts` 검토.

수동: Studio 에서 challenge + 3명 참가자 + 각 유저 action_logs 1~3개 seed → `/challenge/<id>` → MemberStrip 진행률 표시.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/reads/challenge-detail.ts "src/app/(app)/challenge/[id]/page.tsx"
git commit -m "feat(challenge/[id]): replace MOCK_DETAIL with fetchChallengeDetail"
```

---

### Task 14: `fetchPendingPledge` read model + pledge page 분할

**Files:**

- Create: `src/lib/db/reads/pledge.ts`
- Modify: `src/app/(app)/pledge/page.tsx`
- Create: `src/app/(app)/pledge/_components/pledge-sheet.tsx`

- [ ] **Step 1: read 함수 작성**

Create `src/lib/db/reads/pledge.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export type PledgeView = {
  id: string;
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  members: ReadonlyArray<{ id: string; displayName: string; signed: boolean }>;
  mySigned: boolean;
};

export async function fetchPendingPledge(userId: string): Promise<PledgeView | null> {
  const supabase = await createClient();
  const { data: self } = await supabase
    .from("challenge_participants")
    .select("challenge_id, challenges!inner(id, title, goal_count, duration_days, penalty_amount, status)")
    .eq("user_id", userId)
    .in("challenges.status", ["pending", "accepted"])
    .limit(1)
    .maybeSingle();

  if (!self) return null;
  const c = Array.isArray(self.challenges) ? self.challenges[0] : self.challenges;
  if (!c) return null;

  const { data: allParts } = await supabase
    .from("challenge_participants")
    .select("user_id, signed_at, users!inner(display_name)")
    .eq("challenge_id", c.id);

  const members = (allParts ?? []).map((p) => {
    const u = Array.isArray(p.users) ? p.users[0] : p.users;
    return {
      id: p.user_id,
      displayName: u?.display_name ?? "익명",
      signed: p.signed_at != null,
    };
  });
  const mySigned = members.find((m) => m.id === userId)?.signed ?? false;

  return {
    id: c.id,
    title: c.title,
    goalCount: c.goal_count,
    durationDays: c.duration_days,
    penaltyAmount: c.penalty_amount,
    members,
    mySigned,
  };
}
```

- [ ] **Step 2: page 교체 (Server Component)**

Replace `src/app/(app)/pledge/page.tsx` 전체:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPendingPledge } from "@/lib/db/reads/pledge";
import { PledgeSheet } from "./_components/pledge-sheet";

export default async function PledgePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pledge = await fetchPendingPledge(user.id);

  if (!pledge) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <h1 className="text-xl font-semibold">서약서</h1>
        <p className="text-muted-foreground text-sm break-keep">
          아직 서명할 서약서가 없어요. 홈에서 새 챌린지를 만들어 친구를 초대해 보세요.
        </p>
      </div>
    );
  }

  return <PledgeSheet pledge={pledge} currentUserId={user.id} />;
}
```

- [ ] **Step 3: client sheet 분리**

Create `src/app/(app)/pledge/_components/pledge-sheet.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PledgeCard } from "./pledge-card";
import { signPledge } from "../_actions";
import { makeUserMessage, FALLBACK_ERROR_MESSAGE } from "@/lib/actions/error-messages";
import type { PledgeView } from "@/lib/db/reads/pledge";

export function PledgeSheet({
  pledge,
  currentUserId,
}: {
  pledge: PledgeView;
  currentUserId: string;
}) {
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();
  const messages = makeUserMessage({
    unauthorized: "로그인이 필요해요.",
    invalid_input: "서약서 정보를 확인해 주세요.",
  });

  function submit() {
    startTransition(async () => {
      try {
        const res = await signPledge({ challengeId: pledge.id });
        if (!res.ok) {
          toast.error(messages[res.error] ?? FALLBACK_ERROR_MESSAGE);
          return;
        }
        if (res.data.status === "active") {
          toast.success("전원 서명 완료! 챌린지가 시작됐어요.");
        } else {
          toast.success("서명했어요!");
        }
      } catch (e) {
        console.error(e);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  const myName = pledge.members.find((m) => m.id === currentUserId)?.displayName ?? "익명";

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">서약서</h1>
      <PledgeCard
        title={pledge.title}
        goalCount={pledge.goalCount}
        durationDays={pledge.durationDays}
        penaltyAmount={pledge.penaltyAmount}
        members={pledge.members}
      />

      {pledge.mySigned ? (
        <p className="text-muted-foreground text-center text-sm">이미 서명했어요.</p>
      ) : (
        <>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="focus-visible:ring-ring mt-1 size-5 focus-visible:ring-2"
            />
            <span className="break-keep">
              나 {myName}은(는) 위 조건에 동의합니다. 어긴 경우 공동 통장에 입금할게요.
            </span>
          </label>

          <Button size="lg" className="h-12" onClick={submit} disabled={!agreed || pending}>
            {pending ? "서명 중..." : "서명하고 참여"}
          </Button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 수동 E2E**

1. Studio: pending 챌린지 + 참가자 3명(signed_at=null) seed.
2. 유저 A 로 magic link 로그인 → `/pledge` → 체크 + 서명 → 토스트 "서명했어요!" → Studio 에서 `signed_at` 채워짐.
3. 유저 B·C 순차 서명 → 마지막 서명 시 "전원 서명 완료! 챌린지가 시작됐어요." + `challenges.status='active'` + `start_at`/`end_at` 채워짐.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/reads/pledge.ts "src/app/(app)/pledge/page.tsx" "src/app/(app)/pledge/_components/pledge-sheet.tsx"
git commit -m "feat(pledge): replace mock with fetchPendingPledge + client sheet split"
```

---

### Sprint 5 — Kudos + 검증 + 문서

---

### Task 15: Kudos Server Action + integration test

> **근거**: Batch C 에서 FeedCard 컴포넌트는 만들어졌으나 `onKudos` 콜백이 no-op. Day 2 범위에서 "이모지 카운트 토글까지" 끌고 가야 BFF 라운드트립이 완성됨.

**Files:**

- Create: `src/app/(app)/challenge/[id]/_actions.ts`
- Create: `tests/integration/actions/give-kudos.spec.ts`

- [ ] **Step 1: Action 작성**

Create `src/app/(app)/challenge/[id]/_actions.ts`:

```ts
"use server";

import { kudosInputSchema, type KudosInput } from "@/lib/validators/kudos";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

type KudosResult = { toggled: "added" | "removed" };

// BE_SCHEMA §8.6. UNIQUE (action_log_id, user_id, emoji) 로 토글.
export const toggleKudos = withUser<KudosInput, KudosResult>(
  async (user, input): Promise<ActionResult<KudosResult>> => {
    const parsed = kudosInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("kudos")
      .select("id")
      .eq("action_log_id", parsed.data.actionLogId)
      .eq("user_id", user.id)
      .eq("emoji", parsed.data.emoji)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("kudos").delete().eq("id", existing.id);
      if (error) return failure(mapSupabaseError(error));
      return success({ toggled: "removed" });
    }

    const { error } = await supabase.from("kudos").insert({
      action_log_id: parsed.data.actionLogId,
      user_id: user.id,
      emoji: parsed.data.emoji,
    });
    if (error) return failure(mapSupabaseError(error));

    void track({
      name: "kudos_given",
      props: { actionLogId: parsed.data.actionLogId, emoji: parsed.data.emoji },
    }).catch((e) => console.error("[toggleKudos] track failed", e));

    return success({ toggled: "added" });
  },
);
```

- [ ] **Step 2: Integration test**

Create `tests/integration/actions/give-kudos.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { asUser, admin } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";

async function activeLog() {
  const owner = await createUser();
  const other = await createUser();
  const g = await createGroup(owner.id);
  await addMember(g.id, other.id);
  const c = await createPendingChallenge(g.id);
  await admin.from("challenge_participants").insert([
    { challenge_id: c.id, user_id: owner.id },
    { challenge_id: c.id, user_id: other.id },
  ]);
  await admin
    .from("challenges")
    .update({
      status: "active",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    .eq("id", c.id);
  const { data: log } = await admin
    .from("action_logs")
    .insert({
      challenge_id: c.id,
      user_id: owner.id,
      activity_type: "gym",
      photo_url: "x",
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑"],
      ai_summary: "ok",
      prompt_version: "v1",
    })
    .select()
    .single();
  return { owner, other, log: log! };
}

describe("kudos RLS + uniqueness", () => {
  it("other member can insert kudos", async () => {
    const { other, log } = await activeLog();
    const client = await asUser(other.id);
    const { error } = await client.from("kudos").insert({
      action_log_id: log.id,
      user_id: other.id,
      emoji: "🔥",
    });
    expect(error).toBeNull();
  });

  it("author cannot kudos their own log (RLS)", async () => {
    const { owner, log } = await activeLog();
    const client = await asUser(owner.id);
    const { error } = await client.from("kudos").insert({
      action_log_id: log.id,
      user_id: owner.id,
      emoji: "🔥",
    });
    expect(error).not.toBeNull();
  });

  it("duplicate emoji from same user violates unique (23505)", async () => {
    const { other, log } = await activeLog();
    const client = await asUser(other.id);
    await client.from("kudos").insert({
      action_log_id: log.id,
      user_id: other.id,
      emoji: "🔥",
    });
    const { error } = await client.from("kudos").insert({
      action_log_id: log.id,
      user_id: other.id,
      emoji: "🔥",
    });
    expect(error?.code).toBe("23505");
  });
});
```

Run: `pnpm test:integration give-kudos`
Expected: 3 PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/challenge/[id]/_actions.ts" tests/integration/actions/give-kudos.spec.ts
git commit -m "feat(kudos): add toggleKudos Server Action with unique constraint handling"
```

---

### Task 16: 전체 검증

**Files:** 없음(검증만)

- [ ] **Step 1: typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 2: 단위 테스트**

Run: `pnpm test`
Expected: 기존 71 + 새 8(response 1 + supabase-error 6 + error-messages 1) = 79 tests PASS.

- [ ] **Step 3: Integration 테스트**

Run: `pnpm test:integration`
Expected:
- `tests/integration/harness.spec.ts` — 2
- `tests/integration/actions/create-challenge.spec.ts` — 3
- `tests/integration/actions/sign-pledge.spec.ts` — 2
- `tests/integration/actions/submit-action-log.spec.ts` — 2
- `tests/integration/actions/give-kudos.spec.ts` — 3
- `tests/integration/reads/active-challenge.spec.ts` — 1
- 총 **13 integration tests PASS**.

- [ ] **Step 4: 수동 E2E**

Run: `pnpm db:reset && pnpm dev`

시나리오:
1. `/login` → 임의 이메일 → Inbucket 링크 → `/home`.
2. `/home` → "진행 중인 서약서 없음" 상태.
3. Studio 에서 owner group + members 수동 seed.
4. `/challenge/new?groupId=<g>` → 폼 제출 → 챌린지 생성 확인.
5. Studio 에서 `challenge_participants` 수동 seed (owner + 다른 2명).
6. 각 유저 magic link 로그인 후 `/pledge` → 서명 → 마지막 서명 시 status=active.
7. `/action` → 키워드 + 제출 → action_logs insert + AI summary 저장.
8. `/challenge/<id>` → MemberStrip 진행률 렌더.

- [ ] **Step 5: RLS smoke (Studio)**

```sql
-- authenticated 유저 A 시뮬레이션
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"<A-uuid>","role":"authenticated"}';
select id from public.challenges;
-- A 가 속한 그룹의 것만 나와야 함.
```

Expected: 본인 그룹의 챌린지만 반환.

- [ ] **Step 6: 검증 완료 — 커밋 없이 다음 Task 로**

---

### Task 17: DECISIONS 로그 — D-011 / D-012 / D-013

**Files:**

- Modify: `docs/TEAM_SHARE_DECISIONS.md`

- [ ] **Step 1: 기존 포맷 확인**

Run: `grep -n "^## D-" docs/TEAM_SHARE_DECISIONS.md | head -5`
Expected: D-010 → D-009 → D-008 → D-007 → ... 순서(최신이 위).

- [ ] **Step 2: ADR 엔트리 append — D-013/012/011 순서(최신이 위)**

Edit `docs/TEAM_SHARE_DECISIONS.md` — D-010 엔트리 **위**에 다음 3개를 최신 순(D-013, D-012, D-011)으로 삽입. D-008~D-010 과 동일한 7-필드 포맷(맥락/옵션/결정/근거/영향/되돌릴 조건/되돌리기 비용) 을 따를 것:

```markdown
## D-013 — BFF Read 레이어를 RSC 페이지에서 분리 (2026-04-30)

**맥락**: 홈/챌린지 디테일/서약 페이지의 데이터 페칭을 `page.tsx` 에 inline `await supabase.from(...)` 으로 두면 POC 동작에는 문제 없으나, 주간 정산·피드 페이지네이션 같은 Day 2+ 요구가 들어오면 "쿼리 shape" 과 "UI 조립" 이 같은 파일에서 엉켜 캐싱 전략 교체가 어렵다.

**옵션**: (a) 페이지에 직접 호출 (b) `src/lib/db/reads/*.ts` 로 분리 (c) React Query + client fetch.

**결정**: (b) 채택. 3개 read 지점(`fetchActiveChallenge`·`fetchChallengeDetail`·`fetchPendingPledge`)을 `src/lib/db/reads/*.ts` 로 분리. page 는 supabase-js 를 직접 부르지 않는다.

**근거**: RSC 이점 유지 + material view/request-memo 교체 시 UI 미수정. (c) 는 SSR 비용 2배 + POC 범위 밖.

**영향**: home/challenge/[id]/pledge 3 페이지 구조 변경.

**되돌릴 조건**: Day 2+ 에 "cache 전략을 쓸 일이 없다"는 결론이 나오면 inline 으로 원복.

**되돌리기 비용**: 낮음. 3 함수를 page 본문으로 inline 하는 리팩터 수준.

---

## D-012 — Error taxonomy 6 코드 확정 (2026-04-30)

**맥락**: Batch A~C 에서는 `ActionResult.error` 가 `unauthorized`/`invalid_input` 2 코드로 충분했으나, 실 DB 연동 후 RLS 거부(42501)·unique 충돌(23505)·대상 부재(PGRST116)·FK 위반(23503) 이 등장. UI 분기(로그인 화면 이동 vs 재시도 vs "없음" 안내) 가 각기 다르다.

**옵션**: (a) 모두 `upstream_error` 1 코드 (b) 6 코드 유니언 (`unauthorized | forbidden | invalid_input | not_found | conflict | upstream_error`) (c) HTTP 상태 코드 직수용.

**결정**: (b) 채택. `mapSupabaseError()` 가 Postgres/PostgREST 코드를 이 6 코드로 투영. `makeUserMessage()` 는 6 코드 모두 한국어 카피 보유.

**근거**: (a) 는 UX 분기 불가. (c) 는 의미 중복 + 프레임워크 종속.

**영향**: `response.ts`·`error-messages.ts`·`supabase-error.ts` + 모든 Server Action 호출부.

**되돌릴 조건**: 코드 3 개만 쓰이고 있다는 사용 통계가 6개월 간 지속되면 축소 고려.

**되돌리기 비용**: 중간. 유니언 축소는 ErrorCode 참조 모든 호출부 영향.

---

## D-011 — 로컬 Supabase + Magic Link 를 Day 2 개발 인증 경로로 채택 (2026-04-30)

**맥락**: 카카오 OAuth 는 redirect URL/키 발급/앱 심사가 필요해 POC 2주 내 진행 어려움. 반면 RLS 검증은 real auth 없이 불가능.

**옵션**: (a) `DEV_BYPASS_AUTH=1` 계속 유지 (b) Supabase 내장 email OTP (c) 카카오 OAuth 즉시 연결.

**결정**: (b) 채택. 로컬 dev 기본 인증으로 magic link. 카카오 provider 는 v1 백로그.

**근거**: (a) 는 RLS 검증 불가. (c) 는 POC 범위 초과.

**영향**: `(auth)/login/page.tsx` 이메일 입력 버튼, `(auth)/login/_actions.ts`, `auth/callback/route.ts` 추가. `(app)/layout.tsx` 의 DEV_BYPASS_AUTH 분기 제거.

**되돌릴 조건**: 카카오 OAuth 가 준비되면 magic link 는 dev 보조 경로로 축소.

**되돌리기 비용**: 낮음. login UI 교체 수준. `supabase/config.toml` + callback 확장이면 카카오 추가 가능.
```

- [ ] **Step 3: 순서 확인**

Run: `grep -n "^## D-" docs/TEAM_SHARE_DECISIONS.md | head -6`
Expected: D-013, D-012, D-011, D-010, D-009, D-008 순서.

- [ ] **Step 4: Commit**

```bash
git add docs/TEAM_SHARE_DECISIONS.md
git commit -m "docs(decisions): log D-011/D-012/D-013 — magic link auth, error taxonomy, BFF reads"
```

---

## 3. Out of Scope (이 계획에서 하지 않는 것)

- **카카오 OAuth** — D-011 에 따라 v1 이월.
- **Realtime subscriptions** — `BE_SCHEMA_RLS §3` 에 따라 POC 비활성.
- **Storage signed URL 사진 업로드** — `submitActionLog` 의 `photo_url` 은 UI 측에서 여전히 `https://example.com/photo.jpg` hardcoded. Storage 버킷 + RLS + signed URL 은 별도 PR.
- **Weekly recap (`/recap`)** — PRD §11. 별도 PR.
- **Invite accept Server Action (`acceptInvite`)** — `BE_SCHEMA §8.3` 정의. 본 plan 제외. 별도 PR(`group_members` INSERT + `challenge_participants` upsert 가 service_role 경유라 설계 분량이 별개).
- **pgTAP RLS 스모크 테스트** — `BE_SCHEMA_RLS §4` Follow-up. v1.
- **프로덕션 Supabase 프로젝트 + Vercel env 매핑** — 별도 문서(`ONBOARDING` 업데이트 필요).

## 4. Follow-up (다음 PR 후보)

- [ ] 사진 업로드 Flow — Supabase Storage 버킷 + RLS + signed URL + iOS/AOS camera capture.
- [ ] `acceptInvite(token)` Server Action — group_members + challenge_participants upsert.
- [ ] FeedCard 를 `/challenge/[id]` 에 mount + `action_logs` 피드 조회 read model + kudos 토글 연결.
- [ ] Realtime subscriptions 여부 결정 + 인덱스 재평가.
- [ ] pgTAP 기반 RLS 정책 회귀 테스트.
- [ ] 프로덕션 Supabase 프로젝트 + Vercel env 자동화.
- [ ] `/recap` 주간 정산 + cron (`challenges.status → closed` 자동 전이).
- [ ] 카카오 OAuth provider 배선 + `(auth)/callback` 확장.

---

## 5. 자체 검토 (Self-Review)

### 5.1 Spec coverage

- **BE_SCHEMA §5 테이블 10종** → Task 6 ✅
- **BE_SCHEMA §6 인덱스 8 + 추가 `group_members(user_id, group_id)` 1** → Task 6 ✅
- **BE_SCHEMA §7 RLS matrix** → Task 5 (contract 문서) + Task 7 (SQL) ✅
- **BE_SCHEMA §8 Server Action 계약 6종** → Task 10/11/15 ✅ (§8.2/§8.3 invite 는 Out of Scope)
- **Auth 실배선** → Task 1/2 ✅
- **Integration test harness** → Task 3 ✅
- **Error taxonomy 확장** → Task 9 ✅
- **BFF Read 레이어** → Task 12/13/14 ✅
- **Ownership 이중 방어** → Task 11 Step 4 (submitActionLog 에 직접 포함) ✅
- **DECISIONS 로그 3건** → Task 17 ✅

### 5.2 Placeholder scan

- TBD/TODO 없음. 모든 Step 에 완전한 코드/명령/expected.
- "add appropriate error handling" 없음 — 매 Action 에 구체적 failure/success 명시.
- "similar to Task N" 없음 — 각 Task 에 code 전체 반복.

### 5.3 Type consistency

- `ActionResult<T>` 와 `ErrorCode` 는 Task 9 에서 확정, Task 10/11/15 에서 동일 shape 사용.
- `ErrorCode` 6 코드가 Task 9 (response.ts) · Task 9 (error-messages.ts) · Task 9 (supabase-error.ts) 에서 일치.
- `fetchActiveChallenge` 의 `ActiveChallengeView` (Task 12) 와 `ProgressCard` 기존 props (title/goalCount/doneCount/potTotal/daysLeft) 정렬됨.
- `sign_and_maybe_activate` RPC 반환 shape(status/start_at/end_at) 와 Task 11 의 `SignResult.status` 일치.
- `toggleKudos.KudosResult.toggled` 는 `"added" | "removed"` — Follow-up 에서 FeedCard 에 연결 시 UI 분기용.

---

## 6. 실행 핸드오프

**Plan complete and saved to `docs/superpowers/plans/2026-04-30-db-bff-integration.md`. Two execution options:**

**1. Inline Execution + 3 Batch (권장)** — Cross-task 계약(`ActionResult<ErrorCode>` · `ActiveChallengeView` · `sign_and_maybe_activate` RPC shape)이 연속 검증 품질에 직결.

- **Batch S0+S1**: Task 1~5 (Auth 실배선 + 하니스 + RLS contract). 실행 전 `supabase start` Docker 기동 확인. 끝나면 `/verify` + `/compact`.
- **Batch S2**: Task 6~8 (DDL + RLS + RPC). 끝나면 `pnpm db:reset` → `pnpm test:integration tests/integration/harness.spec.ts` PASS 확인.
- **Batch S3+S4+S5**: Task 9~17 (BFF write + read + kudos + 검증 + 문서). error taxonomy 가 write/read 양쪽에 걸치므로 일관 수정이 유리. 끝나면 `/verify` + `/code-review`.

**2. Subagent-Driven** — 태스크당 새 subagent. 단, `ErrorCode` 유니언(Task 9 ↔ 10/11/15)· `sign_and_maybe_activate` RPC(Task 8 ↔ 11)· `fetchActiveChallenge` view type(Task 12 ↔ 13) 같은 **cross-task type consistency** 가 약해짐. 권장하지 않음.

**어느 방식으로 진행할까요?**
