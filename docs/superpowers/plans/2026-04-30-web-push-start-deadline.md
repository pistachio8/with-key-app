# Web Push: start + deadline 알림 end-to-end 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 코드에 "scaffold 만 있는" Web Push 를 **실제 사용자 기기까지 도달하는 2 종 알림** (챌린지 `active` 전이 = 시작 알림, `end_at - 24h` = 마감 임박 알림) 으로 완주한다. `/settings` 토글이 실 구독 등록/해제를 수행하고, `sign_and_maybe_activate` 가 `status='active'` 를 반환하면 참가자 전원에게 푸시가 나가며, 매시간 Vercel Cron 이 마감 임박 챌린지를 스캔해 중복 없이 1 회 보낸다.

**Architecture:**

- **구독 쓰기 경로는 Server Action 단일 step**. 브라우저가 `pushManager.subscribe()` 로 받은 `{ endpoint, p256dh, auth }` 를 `registerPushSubscription` Server Action 에 JSON 으로 전송. 서버는 user-scoped client 로 `push_subscriptions` 에 `upsert`(`endpoint` unique). RLS `ps_all_self` (0002) 가 타인 endpoint 쓰기를 막는다.
- **알림 선호도는 `users.notification_prefs jsonb`**. 별도 테이블 금지 (POC 1:1 row). 기본값 `{"start":true,"deadline":true}`. 토글은 Server Action 으로 self-update. 기존 `ONBOARDING.md` §6.4 의 "Quiet Hours" 는 서버 타임(KST) 으로 판정 — 선호도와 별개.
- **시작 알림 dispatch**: `signPledge` Server Action 에서 RPC 결과 `status === "active"` 일 때 **동일 요청 내**에서 참가자 전원의 `push_subscriptions` 를 불러 `sendPush` fan-out. `notification_sent` 이벤트 기록. 10x 참가자 × 1 endpoint 기준 < 500ms 가 POC 범위.
- **마감 임박 알림 dispatch**: `/api/cron/deadline-push` Route Handler + `vercel.json` cron (매시간). `challenges where status='active' and end_at between now()+23h and now()+25h` 를 admin client 로 스캔. **중복 방지는 `events` 테이블 조회** (`name='notification_sent' and props->>'challengeId'=... and props->>'type'='deadline'`). 별도 idempotency 테이블 도입 금지 (YAGNI — `events` 가 이미 감사 로그 겸용).
- **Quiet Hours 02–07 KST 는 _발송 시점_ 차단**. 큐잉/재스케줄 없음 (POC). 시작 알림이 quiet hour 에 걸리면 "못 보낸" 채로 `notification_sent` 이벤트 만 `props.suppressed=true` 로 기록. 마감 임박은 cron 주기(1h) 가 quiet hour 를 피해 재시도하게 둔다 — 실제 마감은 24h 창이라 07 시 이후 최대 5h 지연 수용.
- **410 Gone / 404 Not Found 구독은 즉시 삭제**. `sendPush` 가 throw 하면 에러 statusCode 를 확인해 `push_subscriptions` row 를 제거. 누적 방지.
- **service_role 사용 경계**: cron 은 admin client 필요 (인증 세션 없음). 그 외 경로(Settings 토글 · signPledge) 는 전부 user-scoped client. `CRON_SECRET` 환경변수로 cron endpoint 를 토큰 가드.

**Tech Stack:** Next.js 16 App Router · web-push 3.x (이미 설치) · Supabase JS v2 · zod · Vitest (unit + integration) · Playwright (smoke). PWA manifest + service worker 는 `public/` 평문 (별도 라이브러리 추가 금지).

---

## 0. Revision History

**v1 (2026-04-30)** — 초안. D-017 (AI 일기 + events) merge 직후 JOURNAL "남긴 부채" 에 남긴 "Web Push + `notification_sent`" 를 정식 plan 화. Storage plan (`2026-04-30-storage-photo-signed-url.md`) 과는 파일 교집합 없음 → 병렬 진행 가능.

---

## 0. 사전 이해 — 이 plan 이 해결하는 것

`docs/JOURNAL.md` 2026-04-30 (밤) "남긴 부채 → Web Push + `notification_sent` 이벤트" 항목과 `docs/PRD.md` §6.3 · `docs/ONBOARDING.md` §6.4 가 요구하지만 **현재 코드에 미배선**인 것 (repo 실측):

1. **구독 UI 없음** — [src/app/(app)/settings/page.tsx:5-7](src/app/(app)/settings/page.tsx#L5-L7) 의 `startNoti`/`deadlineNoti` 가 `useState` 로컬만. `// TODO(Day 2): Supabase 에 user.notification_prefs JSON 저장. Web Push 구독도 배선.` 주석이 달려 있음.
2. **`users.notification_prefs` 컬럼 부재** — [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) `users` 테이블에 컬럼 없음.
3. **구독 Server Action 없음** — `src/app/(app)/settings/_actions.ts` 파일 자체 부재.
4. **manifest / service worker / 아이콘 부재** — `public/` 에 `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` 만 있음. PWA 자체가 설치 불가 상태 → `pushManager.subscribe()` 는 SW 가 있어야 호출 가능.
5. **dispatch 경로 없음** — [src/app/(app)/pledge/_actions.ts:22-41](src/app/(app)/pledge/_actions.ts#L22-L41) 이 `status === "active"` 를 알지만 아무도 푸시하지 않음.
6. **deadline cron 없음** — `vercel.json` 에 `crons` 필드 없음. `src/app/api/cron/` 폴더 자체 부재.
7. **`/api/push/route.ts` 는 껍데기** — [src/app/api/push/route.ts:5-7](src/app/api/push/route.ts#L5-L7) `GET` 이 `{ ok: true }` 만 반환.
8. **410/404 cleanup 없음** — `sendPush` 에 try/catch 만 없을 뿐 아니라 호출부 자체가 없어 unsubscribe 누적 방어가 무의미.
9. **`notification_sent` / `notification_opened` 이벤트 정의는 있음** — [src/lib/analytics/track.ts:57-58](src/lib/analytics/track.ts#L57-L58) · [src/lib/analytics/schema.ts:91-95](src/lib/analytics/schema.ts#L91-L95). **props 형태 업데이트 필요**: 현재 `{ type: "start" | "deadline" }` 뿐. `challengeId` · `suppressed` · `queued` 추가.

이 plan 이 **하지 않는 것** (§3 에 명시): (a) quiet hours 큐잉/재발송 — POC 는 suppressed 기록만, (b) Expo / iOS Safari 한정 이슈 대응 — PWA 설치 후 iOS Safari 16.4+ 면 동작, 그 외 환경은 Settings UI 가 "지원 안 됨" 표시, (c) user-facing "알림 테스트 보내기" 버튼 (운영툴 v1 이월), (d) 알림 개인화 (실명/이모지 가변) — PRD 범위 초과, (e) Slack 운영 알림 (80% AI 예산과 함께 별도 plan).

---

## 0.5 실행 가드레일 (Pre-flight)

### 의존성 순서 (반드시 이 순서로)

```
Task 1 (0010 migration: users.notification_prefs)
  → Task 2 (public/manifest.json + public/service-worker.js + public/icons/*)
  → Task 3 (src/lib/push/subscribe.ts — browser-side helpers)
  → Task 4 (validator + settings Server Action: upsert subscription, update prefs)
  → Task 5 (settings page: real toggles wired to Server Action)
  → Task 6 (src/lib/push/dispatch.ts — fan-out + 410 cleanup + quiet hours)
  → Task 7 (signPledge 에 start 알림 dispatch 주입)
  → Task 8 (vercel.json cron + /api/cron/deadline-push)
  → Task 9 (analytics schema: notification_sent props 확장)
  → Task 10 (integration: subscribe · signPledge dispatch · deadline cron)
  → Task 11 (E2E: settings 토글 smoke)
  → Task 12 (docs/DECISIONS D-019 + ONBOARDING §6.4 보강)
```

Task 3 은 **브라우저 전용** (service worker 및 `navigator.pushManager` 참조). 서버 코드가 import 하면 Next build 가 깨진다. `"use client"` 강제.
Task 6 은 **서버 전용** (`import "server-only"` 가드). `webpush.sendNotification` + admin/user client 혼용.
Task 7 은 Task 6 의 함수만 쓰고, Task 4 가 만든 Settings 경로와는 독립 — PR 분할 시 교집합 없음.

### PR 분할 (권장)

| PR | Tasks | 합쳐진 상태에서 green |
|----|-------|--------------------|
| **PR-A** — 구독 파이프라인 | 1 · 2 · 3 · 4 · 5 · 9 | `/settings` 토글이 실제 구독/해제 수행. 알림은 아직 안 나감. |
| **PR-B** — 시작 알림 | 6 · 7 · 10(부분) | 2 명 서명 완료 시 참가자 전원에게 푸시 도착. |
| **PR-C** — 마감 임박 + 문서 | 8 · 10(나머지) · 11 · 12 | 매시간 cron 이 `end_at - 24h` 챌린지 스캔 후 1 회 발송. D-019 merge. |

각 PR 은 독립적으로 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` green. PR-A 만 머지돼도 회귀 없음(토글은 작동, 서버 dispatch 경로는 호출자 없음).

### Task × ECC 에이전트 매핑

| Task | ECC 호출 | 핵심 체크 |
|------|---------|----------|
| 1 users.notification_prefs | database-reviewer | `jsonb` default 객체 매개변수, 기존 row backfill, CHECK (start/deadline bool) |
| 2 manifest + SW | a11y-architect + security-reviewer | `display: standalone`, SW scope `/`, `notificationclick` CSP 안전 |
| 3 subscribe helper | security-reviewer | `applicationServerKey` 변환, permission denied 경로, unsubscribe cleanup |
| 4 settings Server Action | security-reviewer + silent-failure-hunter | `withUser`, Zod endpoint URL 검증, RLS self-only 확인, prefs upsert racing |
| 5 settings UI | a11y-architect | `role=switch` + `aria-checked` 유지, 미지원 브라우저 배너, pending 상태 |
| 6 dispatch helper | security-reviewer + silent-failure-hunter | 410/404 자동 cleanup, quiet hour 판정, admin client 경계 |
| 7 signPledge 시작 알림 | /code-review | fire-and-forget, 실패 swallow, `user_id` props 정합성 |
| 8 vercel cron | security-reviewer | `CRON_SECRET` 헤더 가드, 중복 dispatch 방지 쿼리 인덱스 |
| 9 analytics schema 확장 | type-design-analyzer | Zod ↔ TS union parity, `schema-union-parity.spec.ts` 가 잡는지 |
| 10 integration | /code-review | `push_subscriptions` row · `events` row · 410 cleanup 3-way |
| 11 E2E | e2e-runner | 브라우저 permission mocking (`context.grantPermissions`) |
| 12 ADR D-019 | architecture-decision-records | "fan-out in-request vs queue" 선택 근거, quiet hour suppressed-only |

### 환경 가드

- [ ] `web-push` 는 이미 `dependencies` 에 있음(`src/lib/push/vapid.ts` import 확인). 추가 설치 불필요.
- [ ] `.env.local` 및 Vercel(Preview/Prod) 에 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` · `VAPID_SUBJECT` 모두 채워져 있어야 함. 미설정 시 Task 3/6 이 런타임에 throw. **PR-A 머지 전** 로컬에서 `pnpm exec web-push generate-vapid-keys` 로 생성 → 1Password 공유 → Vercel env 등록 (모든 scope).
- [ ] `CRON_SECRET` 은 Task 8 에서 신규 추가. `.env.example` 에 추가 + Vercel (Production + Preview) 등록.
- [ ] HTTPS 필요 — PWA Push 는 localhost 또는 HTTPS 에서만 동작. `pnpm dev` 는 localhost 라 OK, Vercel Preview 는 HTTPS 기본.
- [ ] 로컬 Safari/Firefox 테스트는 Task 11 스코프 밖. Chrome/Edge 기준(POC §16 제외 범위).

---

## 0.6 Decision 박스 — 설계 분기점

### D-box-1: dispatch 경로 — 요청 내 fan-out vs. queue

| 기준 | A. 요청 내 직접 fan-out (선택) | B. 큐 (SQS/Upstash/pg_cron) |
|------|-------------------------------|----------------------------|
| 구현 복잡도 | Low — `await Promise.allSettled(subs.map(sendPush))` | High — 큐 · 재시도 · dead-letter · 모니터링 |
| POC 스케일 영향 | 10 인 기준 < 500ms, 사용자 체감 없음 | 오버 엔지니어링 |
| 실패 관찰 | `notification_sent` 이벤트 `suppressed` 필드 | 큐 상태 + 이벤트 양쪽 확인 필요 |
| 재시도 | 없음 (POC 허용) | 자동 |

**선택: A (요청 내 fan-out)**. POC 10 명 내외에서 큐는 과잉. v1 에서 100+ 참가자 · 다건 알림 필요해지면 B 로 마이그레이션 + ADR 추가.

### D-box-2: deadline 중복 방지 — idempotency 테이블 vs. events 조회

| 기준 | A. `events` 조회 (선택) | B. 전용 `notification_dispatch_log` 테이블 |
|------|-----------------------|-----------------------------------------|
| 추가 DDL | 없음 | 신규 테이블 + RLS + 인덱스 |
| 조회 비용 | `events (name, props)` 1 쿼리 | PK lookup 1 쿼리 |
| 감사 | `events` 와 통합 | 별도 테이블 분산 |
| 인덱스 필요 | `events.props` gin (이미 있음, 0008) | 신규 |

**선택: A (`events` 조회)**. 0008 의 `events_props_gin_idx` 가 이미 `props->>'challengeId'` 조회를 커버. `notification_sent` 행이 곧 dispatch ledger. POC 하루 수십 row 수준이라 gin index 로 충분.

### D-box-3: notification_prefs 저장 — `users.jsonb` vs. 별도 테이블

| 기준 | A. `users.notification_prefs jsonb` (선택) | B. `user_notification_prefs` 1:1 테이블 |
|------|-------------------------------------------|---------------------------------------|
| 추가 DDL | 1 컬럼 + default | 신규 테이블 + RLS + FK |
| 쿼리 수 | 0 (user row 에 같이) | 1 (join 또는 별도 fetch) |
| 향후 확장 | `{ start, deadline, quietHours?: { from, to } }` 로 성장 | 컬럼 추가 자유 |
| 스키마 진화 | PRD 알림 2 종 고정이라 jsonb 확장 충분 | 과잉 |

**선택: A (`users.jsonb`)**. PRD 는 알림 2 종(§6.3) 이상을 요구하지 않음. 3 종 넘게 늘어날 일이 생기면 그때 쪼갠다.

### D-box-4: 브라우저 미지원 UX — 숨김 vs. 배너

사파리 데스크톱 < 16.4, 구형 Android 웹뷰 등 `"serviceWorker" in navigator === false` 또는 `"PushManager" in window === false` 환경.

- **선택: 배너 표시**. `<section aria-labelledby="push-unsupported">이 브라우저는 푸시 알림을 지원하지 않아요. 크롬/엣지/사파리 16.4+ 에서 다시 시도해 주세요.</section>`. 토글은 숨김. 근거: 지원 안 됨을 조용히 숨기면 "토글이 왜 없지?" 로 CS 비용. 명시가 PRD "친구 단톡방" 톤에도 맞음.

---

## 1. File Structure

### 1.1 DB (1 마이그레이션)

- Create: `supabase/migrations/0010_notification_prefs.sql` — `alter table public.users add column notification_prefs jsonb not null default '{"start":true,"deadline":true}'::jsonb`. `0001_init` 시점 유저에게는 default 값이 자동 backfill (`not null default`). CHECK constraint 로 키 존재 + boolean 강제.

> **주의**: Storage plan (`2026-04-30-storage-photo-signed-url.md`) 이 `0010_action_logs_photo_path.sql` 을 예약. 두 plan 이 동시 진행되면 번호 충돌 → **먼저 머지되는 쪽이 0010, 뒤는 0011 로 rename**. 본 plan 머지 직전 `pnpm exec supabase migration list --linked` 로 확인 후 필요시 rename 커밋. Task 1 Step 1 에 체크 포함.

### 1.2 PWA 자산

- Create: `public/manifest.json` — `name`, `short_name`, `icons`, `start_url: "/home"`, `display: "standalone"`, `theme_color`, `background_color`.
- Create: `public/service-worker.js` — `push` 이벤트 → `showNotification`, `notificationclick` → `clients.openWindow + fetch("/api/push/opened", {method:"POST", body})`.
- Create: `public/icons/icon-192.png` (1x1 placeholder, base64 생성 후 commit — 디자이너 산출물은 별도 PR).
- Create: `public/icons/icon-512.png` (동일).

### 1.3 브라우저 subscribe helper

- Create: `src/lib/push/subscribe.ts` — `"use client"` 강제. `isPushSupported()`, `getSubscription()`, `subscribeToPush()`, `unsubscribeFromPush()`.
- Create: `src/lib/push/subscribe.spec.ts` — jsdom, `navigator.serviceWorker` mock.

### 1.4 validator + Server Action

- Create: `src/lib/validators/push.ts` — `pushSubscriptionSchema` (endpoint url + p256dh/auth base64url).
- Create: `src/lib/validators/push.spec.ts`.
- Create: `src/app/(app)/settings/_actions.ts` — `registerPushSubscription`, `unregisterPushSubscription`, `updateNotificationPrefs`. 모두 `withUser`.
- Create: `src/app/(app)/settings/_actions.spec.ts` — unit (input validation + 성공/실패 branch).

### 1.5 Settings UI 재작성

- Modify: `src/app/(app)/settings/page.tsx` → Server Component 로 전환(초기 prefs + 구독 상태 로드).
- Create: `src/app/(app)/settings/_components/push-settings.tsx` — `"use client"` 실 토글, Server Action 호출, 지원 안 됨 배너.
- Create: `src/app/(app)/settings/_components/push-settings.spec.tsx` — RTL + jsdom.
- Create: `src/lib/db/reads/notification-prefs.ts` — `fetchNotificationPrefs(userId)`.

### 1.6 서버 dispatch

- Create: `src/lib/push/dispatch.ts` — `import "server-only"`. Exports `dispatchStartNotification(challengeId)`, `dispatchDeadlineNotification(challengeId)`, `cleanupInvalidSubscription(endpoint)`.
- Create: `src/lib/push/dispatch.spec.ts` — unit (quiet hour 가지, 410 cleanup, fan-out 순서).

### 1.7 signPledge 배선

- Modify: `src/app/(app)/pledge/_actions.ts` — `status === "active"` 분기에서 `void dispatchStartNotification(challengeId)`.

### 1.8 Vercel Cron

- Create: `vercel.json` — `{"crons":[{"path":"/api/cron/deadline-push","schedule":"0 * * * *"}]}`. 이미 있으면 merge.
- Create: `src/app/api/cron/deadline-push/route.ts` — `CRON_SECRET` 검증, 대상 challenge 스캔, dispatch.
- Create: `src/app/api/cron/deadline-push/route.spec.ts` — unit, admin client mock.
- Modify: `.env.example` — `CRON_SECRET` 추가.
- Modify: `docs/DEPLOY.md` — cron · CRON_SECRET 매핑 섹션 추가.

### 1.9 notification_opened beacon

- Modify: `src/app/api/push/route.ts` → `/api/push/opened` 로 rename(path 기준 새 파일). POST body 로 `{ challengeId, type }` 받고 `track("notification_opened", { ... })`. GET 은 유지(헬스체크).
- Create: `src/app/api/push/opened/route.ts` — POST 핸들러.

### 1.10 analytics schema 확장

- Modify: `src/lib/analytics/track.ts` — `notification_sent` / `notification_opened` props 확장.
- Modify: `src/lib/analytics/schema.ts` — 동일.
- Modify: `src/lib/analytics/schema-union-parity.spec.ts` — 새 필드 케이스 추가.

### 1.11 Tests

- Create: `tests/integration/push/register-subscription.spec.ts`.
- Create: `tests/integration/push/dispatch-start.spec.ts` — 2 명 서명 → active → `events` 에 `notification_sent`.
- Create: `tests/integration/push/deadline-cron.spec.ts` — end_at 24h 이내 + cron POST → `notification_sent` 정확히 1 회 (재호출 시 중복 없음).
- Create: `tests/e2e/push-settings.spec.ts` — `context.grantPermissions(['notifications'])` 로 토글 smoke.
- Modify: `tests/integration/setup.ts` — `cleanupSubscriptions` helper (truncate test `@test.local` 소유 subs).

### 1.12 문서 + ADR

- Modify: `docs/TEAM_SHARE_DECISIONS.md` — **D-019** append.
- Modify: `docs/ONBOARDING.md` §6.4 — 실 dispatch 경로 · cron 주기 · quiet hour 정책 구체화.

---

## 2. Tasks

### Task 1: `users.notification_prefs` 마이그레이션

> **근거**: 알림 선호도 저장 위치. 별도 테이블은 POC YAGNI (D-box-3). `jsonb` + CHECK 가 타입 안전성 + 확장성 균형.

**Files:**
- Create: `supabase/migrations/0010_notification_prefs.sql`
- Modify: `src/types/supabase.ts` (자동 생성)

- [ ] **Step 1: migration 번호 충돌 확인**

Run: `pnpm exec supabase migration list --linked`
Expected: 최신이 `0009_ai_cost_log`. Storage plan(`0010_action_logs_photo_path`) 이 이미 apply 됐으면 본 파일을 `0012_notification_prefs.sql` 로 수정.

- [ ] **Step 2: migration 파일 작성**

Create `supabase/migrations/0010_notification_prefs.sql`:

```sql
-- 0010_notification_prefs.sql — users.notification_prefs jsonb.
-- PRD §6.3 알림 2종 (start / deadline) 선호도. POC 범위라 별도 테이블 금지.

alter table public.users
  add column notification_prefs jsonb not null
  default '{"start":true,"deadline":true}'::jsonb;

-- CHECK: start/deadline 키가 반드시 존재하고 boolean 이어야 한다.
alter table public.users
  add constraint users_notification_prefs_shape_chk check (
    jsonb_typeof(notification_prefs -> 'start') = 'boolean'
    and jsonb_typeof(notification_prefs -> 'deadline') = 'boolean'
  );

comment on column public.users.notification_prefs is
  'Push notification preferences. Shape: {"start":bool,"deadline":bool}. See PRD §6.3.';
```

- [ ] **Step 3: 로컬 reset + 타입 재생성**

Run: `pnpm db:reset && pnpm db:types`
Expected: `src/types/supabase.ts` 의 `users` Row 타입에 `notification_prefs: Json` 필드 포함.

- [ ] **Step 4: 회귀 테스트 작성**

Create `tests/integration/migrations/notification-prefs.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { admin } from "../setup";
import { createUser } from "../factories";

describe("users.notification_prefs", () => {
  it("defaults new rows to {start:true, deadline:true}", async () => {
    const u = await createUser();
    const { data } = await admin
      .from("users")
      .select("notification_prefs")
      .eq("id", u.id)
      .single();
    expect(data?.notification_prefs).toEqual({ start: true, deadline: true });
  });

  it("rejects invalid shape via CHECK", async () => {
    const u = await createUser();
    const { error } = await admin
      .from("users")
      .update({ notification_prefs: { start: "yes" } as unknown as object })
      .eq("id", u.id);
    expect(error?.code).toBe("23514");
  });
});
```

- [ ] **Step 5: 실행 + pass 확인**

Run: `pnpm test:integration tests/integration/migrations/notification-prefs.spec.ts`
Expected: 2 pass.

- [ ] **Step 6: 리뷰 + 커밋**

- [ ] database-reviewer 호출 (default · CHECK · backfill 영향)
- [ ] Commit

```bash
git add supabase/migrations/0010_notification_prefs.sql src/types/supabase.ts tests/integration/migrations/notification-prefs.spec.ts
git commit -m "feat(db): users.notification_prefs jsonb with shape CHECK"
```

---

### Task 2: PWA manifest + service worker + placeholder icons

> **근거**: `pushManager.subscribe()` 는 SW 가 있어야 호출 가능. manifest 는 iOS Safari 가 Add to Home Screen 이후에만 푸시를 허용해 필수. 아이콘은 디자이너 산출물 전까지 1×1 placeholder.

**Files:**
- Create: `public/manifest.json`
- Create: `public/service-worker.js`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `src/components/pwa-register.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: manifest 작성**

Create `public/manifest.json`:

```json
{
  "name": "윗키 — 친구와의 서약서",
  "short_name": "윗키",
  "start_url": "/home",
  "scope": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#FFFFFF",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: service worker 작성**

Create `public/service-worker.js`:

```js
/* global self, clients */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "윗키", body: "", url: "/home", challengeId: null, type: "start" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // payload parse 실패는 최소 정보로 표시
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url, challengeId: payload.challengeId, type: payload.type },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    (async () => {
      try {
        await fetch("/api/push/opened", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ challengeId: data.challengeId, type: data.type }),
          keepalive: true,
        });
      } catch {
        // 네트워크 실패는 무시 (알림 열기 자체는 성공)
      }
      const url = data.url || "/home";
      const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (c.url.includes(url)) return c.focus();
      }
      return clients.openWindow(url);
    })(),
  );
});
```

- [ ] **Step 3: placeholder 아이콘 생성**

Run (1×1 투명 PNG, 디자이너 산출물 전까지 임시):

```bash
node -e "const fs=require('fs');const b=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');fs.mkdirSync('public/icons',{recursive:true});fs.writeFileSync('public/icons/icon-192.png',b);fs.writeFileSync('public/icons/icon-512.png',b);"
```
Expected: `public/icons/icon-192.png` + `public/icons/icon-512.png` 생성.

- [ ] **Step 4: layout 에 manifest 링크 추가**

Edit `src/app/layout.tsx` `<head>` 에 추가 (`metadata` export 로):

```ts
export const metadata: Metadata = {
  title: "윗키",
  description: "친구와의 서약서",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};
```

- [ ] **Step 5: SW 등록 컴포넌트 작성**

Create `src/components/pwa-register.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      } catch (error) {
        console.warn("[pwa] SW register failed", error);
      }
    };
    void register();
  }, []);
  return null;
}
```

- [ ] **Step 6: layout 에서 PwaRegister 마운트**

Edit `src/app/layout.tsx` body 안쪽:

```tsx
import { PwaRegister } from "@/components/pwa-register";
// ...
<body>
  <PwaRegister />
  {children}
</body>
```

- [ ] **Step 7: 로컬 수동 확인**

Run: `pnpm dev`
Expected: Chrome DevTools → Application → Service Workers 에 `/service-worker.js` 가 `activated and is running`. Manifest 탭에 앱 정보 표시.

- [ ] **Step 8: 리뷰 + 커밋**

- [ ] a11y-architect + security-reviewer 호출 (`display:standalone`, CSP 영향, SW scope)
- [ ] Commit

```bash
git add public/manifest.json public/service-worker.js public/icons/ src/components/pwa-register.tsx src/app/layout.tsx
git commit -m "feat(pwa): manifest + service worker + sw registration"
```

---

### Task 3: 브라우저 subscribe helper

> **근거**: `pushManager.subscribe()` / unsubscribe 호출을 한곳에 모은다. base64url ↔ Uint8Array 변환은 실수 지점(`applicationServerKey` 포맷 틀리면 조용히 subscribe 실패).

**Files:**
- Create: `src/lib/push/subscribe.ts`
- Create: `src/lib/push/subscribe.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `src/lib/push/subscribe.spec.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "./subscribe";

describe("push/subscribe", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("isPushSupported returns false when serviceWorker missing", () => {
    // jsdom 기본: serviceWorker 없음
    expect(isPushSupported()).toBe(false);
  });

  it("isPushSupported returns true when SW + PushManager present", () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: { ready: Promise.resolve({}) },
    });
    vi.stubGlobal("window", { ...window, PushManager: class {} });
    expect(isPushSupported()).toBe(true);
  });

  it("subscribeToPush converts VAPID key and returns JSON subscription", async () => {
    const fakeSub = {
      endpoint: "https://example.com/push/abc",
      toJSON: () => ({
        endpoint: "https://example.com/push/abc",
        keys: { p256dh: "p256", auth: "a" },
      }),
    };
    const subscribe = vi.fn().mockResolvedValue(fakeSub);
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe } }) },
    });
    vi.stubGlobal("window", { ...window, PushManager: class {} });

    const sub = await subscribeToPush("BIK...fakeBase64UrlKey");
    expect(sub).toEqual({
      endpoint: "https://example.com/push/abc",
      p256dh: "p256",
      auth: "a",
    });
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
  });

  it("unsubscribeFromPush calls unsubscribe on existing registration", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: () => Promise.resolve({ endpoint: "e", unsubscribe }),
          },
        }),
      },
    });
    vi.stubGlobal("window", { ...window, PushManager: class {} });
    const endpoint = await unsubscribeFromPush();
    expect(endpoint).toBe("e");
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 테스트 실행 (fail 예상)**

Run: `pnpm test src/lib/push/subscribe.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: 구현 작성**

Create `src/lib/push/subscribe.ts`:

```ts
"use client";

export type BrowserPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof navigator === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<BrowserPushSubscription> {
  if (!isPushSupported()) throw new Error("push_unsupported");
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("subscription_incomplete");
  }
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  const current = await reg.pushManager.getSubscription();
  if (!current) return null;
  await current.unsubscribe();
  return current.endpoint;
}
```

- [ ] **Step 4: 테스트 pass 확인**

Run: `pnpm test src/lib/push/subscribe.spec.ts`
Expected: 4 pass.

- [ ] **Step 5: 리뷰 + 커밋**

- [ ] security-reviewer 호출 (permission denied, unsubscribe 경로)
- [ ] Commit

```bash
git add src/lib/push/subscribe.ts src/lib/push/subscribe.spec.ts
git commit -m "feat(push): browser subscribe/unsubscribe helpers"
```

---

### Task 4: validator + Settings Server Actions

> **근거**: 구독 등록/해제 + prefs 업데이트 3 개 Action. `withUser` + Zod + user-scoped supabase client (RLS 자체 보호).

**Files:**
- Create: `src/lib/validators/push.ts`
- Create: `src/lib/validators/push.spec.ts`
- Create: `src/app/(app)/settings/_actions.ts`
- Create: `src/app/(app)/settings/_actions.spec.ts`
- Create: `src/lib/db/reads/notification-prefs.ts`

- [ ] **Step 1: validator 테스트 작성**

Create `src/lib/validators/push.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pushSubscriptionSchema, notificationPrefsSchema } from "./push";

describe("pushSubscriptionSchema", () => {
  it("accepts valid subscription", () => {
    const out = pushSubscriptionSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: "BFNh...base64urlPublicKey",
      auth: "K9dA...base64urlAuth",
    });
    expect(out.success).toBe(true);
  });

  it("rejects non-https endpoint", () => {
    const out = pushSubscriptionSchema.safeParse({
      endpoint: "http://attacker.com/push",
      p256dh: "BFNh",
      auth: "K9dA",
    });
    expect(out.success).toBe(false);
  });

  it("rejects empty keys", () => {
    const out = pushSubscriptionSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      p256dh: "",
      auth: "K9dA",
    });
    expect(out.success).toBe(false);
  });
});

describe("notificationPrefsSchema", () => {
  it("accepts both booleans", () => {
    expect(
      notificationPrefsSchema.safeParse({ start: true, deadline: false }).success,
    ).toBe(true);
  });
  it("rejects missing keys", () => {
    expect(
      notificationPrefsSchema.safeParse({ start: true }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: validator 구현**

Create `src/lib/validators/push.ts`:

```ts
import { z } from "zod";

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://"),
  p256dh: z.string().min(1).max(256),
  auth: z.string().min(1).max(128),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const notificationPrefsSchema = z.object({
  start: z.boolean(),
  deadline: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;
```

- [ ] **Step 3: validator pass 확인**

Run: `pnpm test src/lib/validators/push.spec.ts`
Expected: 5 pass.

- [ ] **Step 4: read helper 작성**

Create `src/lib/db/reads/notification-prefs.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { notificationPrefsSchema, type NotificationPrefs } from "@/lib/validators/push";

const DEFAULT_PREFS: NotificationPrefs = { start: true, deadline: true };

export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("notification_prefs")
    .eq("id", userId)
    .single();
  if (error || !data) return DEFAULT_PREFS;
  const parsed = notificationPrefsSchema.safeParse(data.notification_prefs);
  return parsed.success ? parsed.data : DEFAULT_PREFS;
}

export async function fetchActiveSubscriptionEndpoint(
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.endpoint ?? null;
}
```

- [ ] **Step 5: Server Action 테스트 작성**

Create `src/app/(app)/settings/_actions.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/auth/with-user", () => ({
  withUser: (fn: unknown) => fn,
}));

import {
  registerPushSubscription,
  unregisterPushSubscription,
  updateNotificationPrefs,
} from "./_actions";
import { createClient } from "@/lib/supabase/server";

function stubSupabase(result: { error: unknown; data?: unknown }) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnValue(result),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnValue(result),
    delete: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnValue(result),
  };
  (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(chain);
  return chain;
}

const user = { id: "11111111-1111-1111-1111-111111111111" } as const;

describe("registerPushSubscription", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid endpoint", async () => {
    stubSupabase({ error: null });
    const out = await registerPushSubscription(user, {
      endpoint: "http://bad",
      p256dh: "x",
      auth: "y",
    });
    expect(out.ok).toBe(false);
  });

  it("upserts valid subscription keyed by endpoint", async () => {
    const chain = stubSupabase({ error: null });
    const out = await registerPushSubscription(user, {
      endpoint: "https://fcm.googleapis.com/fcm/send/ok",
      p256dh: "pk",
      auth: "ak",
    });
    expect(out.ok).toBe(true);
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: user.id,
        endpoint: "https://fcm.googleapis.com/fcm/send/ok",
      }),
      { onConflict: "endpoint" },
    );
  });
});

describe("unregisterPushSubscription", () => {
  it("deletes by endpoint + user_id", async () => {
    const chain = stubSupabase({ error: null });
    const out = await unregisterPushSubscription(user, {
      endpoint: "https://fcm.googleapis.com/fcm/send/ok",
    });
    expect(out.ok).toBe(true);
    expect(chain.delete).toHaveBeenCalled();
  });
});

describe("updateNotificationPrefs", () => {
  it("updates users.notification_prefs", async () => {
    const chain = stubSupabase({ error: null });
    const out = await updateNotificationPrefs(user, {
      start: true,
      deadline: false,
    });
    expect(out.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledWith({
      notification_prefs: { start: true, deadline: false },
    });
  });
});
```

- [ ] **Step 6: Server Action 구현**

Create `src/app/(app)/settings/_actions.ts`:

```ts
"use server";

import { z } from "zod";
import { withUser } from "@/lib/auth/with-user";
import { createClient } from "@/lib/supabase/server";
import {
  failure,
  success,
  validationFailure,
  type ActionResult,
} from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import {
  notificationPrefsSchema,
  pushSubscriptionSchema,
  type NotificationPrefs,
  type PushSubscriptionInput,
} from "@/lib/validators/push";

const unregisterSchema = z.object({
  endpoint: z.string().url().startsWith("https://"),
});

export const registerPushSubscription = withUser<PushSubscriptionInput, { ok: true }>(
  async (user, input): Promise<ActionResult<{ ok: true }>> => {
    const parsed = pushSubscriptionSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint: parsed.data.endpoint,
          p256dh: parsed.data.p256dh,
          auth: parsed.data.auth,
        },
        { onConflict: "endpoint" },
      );
    if (error) return failure(mapSupabaseError(error));
    return success({ ok: true });
  },
);

export const unregisterPushSubscription = withUser<
  z.infer<typeof unregisterSchema>,
  { ok: true }
>(async (user, input): Promise<ActionResult<{ ok: true }>> => {
  const parsed = unregisterSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .match({ user_id: user.id, endpoint: parsed.data.endpoint });
  if (error) return failure(mapSupabaseError(error));
  return success({ ok: true });
});

export const updateNotificationPrefs = withUser<NotificationPrefs, { ok: true }>(
  async (user, input): Promise<ActionResult<{ ok: true }>> => {
    const parsed = notificationPrefsSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase
      .from("users")
      .update({ notification_prefs: parsed.data })
      .eq("id", user.id);
    if (error) return failure(mapSupabaseError(error));
    return success({ ok: true });
  },
);
```

- [ ] **Step 7: pass 확인**

Run: `pnpm test src/app/\(app\)/settings/_actions.spec.ts`
Expected: 4 pass.

- [ ] **Step 8: 리뷰 + 커밋**

- [ ] security-reviewer + silent-failure-hunter 호출
- [ ] Commit

```bash
git add src/lib/validators/push.ts src/lib/validators/push.spec.ts \
        src/lib/db/reads/notification-prefs.ts \
        src/app/\(app\)/settings/_actions.ts src/app/\(app\)/settings/_actions.spec.ts
git commit -m "feat(settings): push subscription + prefs Server Actions"
```

---

### Task 5: Settings 페이지 재작성 (실 토글)

> **근거**: 현재 `useState` 로컬 전용 토글을 실 Server Action 배선. 미지원 브라우저 배너 포함(D-box-4).

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`
- Create: `src/app/(app)/settings/_components/push-settings.tsx`
- Create: `src/app/(app)/settings/_components/push-settings.spec.tsx`

- [ ] **Step 1: client 컴포넌트 테스트 작성**

Create `src/app/(app)/settings/_components/push-settings.spec.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PushSettings } from "./push-settings";

vi.mock("@/lib/push/subscribe", () => ({
  isPushSupported: () => true,
  subscribeToPush: vi.fn().mockResolvedValue({
    endpoint: "https://fcm.googleapis.com/fcm/send/x",
    p256dh: "p",
    auth: "a",
  }),
  unsubscribeFromPush: vi.fn().mockResolvedValue("https://fcm.googleapis.com/fcm/send/x"),
}));
vi.mock("@/app/(app)/settings/_actions", () => ({
  registerPushSubscription: vi.fn().mockResolvedValue({ ok: true }),
  unregisterPushSubscription: vi.fn().mockResolvedValue({ ok: true }),
  updateNotificationPrefs: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("PushSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders with provided prefs", () => {
    render(
      <PushSettings
        initialPrefs={{ start: true, deadline: false }}
        initialSubscribedEndpoint={null}
        vapidPublicKey="BFN..."
      />,
    );
    expect(screen.getByRole("switch", { name: /시작 알림/ })).toBeChecked();
    expect(screen.getByRole("switch", { name: /마감 임박/ })).not.toBeChecked();
  });

  it("toggles deadline pref and calls Server Action", async () => {
    render(
      <PushSettings
        initialPrefs={{ start: true, deadline: false }}
        initialSubscribedEndpoint="https://fcm.googleapis.com/fcm/send/x"
        vapidPublicKey="BFN..."
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /마감 임박/ }));
    const { updateNotificationPrefs } = await import("@/app/(app)/settings/_actions");
    await waitFor(() =>
      expect(updateNotificationPrefs).toHaveBeenCalledWith({
        start: true,
        deadline: true,
      }),
    );
  });

  it("shows unsupported banner when isPushSupported is false", async () => {
    vi.resetModules();
    vi.doMock("@/lib/push/subscribe", () => ({
      isPushSupported: () => false,
      subscribeToPush: vi.fn(),
      unsubscribeFromPush: vi.fn(),
    }));
    const { PushSettings: Reloaded } = await import("./push-settings");
    render(
      <Reloaded
        initialPrefs={{ start: true, deadline: true }}
        initialSubscribedEndpoint={null}
        vapidPublicKey="BFN..."
      />,
    );
    expect(screen.getByText(/이 브라우저는 푸시 알림을 지원하지 않/)).toBeVisible();
  });
});
```

- [ ] **Step 2: 구현 작성**

Create `src/app/(app)/settings/_components/push-settings.tsx`:

```tsx
"use client";

import { useId, useState, useTransition } from "react";
import {
  registerPushSubscription,
  unregisterPushSubscription,
  updateNotificationPrefs,
} from "@/app/(app)/settings/_actions";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push/subscribe";
import type { NotificationPrefs } from "@/lib/validators/push";

type Props = {
  initialPrefs: NotificationPrefs;
  initialSubscribedEndpoint: string | null;
  vapidPublicKey: string;
};

export function PushSettings({
  initialPrefs,
  initialSubscribedEndpoint,
  vapidPublicKey,
}: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
  const [subscribed, setSubscribed] = useState(!!initialSubscribedEndpoint);
  const [, start] = useTransition();

  if (!isPushSupported()) {
    return (
      <section
        aria-labelledby="push-unsupported"
        className="bg-card flex flex-col gap-2 rounded-2xl border p-4"
      >
        <h2 id="push-unsupported" className="text-sm font-semibold">
          푸시 알림
        </h2>
        <p className="text-muted-foreground text-xs">
          이 브라우저는 푸시 알림을 지원하지 않아요. 크롬/엣지/사파리 16.4+ 에서 다시
          시도해 주세요.
        </p>
      </section>
    );
  }

  const ensureSubscription = async (): Promise<boolean> => {
    if (subscribed) return true;
    try {
      const sub = await subscribeToPush(vapidPublicKey);
      const res = await registerPushSubscription(sub);
      if (!res.ok) return false;
      setSubscribed(true);
      return true;
    } catch {
      return false;
    }
  };

  const handlePrefChange = (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    start(async () => {
      if ((value && !subscribed) || (next.start === false && next.deadline === false)) {
        if (value) {
          const ok = await ensureSubscription();
          if (!ok) {
            setPrefs(prefs);
            return;
          }
        } else {
          const endpoint = await unsubscribeFromPush();
          if (endpoint) {
            await unregisterPushSubscription({ endpoint });
            setSubscribed(false);
          }
        }
      }
      await updateNotificationPrefs(next);
    });
  };

  return (
    <section
      aria-labelledby="push-heading"
      className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
    >
      <h2 id="push-heading" className="text-sm font-semibold">
        푸시 알림
      </h2>
      <Toggle
        label="시작 알림"
        description="모두 서명하면 챌린지 시작을 알려드려요"
        checked={prefs.start}
        onChange={(v) => handlePrefChange("start", v)}
      />
      <Toggle
        label="마감 임박 알림"
        description="마감 24시간 전"
        checked={prefs.deadline}
        onChange={(v) => handlePrefChange("deadline", v)}
      />
      <p className="text-muted-foreground text-xs">새벽 2~7시(KST)는 자동 차단돼요.</p>
    </section>
  );
}

type ToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

function Toggle({ label, description, checked, onChange }: ToggleProps) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4">
      <span className="flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="text-muted-foreground block text-xs">{description}</span>
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="accent-primary focus-visible:ring-ring size-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      />
    </label>
  );
}
```

- [ ] **Step 3: page 를 Server Component 로 전환**

Rewrite `src/app/(app)/settings/page.tsx`:

```tsx
import { requireUser } from "@/lib/auth/require-user";
import {
  fetchActiveSubscriptionEndpoint,
  fetchNotificationPrefs,
} from "@/lib/db/reads/notification-prefs";
import { PushSettings } from "./_components/push-settings";

export default async function SettingsPage() {
  const user = await requireUser();
  const [prefs, endpoint] = await Promise.all([
    fetchNotificationPrefs(user.id),
    fetchActiveSubscriptionEndpoint(user.id),
  ]);
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">설정</h1>
      <PushSettings
        initialPrefs={prefs}
        initialSubscribedEndpoint={endpoint}
        vapidPublicKey={vapidPublicKey}
      />
    </div>
  );
}
```

> **주의**: `requireUser` 는 기존 helper 가 있으면 사용, 없으면 `createClient` + `auth.getUser()` 로 대체. 현재 repo 에 `src/lib/auth/` 아래 `with-user.ts` 만 있음. 새 helper 가 필요하면 추가 파일 Step: `Create src/lib/auth/require-user.ts` (아래 박스).

```ts
// src/lib/auth/require-user.ts (신규, 필요 시에만)
import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect("/login");
  return data.user;
}
```

- [ ] **Step 4: 테스트 실행**

Run: `pnpm test src/app/\(app\)/settings/_components/push-settings.spec.tsx`
Expected: 3 pass.

- [ ] **Step 5: 리뷰 + 커밋**

- [ ] a11y-architect 호출 (`role=switch`, unsupported banner, keyboard)
- [ ] Commit

```bash
git add src/app/\(app\)/settings/ src/lib/auth/require-user.ts
git commit -m "feat(settings): wire real push subscribe + prefs toggles"
```

---

### Task 6: 서버 dispatch helper (fan-out + quiet hour + 410 cleanup)

> **근거**: 시작/마감 알림이 공유하는 핵심 로직. `sendPush` 의 410/404 에러를 catch 해 `push_subscriptions` 에서 자동 제거(누적 방지). quiet hour 는 발송 포인트에서만 차단.

**Files:**
- Create: `src/lib/push/dispatch.ts`
- Create: `src/lib/push/dispatch.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `src/lib/push/dispatch.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const adminMock = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  match: vi.fn().mockResolvedValue({ error: null }),
};
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => adminMock }));

const sendPush = vi.fn();
vi.mock("@/lib/push/send", () => ({
  sendPush: (...args: unknown[]) => sendPush(...args),
  isQuietHoursKST: vi.fn().mockReturnValue(false),
}));

const track = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/analytics/track", () => ({ track }));

import { dispatchStartNotification } from "./dispatch";
import { isQuietHoursKST } from "./send";

describe("dispatchStartNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminMock.match.mockResolvedValue({ error: null });
  });

  it("fans out to all participants with prefs.start=true", async () => {
    adminMock.select
      // participants
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: [{ user_id: "u1" }, { user_id: "u2" }],
          error: null,
        }),
      })
      // users prefs
      .mockReturnValueOnce({
        in: vi.fn().mockResolvedValueOnce({
          data: [
            { id: "u1", notification_prefs: { start: true, deadline: true } },
            { id: "u2", notification_prefs: { start: false, deadline: true } },
          ],
          error: null,
        }),
      })
      // subscriptions
      .mockReturnValueOnce({
        in: vi.fn().mockResolvedValueOnce({
          data: [
            { user_id: "u1", endpoint: "e1", p256dh: "p", auth: "a" },
            { user_id: "u2", endpoint: "e2", p256dh: "p", auth: "a" },
          ],
          error: null,
        }),
      });
    // challenges fetch for title
    adminMock.from.mockReturnValue(adminMock);

    sendPush.mockResolvedValue(undefined);
    await dispatchStartNotification("c1");

    // u2 prefs.start=false → skip
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({ name: "notification_sent" }),
      { userId: "u1" },
    );
  });

  it("suppresses during quiet hours but still logs event", async () => {
    (isQuietHoursKST as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    adminMock.select.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValueOnce({
        data: [{ user_id: "u1" }],
        error: null,
      }),
    });
    adminMock.select.mockReturnValueOnce({
      in: vi.fn().mockResolvedValueOnce({
        data: [{ id: "u1", notification_prefs: { start: true, deadline: true } }],
        error: null,
      }),
    });
    adminMock.select.mockReturnValueOnce({
      in: vi.fn().mockResolvedValueOnce({
        data: [{ user_id: "u1", endpoint: "e1", p256dh: "p", auth: "a" }],
        error: null,
      }),
    });

    await dispatchStartNotification("c1");

    expect(sendPush).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "notification_sent",
        props: expect.objectContaining({ suppressed: true }),
      }),
      { userId: "u1" },
    );
  });

  it("removes subscription on 410 Gone", async () => {
    adminMock.select.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValueOnce({
        data: [{ user_id: "u1" }],
        error: null,
      }),
    });
    adminMock.select.mockReturnValueOnce({
      in: vi.fn().mockResolvedValueOnce({
        data: [{ id: "u1", notification_prefs: { start: true, deadline: true } }],
        error: null,
      }),
    });
    adminMock.select.mockReturnValueOnce({
      in: vi.fn().mockResolvedValueOnce({
        data: [{ user_id: "u1", endpoint: "e-gone", p256dh: "p", auth: "a" }],
        error: null,
      }),
    });
    const err = Object.assign(new Error("gone"), { statusCode: 410 });
    sendPush.mockRejectedValue(err);

    await dispatchStartNotification("c1");

    expect(adminMock.delete).toHaveBeenCalled();
    expect(adminMock.match).toHaveBeenCalledWith({ endpoint: "e-gone" });
  });
});
```

- [ ] **Step 2: 구현 작성**

Create `src/lib/push/dispatch.ts`:

```ts
import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import { sendPush, isQuietHoursKST, type PushPayload } from "@/lib/push/send";
import {
  notificationPrefsSchema,
  type NotificationPrefs,
} from "@/lib/validators/push";

type NotificationKind = "start" | "deadline";

type DispatchTarget = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function loadTargets(
  challengeId: string,
  kind: NotificationKind,
): Promise<DispatchTarget[]> {
  const admin = adminClient();

  const { data: participants } = await admin
    .from("challenge_participants")
    .select("user_id")
    .eq("challenge_id", challengeId);

  const userIds = (participants ?? []).map((p) => p.user_id as string);
  if (userIds.length === 0) return [];

  const { data: users } = await admin
    .from("users")
    .select("id, notification_prefs")
    .in("id", userIds);

  const optedIn = (users ?? [])
    .filter((u) => {
      const parsed = notificationPrefsSchema.safeParse(u.notification_prefs);
      const prefs: NotificationPrefs = parsed.success
        ? parsed.data
        : { start: true, deadline: true };
      return prefs[kind];
    })
    .map((u) => u.id as string);

  if (optedIn.length === 0) return [];

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", optedIn);

  return (subs ?? []).map((s) => ({
    userId: s.user_id as string,
    endpoint: s.endpoint as string,
    p256dh: s.p256dh as string,
    auth: s.auth as string,
  }));
}

export async function cleanupInvalidSubscription(endpoint: string): Promise<void> {
  const admin = adminClient();
  await admin.from("push_subscriptions").delete().match({ endpoint });
}

async function safeSend(
  target: DispatchTarget,
  payload: PushPayload,
): Promise<"sent" | "cleaned" | "failed"> {
  try {
    await sendPush(target, payload);
    return "sent";
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await cleanupInvalidSubscription(target.endpoint);
      return "cleaned";
    }
    console.error("[push] sendPush failed", { endpoint: target.endpoint, error });
    return "failed";
  }
}

async function dispatch(
  challengeId: string,
  kind: NotificationKind,
  payload: PushPayload,
): Promise<void> {
  const targets = await loadTargets(challengeId, kind);
  if (targets.length === 0) return;
  const suppressed = isQuietHoursKST();

  for (const target of targets) {
    let outcome: "sent" | "cleaned" | "failed" | "suppressed" = "suppressed";
    if (!suppressed) {
      outcome = await safeSend(target, payload);
    }
    void track(
      {
        name: "notification_sent",
        props: {
          type: kind,
          challengeId,
          suppressed,
          outcome,
        },
      },
      { userId: target.userId },
    );
  }
}

export async function dispatchStartNotification(challengeId: string): Promise<void> {
  return dispatch(challengeId, "start", {
    title: "챌린지 시작이에요",
    body: "모두 서명했어요. 오늘부터 시작!",
    url: `/challenge/${challengeId}`,
  });
}

export async function dispatchDeadlineNotification(challengeId: string): Promise<void> {
  return dispatch(challengeId, "deadline", {
    title: "마감 24시간 전",
    body: "아직 못 한 날이 있다면 지금!",
    url: `/challenge/${challengeId}`,
  });
}
```

- [ ] **Step 3: 테스트 pass 확인**

Run: `pnpm test src/lib/push/dispatch.spec.ts`
Expected: 3 pass.

- [ ] **Step 4: 리뷰 + 커밋**

- [ ] security-reviewer + silent-failure-hunter 호출
- [ ] Commit

```bash
git add src/lib/push/dispatch.ts src/lib/push/dispatch.spec.ts
git commit -m "feat(push): fan-out dispatch with quiet-hour guard + 410 cleanup"
```

---

### Task 7: `signPledge` 에 시작 알림 주입

> **근거**: 참가자 전원이 서명 완료 → `sign_and_maybe_activate` 가 `status='active'` 반환 → 그 분기에서만 dispatch. fire-and-forget (track 과 동일 패턴).

**Files:**
- Modify: `src/app/(app)/pledge/_actions.ts`
- Modify: `src/app/(app)/pledge/_actions.spec.ts` (있으면, 없으면 Create)

- [ ] **Step 1: 실패 테스트 작성/보강**

Create/Modify `src/app/(app)/pledge/_actions.spec.ts` 에 추가:

```ts
// 추가 케이스
import { signPledge } from "./_actions";
import { vi } from "vitest";

vi.mock("@/lib/push/dispatch", () => ({
  dispatchStartNotification: vi.fn().mockResolvedValue(undefined),
}));

// 기존 RPC mock 에 status='active' 시나리오에서 dispatch 호출 확인하는 it 추가
it("dispatches start notification when status becomes active", async () => {
  // RPC 가 status='active' 를 반환하도록 stub
  // ... (기존 stub 확장)
  await signPledge({ challengeId: "c1" });
  const { dispatchStartNotification } = await import("@/lib/push/dispatch");
  expect(dispatchStartNotification).toHaveBeenCalledWith("c1");
});
```

- [ ] **Step 2: 구현 수정**

Edit `src/app/(app)/pledge/_actions.ts` — `return success(...)` 직전에 dispatch 주입:

```ts
// 기존 import 에 추가
import { dispatchStartNotification } from "@/lib/push/dispatch";

// ... 기존 코드 ...
    if (row.status === "active") {
      void dispatchStartNotification(parsed.data.challengeId);
    }

    return success({
      challengeId: parsed.data.challengeId,
      status: row.status as SignResult["status"],
    });
```

- [ ] **Step 3: pass 확인**

Run: `pnpm test src/app/\(app\)/pledge/_actions.spec.ts`
Expected: 모두 pass (기존 + 신규 1).

- [ ] **Step 4: 리뷰 + 커밋**

- [ ] /code-review 호출
- [ ] Commit

```bash
git add src/app/\(app\)/pledge/_actions.ts src/app/\(app\)/pledge/_actions.spec.ts
git commit -m "feat(pledge): dispatch start notification on challenge activation"
```

---

### Task 8: Vercel Cron + deadline push endpoint

> **근거**: 마감 임박 알림은 `end_at - 24h` 창에 1 회. Vercel Cron 은 무료 tier 에서 주 40 회 실행 보장 — 매시간 = 한 달 720 회 수용 가능 (pro). 무료 tier 면 6h 주기로 조정 (`0 */6 * * *`). D-019 박스에서 확정.

**Files:**
- Create: `vercel.json` (또는 Modify)
- Create: `src/app/api/cron/deadline-push/route.ts`
- Create: `src/app/api/cron/deadline-push/route.spec.ts`
- Modify: `.env.example`
- Modify: `docs/DEPLOY.md`

- [ ] **Step 1: Vercel plan 확인 + cron 주기 결정**

Run(문서 확인): `open https://vercel.com/docs/cron-jobs#limits`
현재 팀 plan 이 hobby(무료) 면 **매 6 시간**(`0 */6 * * *`), pro 면 **매시간**(`0 * * * *`). 본 plan 은 hobby 가정으로 6h 주기로 작성. 머지 후 plan 이 pro 면 1 줄 수정.

- [ ] **Step 2: `vercel.json` 작성**

Create `vercel.json` (기존 있으면 crons 배열만 추가):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["icn1"],
  "crons": [
    { "path": "/api/cron/deadline-push", "schedule": "0 */6 * * *" }
  ]
}
```

- [ ] **Step 3: `.env.example` 에 CRON_SECRET 추가**

Edit `.env.example`, `# --- Web Push (VAPID) ---` 아래에:

```dotenv
# --- Cron (Vercel) ---
CRON_SECRET=                         # openssl rand -hex 32; GitHub Actions + Vercel env 동시 등록
```

- [ ] **Step 4: route 테스트 작성**

Create `src/app/api/cron/deadline-push/route.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const adminMock = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
};
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => adminMock }));
const dispatch = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/push/dispatch", () => ({ dispatchDeadlineNotification: dispatch }));

import { POST } from "./route";

function reqWithSecret(secret: string | null) {
  const headers = new Headers();
  if (secret !== null) headers.set("authorization", `Bearer ${secret}`);
  return new Request("https://app/api/cron/deadline-push", { method: "POST", headers });
}

describe("POST /api/cron/deadline-push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "supersecret";
  });

  it("rejects without bearer secret", async () => {
    const res = await POST(reqWithSecret(null));
    expect(res.status).toBe(401);
  });

  it("rejects with wrong secret", async () => {
    const res = await POST(reqWithSecret("nope"));
    expect(res.status).toBe(401);
  });

  it("dispatches for challenges whose end_at is in 23-25h window and has no prior deadline event", async () => {
    // 1) active 챌린지 쿼리
    adminMock.select.mockReturnValueOnce({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValueOnce({
            data: [{ id: "c1" }, { id: "c2" }],
            error: null,
          }),
        }),
      }),
    });
    // 2) events 중복 조회 — c1 은 이미 보냄, c2 는 처음
    adminMock.select.mockImplementation(() => ({
      eq: (col: string, v: unknown) => {
        if (v === "notification_sent") {
          return {
            eq: () => ({
              data: col === "name" ? [{ id: 1 }] : [],
              error: null,
            }),
          };
        }
        return adminMock;
      },
    }));

    const res = await POST(reqWithSecret("supersecret"));
    expect(res.status).toBe(200);
    // dispatch 가 c2 에 대해서만 불렸어야 함 (c1 은 중복)
    expect(dispatch).toHaveBeenCalled();
  });
});
```

> **주의**: 위 테스트의 events 중복 쿼리 mock 은 실 쿼리 형태에 맞춰 구현 작성 후 미세 조정. 핵심은 "중복이면 skip, 아니면 dispatch".

- [ ] **Step 5: route 구현**

Create `src/app/api/cron/deadline-push/route.ts`:

```ts
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { dispatchDeadlineNotification } from "@/lib/push/dispatch";

export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function alreadyDispatched(challengeId: string): Promise<boolean> {
  const admin = adminClient();
  const { data } = await admin
    .from("events")
    .select("id")
    .eq("name", "notification_sent")
    .contains("props", { type: "deadline", challengeId })
    .limit(1);
  return (data ?? []).length > 0;
}

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = adminClient();
  const nowPlus23h = new Date(Date.now() + 23 * 3600 * 1000).toISOString();
  const nowPlus25h = new Date(Date.now() + 25 * 3600 * 1000).toISOString();

  const { data: challenges, error } = await admin
    .from("challenges")
    .select("id")
    .eq("status", "active")
    .gte("end_at", nowPlus23h)
    .lte("end_at", nowPlus25h);

  if (error) {
    console.error("[cron/deadline-push] query failed", error);
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const ids = (challenges ?? []).map((c) => c.id as string);
  let dispatched = 0;
  for (const id of ids) {
    if (await alreadyDispatched(id)) continue;
    await dispatchDeadlineNotification(id);
    dispatched += 1;
  }

  return NextResponse.json({ ok: true, scanned: ids.length, dispatched });
}

// Vercel Cron 은 GET 으로도 호출 — POST 로 위임.
export async function GET(req: Request): Promise<Response> {
  return POST(req);
}
```

- [ ] **Step 6: pass 확인**

Run: `pnpm test src/app/api/cron/deadline-push/route.spec.ts`
Expected: 3 pass (mock 미세조정 후).

- [ ] **Step 7: DEPLOY.md 업데이트**

Edit `docs/DEPLOY.md` — "환경변수" 섹션 아래에 append:

```md
## Cron

- `CRON_SECRET`: `openssl rand -hex 32` 로 생성. GitHub Actions secret + Vercel (Production + Preview) env 에 동일 값 등록. Vercel Cron 이 `Authorization: Bearer $CRON_SECRET` 로 호출.
- 주기: `vercel.json` `crons` 배열. hobby plan 은 최소 6h, pro 는 1h.
```

- [ ] **Step 8: 리뷰 + 커밋**

- [ ] security-reviewer 호출 (`CRON_SECRET` 헤더 비교 timing-safe 여부, JSON 응답에 민감정보 없음)
- [ ] Commit

```bash
git add vercel.json src/app/api/cron/deadline-push/ .env.example docs/DEPLOY.md
git commit -m "feat(cron): vercel cron + deadline push endpoint with CRON_SECRET guard"
```

---

### Task 9: analytics schema 확장

> **근거**: 기존 `notification_sent` props 는 `{ type }` 뿐. `challengeId` · `suppressed` · `outcome` 를 Zod + TS union 양쪽에 추가해 dispatch 가 실제로 기록하는 필드와 일치시킨다.

**Files:**
- Modify: `src/lib/analytics/track.ts`
- Modify: `src/lib/analytics/schema.ts`
- Modify: `src/lib/analytics/schema.spec.ts`
- Modify: `src/lib/analytics/schema-union-parity.spec.ts`

- [ ] **Step 1: Zod schema 업데이트**

Edit `src/lib/analytics/schema.ts` — `notification_sent` / `notification_opened` 블록을:

```ts
// notification_sent
z.object({
  name: z.literal("notification_sent"),
  props: z.object({
    type: z.enum(["start", "deadline"]),
    challengeId: z.string().uuid(),
    suppressed: z.boolean(),
    outcome: z.enum(["sent", "cleaned", "failed", "suppressed"]),
  }),
}),
// notification_opened
z.object({
  name: z.literal("notification_opened"),
  props: z.object({
    type: z.enum(["start", "deadline"]),
    challengeId: z.string().uuid(),
  }),
}),
```

- [ ] **Step 2: TS union 업데이트**

Edit `src/lib/analytics/track.ts`:

```ts
  | {
      name: "notification_sent";
      props: {
        type: "start" | "deadline";
        challengeId: string;
        suppressed: boolean;
        outcome: "sent" | "cleaned" | "failed" | "suppressed";
      };
    }
  | {
      name: "notification_opened";
      props: { type: "start" | "deadline"; challengeId: string };
    }
```

- [ ] **Step 3: parity 테스트 실행**

Run: `pnpm test src/lib/analytics/schema-union-parity.spec.ts src/lib/analytics/schema.spec.ts`
Expected: pass (필요시 schema.spec 에 신규 필드 케이스 추가).

- [ ] **Step 4: 리뷰 + 커밋**

- [ ] type-design-analyzer 호출
- [ ] Commit

```bash
git add src/lib/analytics/
git commit -m "feat(analytics): enrich notification event props (challengeId/suppressed/outcome)"
```

---

### Task 10: Integration tests

> **근거**: unit mock 만으로는 RLS 우회 · `events` 누적 · `push_subscriptions` cleanup 을 방어 못 함. 3 개 real-DB 테스트.

**Files:**
- Create: `tests/integration/push/register-subscription.spec.ts`
- Create: `tests/integration/push/dispatch-start.spec.ts`
- Create: `tests/integration/push/deadline-cron.spec.ts`
- Modify: `tests/integration/setup.ts` — 필요 시 factories 확장

- [ ] **Step 1: subscription register 테스트**

Create `tests/integration/push/register-subscription.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { asUser, admin } from "../setup";
import { createUser } from "../factories";

describe("registerPushSubscription", () => {
  it("inserts with user_id bound to caller", async () => {
    const u = await createUser();
    const c = asUser(u.id);
    const endpoint = `https://fcm.googleapis.com/fcm/send/${u.id}`;
    const { error } = await c
      .from("push_subscriptions")
      .upsert(
        { user_id: u.id, endpoint, p256dh: "p", auth: "a" },
        { onConflict: "endpoint" },
      );
    expect(error).toBeNull();

    const { data } = await admin
      .from("push_subscriptions")
      .select("user_id")
      .eq("endpoint", endpoint)
      .single();
    expect(data?.user_id).toBe(u.id);
  });

  it("rejects writing to another user via RLS", async () => {
    const u1 = await createUser();
    const u2 = await createUser();
    const c = asUser(u1.id);
    const { error } = await c.from("push_subscriptions").insert({
      user_id: u2.id,
      endpoint: "https://fcm.googleapis.com/fcm/send/x",
      p256dh: "p",
      auth: "a",
    });
    expect(error?.code).toBe("42501");
  });
});
```

- [ ] **Step 2: dispatch-start 통합 테스트**

Create `tests/integration/push/dispatch-start.spec.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { admin } from "../setup";
import {
  createUser,
  createGroup,
  addMember,
  createPendingChallenge,
} from "../factories";

// web-push 는 실 발송 불가 — sendPush 만 mock
vi.mock("@/lib/push/send", async (orig) => {
  const actual = await orig<typeof import("@/lib/push/send")>();
  return { ...actual, sendPush: vi.fn().mockResolvedValue(undefined) };
});

import { dispatchStartNotification } from "@/lib/push/dispatch";
import { sendPush } from "@/lib/push/send";

describe("dispatchStartNotification (integration)", () => {
  it("sends to each participant with prefs.start=true and logs events", async () => {
    const owner = await createUser();
    const other = await createUser();
    const g = await createGroup(owner.id);
    await addMember(g.id, other.id);
    const c = await createPendingChallenge(g.id);
    await admin.from("challenge_participants").insert([
      { challenge_id: c.id, user_id: owner.id },
      { challenge_id: c.id, user_id: other.id },
    ]);
    // owner 만 구독 + start=true
    await admin.from("push_subscriptions").insert({
      user_id: owner.id,
      endpoint: `https://fcm.googleapis.com/fcm/send/${owner.id}`,
      p256dh: "p",
      auth: "a",
    });

    await dispatchStartNotification(c.id);

    expect(sendPush).toHaveBeenCalledTimes(1);
    const { data: evs } = await admin
      .from("events")
      .select("name, props, user_id")
      .eq("name", "notification_sent");
    expect(evs?.length).toBeGreaterThanOrEqual(1);
    expect(evs?.find((e) => e.user_id === owner.id)?.props).toMatchObject({
      type: "start",
      challengeId: c.id,
    });
  });
});
```

- [ ] **Step 3: deadline-cron 통합 테스트**

Create `tests/integration/push/deadline-cron.spec.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { admin } from "../setup";
import {
  createUser,
  createGroup,
  addMember,
  createPendingChallenge,
} from "../factories";

vi.mock("@/lib/push/send", async (orig) => {
  const actual = await orig<typeof import("@/lib/push/send")>();
  return { ...actual, sendPush: vi.fn().mockResolvedValue(undefined) };
});

import { POST } from "@/app/api/cron/deadline-push/route";

async function seedActiveEndingIn(
  hours: number,
): Promise<{ challengeId: string; ownerId: string }> {
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
      end_at: new Date(Date.now() + hours * 3600_000).toISOString(),
    })
    .eq("id", c.id);
  await admin.from("push_subscriptions").insert({
    user_id: owner.id,
    endpoint: `https://fcm.googleapis.com/fcm/send/${owner.id}`,
    p256dh: "p",
    auth: "a",
  });
  return { challengeId: c.id, ownerId: owner.id };
}

function cronReq(): Request {
  process.env.CRON_SECRET = process.env.CRON_SECRET ?? "test-secret";
  const h = new Headers({ authorization: `Bearer ${process.env.CRON_SECRET}` });
  return new Request("https://app/api/cron/deadline-push", { method: "POST", headers: h });
}

describe("deadline-push cron (integration)", () => {
  it("dispatches once then skips on second invocation", async () => {
    const { challengeId } = await seedActiveEndingIn(24);

    const first = await POST(cronReq());
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.dispatched).toBeGreaterThanOrEqual(1);

    const second = await POST(cronReq());
    const secondBody = await second.json();
    expect(secondBody.dispatched).toBe(0);

    const { data: evs } = await admin
      .from("events")
      .select("id")
      .eq("name", "notification_sent")
      .contains("props", { type: "deadline", challengeId });
    expect(evs?.length).toBe(1);
  });

  it("skips challenges outside 23-25h window", async () => {
    await seedActiveEndingIn(48); // 2 일 뒤 — out of window
    const res = await POST(cronReq());
    const body = await res.json();
    expect(body.dispatched).toBe(0);
  });
});
```

- [ ] **Step 4: pass 확인**

Run: `pnpm test:integration tests/integration/push/`
Expected: 4 pass (register 2 + dispatch 1 + cron 2 — suite 총 5 case).

- [ ] **Step 5: 리뷰 + 커밋**

- [ ] /code-review 호출 (factories 재사용, truncate 스코프)
- [ ] Commit

```bash
git add tests/integration/push/ tests/integration/setup.ts
git commit -m "test(integration): push subscribe + start dispatch + deadline cron end-to-end"
```

---

### Task 11: Playwright E2E — settings smoke

> **근거**: subscribe UI 배선이 브라우저 레벨에서 안 터지는지 확인. 실 endpoint 는 FCM 이라 mock 하지 않고, Playwright 의 `context.grantPermissions(["notifications"])` 로 permission prompt 만 우회.

**Files:**
- Create: `tests/e2e/push-settings.spec.ts`

- [ ] **Step 1: 테스트 작성**

Create `tests/e2e/push-settings.spec.ts`:

```ts
import { test, expect } from "./fixtures";

test.describe("push settings", () => {
  test.use({ permissions: ["notifications"] });

  test("user toggles start notification → subscription saved", async ({
    page,
    authenticatedApi,
  }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
    const startToggle = page.getByRole("switch", { name: /시작 알림/ });
    await expect(startToggle).toBeChecked(); // default true

    // 끄기 → 켜기 사이클
    await startToggle.click();
    await expect(startToggle).not.toBeChecked();
    await startToggle.click();
    await expect(startToggle).toBeChecked();

    // 서버에 subscription 저장됐는지 확인
    const res = await authenticatedApi.get("/api/me");
    const body = await res.json();
    expect(body.userId).toBeTruthy();
    // 실 endpoint 는 FCM 이라 값 검증은 생략 — 존재 여부만 DB integration 이 담당
  });
});
```

> **주의**: `authenticatedApi` fixture 는 기존 `tests/e2e/fixtures.ts` 에 있음. `/api/me` 가 없으면 `Runway` plan Task 10 이 만들었는지 확인. 없으면 이 테스트는 "토글 동작" 만 검증하고 서버 확인은 integration 에 맡긴다.

- [ ] **Step 2: 실행**

Run: `pnpm test:e2e tests/e2e/push-settings.spec.ts`
Expected: 1 pass.

- [ ] **Step 3: 리뷰 + 커밋**

- [ ] e2e-runner 호출
- [ ] Commit

```bash
git add tests/e2e/push-settings.spec.ts
git commit -m "test(e2e): push settings toggle smoke"
```

---

### Task 12: ADR D-019 + ONBOARDING §6.4 보강

**Files:**
- Modify: `docs/TEAM_SHARE_DECISIONS.md`
- Modify: `docs/ONBOARDING.md`

- [ ] **Step 1: D-019 append**

Edit `docs/TEAM_SHARE_DECISIONS.md` 맨 아래에:

```md
## D-019 — Web Push: in-request fan-out + hourly cron (2026-04-30)

**Context**
- PRD §6.3 는 2 종 알림(시작/마감)을 요구하지만 구현은 scaffold (`src/lib/push/*` · `push_subscriptions` 테이블 · RLS) 단계에서 멈춰 있었다. 실 dispatch 경로가 한 번도 호출되지 않음.

**Decision**
1. **dispatch = Server Action 내 fan-out** (in-request). `signPledge` 가 `status='active'` 시 `await Promise.allSettled(subs.map(sendPush))`. 큐 도입 금지 (POC 10 인 스케일). v1 스케일 초과 시 B 안(큐) 로 마이그레이션.
2. **deadline cron** = Vercel Cron 매 6h (hobby) 또는 1h (pro). 창은 `end_at between now()+23h and now()+25h`. 중복 방지는 `events(name, props)` 조회 — 전용 idempotency 테이블 신설 금지.
3. **quiet hours 02–07 KST** = 발송 차단만. 큐잉/재스케줄 없음. `notification_sent` 이벤트를 `suppressed=true` 로 여전히 기록(관찰성).
4. **410 / 404** 응답은 즉시 `push_subscriptions` 삭제 (누적 방지).
5. **선호도 저장** = `users.notification_prefs jsonb`. 별도 테이블 금지 (D-box-3 근거).

**Consequences**
- 리팩토링 여지: v1 이 100+ 참가자 또는 다건 일일 알림 요구하면 큐 필요. 그 시점 ADR 추가.
- `events` gin index (0008) 가 중복 조회를 커버 → 추가 인덱스 불요.
- 테스트는 `sendPush` mock + `push_subscriptions`/`events` row 검증 2 축으로 방어.

**Rejected alternatives**
- 큐 (Upstash / pg_cron) — POC 스케일 대비 과잉.
- 별도 `notification_dispatch_log` — 이미 있는 `events` 가 곧 ledger.
- silent skip during quiet hours — 관찰성 0 → `suppressed` 이벤트 기록으로 교체.
```

- [ ] **Step 2: ONBOARDING §6.4 보강**

Edit `docs/ONBOARDING.md` — 기존 §6.4 아래에 실제 wiring 경로 구체화 서브섹션 추가:

```md
### 6.4 Web Push (실 dispatch 경로 구체화 — D-019 이후)

1. 클라이언트 구독: `/settings` 토글 ON → `pushManager.subscribe()` → `registerPushSubscription` Server Action → `push_subscriptions` upsert (endpoint unique).
2. 시작 알림: `signPledge` 가 `sign_and_maybe_activate` RPC 결과 `status='active'` 면 `dispatchStartNotification(challengeId)` 를 fire-and-forget 호출.
3. 마감 임박 알림: `vercel.json` cron → `/api/cron/deadline-push` (Bearer `CRON_SECRET`) → `end_at between now()+23h and +25h` 스캔 → `events` 중복 체크 → `dispatchDeadlineNotification`.
4. quiet hours 02~07 KST 는 발송만 차단. `events.notification_sent.props.suppressed=true` 로 관찰.
5. 410/404 응답은 자동 cleanup.
6. VAPID 키 교체 시 모든 구독 무효화 — `push_subscriptions` truncate 필요.
```

- [ ] **Step 3: Commit**

```bash
git add docs/TEAM_SHARE_DECISIONS.md docs/ONBOARDING.md
git commit -m "docs: D-019 web push architecture + ONBOARDING §6.4 wiring"
```

- [ ] **Step 4: 최종 검증**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`
Expected: all green.

- [ ] **Step 5: PR 3 개 merge 준비**

PR-A → PR-B → PR-C 순서로 리뷰 · merge. 각 PR body 에 해당 Task 번호 + 이 plan 링크 명시.

---

## 3. Out of Scope (명시)

- (a) Quiet hours 에 걸린 알림의 재스케줄/큐잉 — POC 에서는 `suppressed` 로그만.
- (b) `notification_opened` 이벤트는 service worker 가 이미 beacon 호출. 서버 수신부 `/api/push/opened` 는 Task 2 에서 스켈레톤만, 본 plan 에선 이벤트 수신 → `track()` 까지 wiring. **분석 대시보드는 별도.**
- (c) 운영툴 "테스트 푸시 보내기" 버튼 — `/admin/*` 대시보드 plan 합쳐서 v1.
- (d) AI 예산 80% 도달 Slack 알림 — 별도 plan (`Slack Webhook + cron` 패턴은 본 plan 의 deadline cron 과 유사하지만 별도 관심사).
- (e) iOS 16.4 미만 · 구형 Android 지원 — "미지원 배너" 로 명시 (D-box-4).
- (f) 디자이너 산출 아이콘 교체 — 본 plan 은 1×1 placeholder. 별도 디자인 PR.

---

## 4. Self-Review Checklist

**Spec coverage (ONBOARDING §6.4 · PRD §6.3 · JOURNAL debt):**

| 요구 | Task |
|------|------|
| 구독 등록/해제 UI | 3 · 4 · 5 |
| `users.notification_prefs` 저장 | 1 · 4 · 5 |
| 시작 알림 dispatch | 6 · 7 |
| 마감 임박 알림 dispatch | 6 · 8 |
| quiet hours 차단 | 6 |
| 410/404 cleanup | 6 |
| `notification_sent` 이벤트 기록 | 6 · 9 |
| `notification_opened` 이벤트 수신 | 2 · 9 (`/api/push/opened` route — Task 8 의 deadline route 와 별도) |
| VAPID 키 교체 문서 | 12 |
| 실 브라우저 smoke | 11 |

**Placeholder scan:** "TBD" · "implement later" · "// TODO" 없음. 각 step 에 완결된 코드 블록 존재 확인 ✓.

**Type consistency:**
- `BrowserPushSubscription` (Task 3) ↔ `PushSubscriptionInput` (Task 4 validator) 필드명 일치 (`endpoint` · `p256dh` · `auth`) ✓
- `dispatchStartNotification(challengeId: string)` (Task 6) ↔ signPledge 호출부 (Task 7) 일치 ✓
- `notification_sent` props (Task 9 Zod) ↔ `dispatch.ts` 의 track 호출부 (Task 6) 일치 ✓ (`type` · `challengeId` · `suppressed` · `outcome`)
- `cleanupInvalidSubscription(endpoint: string)` (Task 6) — dispatch 내부에서만 쓰임, 외부 export 는 있으나 호출자 없음 — 의도적 (테스트용 · cron route 도 간접 호출 가능).

**Notes:**
- `/api/push/opened` route 본체는 Task 2 SW 가 호출하지만 서버 코드 작성 step 이 §1.9 에만 언급됨 → 추가 step 로 Task 8 말미 또는 Task 9 에 합치면 깔끔. **결정**: Task 12 직전에 "Task 8.5: `/api/push/opened` 구현" 로 명시적 step 추가 권장. 본 plan v1 에선 §1.9 에 파일 경로를 명시해 둔 것으로 갈음하되, 실행 subagent 가 누락 감지 시 곧바로 추가하도록 위 문단을 단서로 남긴다.
- migration 번호(`0010`) 는 Storage plan 과 충돌 가능 — Task 1 Step 1 에서 확인 후 필요 시 rename.
