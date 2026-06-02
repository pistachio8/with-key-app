---
plan: 2026-05-22-kudos-received-notification
title: 내 인증글에 kudos INSERT 시 Web Push 알림 발송
author: pistachio8
date: 2026-05-22
status: draft
---

## 목표

다른 사용자가 내가 만든 `action_logs` (인증글) 에 kudos INSERT 할 때, 인증글 작성자(=나)에게 Web Push 알림을 발송한다. **kudos DELETE 시는 알림 없음** (사용자 명시).

같은 worktree 의 자매 plan [`2026-05-22-header-unread-dot-source.md`](2026-05-22-header-unread-dot-source.md) 와 결합되면, kudos push → SW IDB 적재 → 헤더 dot 자동 ON 흐름이 한 PR 안에서 완성된다.

연관 PRD AC 없음(신규 채널). PRD §9.1 이벤트 표 갱신 필요 — `notification_sent.type` enum 에 `"kudos_received"` 추가 + props 확장 (PO 승인 대상).

## 배경

| | 현재 상태 |
|---|---|
| [`toggleKudos`](../../../src/app/(app)/challenge/[id]/_actions.ts) | INSERT/DELETE 토글. INSERT 시 `track("kudos_given")` 만 발화 — **push 발송 0** |
| [`dispatchActionStartNotification`](../../../src/lib/push/dispatch.ts) | 챌린지 단위 multi-recipient(참여자 전원). category=`"friend_action"` |
| [`notification_prefs`](../../../src/lib/validators/push.ts) | `{start, deadline}` jsonb. kudos 키 없음 |
| [`notification_sent` analytics](../../../src/lib/analytics/schema.ts) | `type: "start" | "deadline"`. kudos 미포함 |
| RLS | `kudos_insert_self_not_own` 으로 본인→본인 kudos INSERT 차단 |
| SW [`service-worker.js`](../../../public/service-worker.js) | push 수신 시 type/category 그대로 IDB 적재 — enum 검증 없음 |

## 결정 (grilling 결과 — 2026-05-22)

| 분기점 | 선택 | 이유 |
|---|---|---|
| Scope | 같은 worktree, 새 plan 파일 | 헤더 dot plan 과 도메인 분리. 1개 PR 로 묶으면 dot 켜지는 흐름 한 번에 검증 |
| 옵트인 | `notification_prefs.kudos` 신설, **default false** | [ADR-0016](../../adr/0016-notification-prefs-kudos.md). ADR-0013 (start/deadline default OFF) 정책 일관성 |
| type / category | `type="kudos_received"` 신설, `category="friend_action"` 재사용 | `/notifications` 탭 신설 회피. 의미상 친구 액션 한 종류 |
| Idempotency | **신규 `kudos_push_log` 테이블 + UNIQUE PK** (ADR-0017) | events 5분 윈도우는 fire-and-forget INSERT race 로 첫 수초 spam 방지 불가. DB-level UNIQUE 가 atomic dedup — 윈도우 폐지, 영구 1회 (recipient, action_log, actor 당) |
| Closed 챌린지 정책 | **dispatch helper 가 `challenges.status='active'` 체크 후 closed/pending 면 skip** | RLS 가 challenge.status 미체크라 closed 챌린지 옛 글에 kudos INSERT 자체는 가능 — push 만 차단. PO 결정 (2026-05-22) |
| Vercel `void` 한계 | **`after()` 채택 + start 알림도 일괄 마이그레이션** | Next.js 15+ `import { after } from "next/server"` 로 push 누락 영구 해소. follow-up 흡수 (2026-05-22) |
| `kudos_push_log` SELECT 정책 | **service_role only 유지 (정책 미부여)** | "본인 받은 응원 이력" UX 미정 — UI 가 생기면 그때 recipient 본인 SELECT 정책 추가. POC 동안은 dispatch 만 접근 |
| cleanup cron | **90일 TTL, 매주 일요일 04:00 UTC** | row 누적 부담 미미하지만 운영 데이터 부재 상태 default. 추후 보고 후 조정 |
| 산출물 | plan + ADR ×2 + spec | migration ×2 → ADR ×2 (prefs 키 ADR-0016, dedup 테이블 ADR-0017), validators/analytics 변경 → spec 1개 |
| 트리거 위치 | `toggleKudos` Server Action 의 INSERT 분기 직후 | 기존 `dispatchActionStartNotification` 호출 패턴과 동일 |

## 기술 검토 반영 (2026-05-22)

본 plan 은 grilling 직후 1차 기술 검토를 거침. 발견 사항은 각 섹션에 라벨(H1/H2/H3/M1/M2/M3/L1/L2/L3/A1/A2/A3)로 인라인 표기. 라벨 목적은 PR 리뷰 시 검토 출처를 빠르게 찾기 위함.

| 라벨 | 항목 | 반영 위치 | 상태 |
|---|---|---|---|
| **H1** | idempotency race → `kudos_push_log` 테이블로 격상 | §작업 단계 4 step 4, ADR-0017, spec §C5 | ✅ 결정됨 (2026-05-22) |
| **H2** | `users.display_name` RLS 분석 → admin 불요 | §작업 단계 5 | ✅ 결정됨 |
| **H3** | Vercel Server Action `void` → **`after()` 채택 + start 알림 일괄 마이그레이션** | §작업 단계 5, 6 + §리스크 H3 | ✅ 결정됨 (2026-05-22) |
| **M1** | dispatch helper vs toggleKudos 의 client 종류 명시 | §작업 단계 4, 5 | ✅ 반영 |
| **M2** | `emoji: KudosEmoji` 타입 강제 | §작업 단계 4 시그니처 | ✅ 반영 |
| **A1** | `track("kudos_given")` → dispatch 호출 순서 | §작업 단계 5 | ✅ 반영 |
| **A2** | dispatch helper 내부는 모두 `adminClient()` | §작업 단계 4 | ✅ 반영 |
| **A3** | closed 챌린지 옛 action_log → push skip | §작업 단계 4 step 2 | ✅ 결정됨 (2026-05-22 PO) |
| **L1** | Web Push 의 HTTPS 전제 (`http://localhost` 미동작) | §검증 §수동 시나리오 §Setup | ✅ 반영 |
| M3, L2 | (헤더 dot plan 측 반영) | 자매 plan | ✅ |
| L3 | migration 단일 transaction 명시 | spec §Design §C4 | ✅ 반영 |
| M4 | `/notifications` 탭 라벨 follow-up | spec §Out of scope | ✅ 반영 |

## 영향 범위

- 변경 경로:
  - 신규: `supabase/migrations/0033_notification_prefs_kudos.sql` (ADR-0016)
  - 신규: `supabase/migrations/0034_kudos_push_log.sql` (ADR-0017)
  - 수정: [`src/app/(app)/challenge/[id]/_actions.ts`](../../../src/app/(app)/challenge/[id]/_actions.ts) — toggleKudos INSERT 분기 직후 `after()` 로 dispatch (H3 채택) + 기존 `void dispatchStartNotification` 도 `after()` 로 일괄 마이그레이션
  - 수정: [`src/app/(app)/me/_components/push-settings.tsx`](../../../src/app/(app)/me/_components/push-settings.tsx) — kudos `<Toggle>` 추가 + `anyOn` 계산 갱신 (ADR-0016 follow-up)
  - 신규: `src/app/api/cron/cleanup-kudos-push-log/route.ts` — 90d TTL cleanup (ADR-0017 follow-up)
  - 수정: `vercel.json` — 신규 cron 추가 (매주 일요일 04:00 UTC)
  - 수정: [`src/lib/push/dispatch.ts`](../../../src/lib/push/dispatch.ts) — `dispatchKudosReceivedNotification(args)` 신설
  - 수정: [`src/lib/push/send.ts`](../../../src/lib/push/send.ts) — `PushPayload.type` 에 `"kudos_received"` 추가
  - 수정: [`src/lib/validators/push.ts`](../../../src/lib/validators/push.ts) — `notificationPrefsSchema.kudos: z.boolean()`
  - 수정: [`src/lib/analytics/schema.ts`](../../../src/lib/analytics/schema.ts) — `notification_sent.type` enum 확장 + props 옵셔널 필드
  - 수정: [`src/lib/notifications/store.ts`](../../../src/lib/notifications/store.ts) — `NotificationType` 확장
  - 수정: [`src/lib/db/reads/notification-prefs.ts`](../../../src/lib/db/reads/notification-prefs.ts) — `DEFAULT_PREFS.kudos: false`
  - 수정: [`src/types/supabase.ts`](../../../src/types/supabase.ts) — `pnpm db:types` 재생성 결과
  - 신규/수정: `src/lib/push/dispatch.spec.ts` 에 kudos 케이스 추가 · `src/lib/validators/push.spec.ts` · `src/lib/analytics/schema-union-parity.spec.ts`
- 데이터 / RLS 영향:
  - `users.notification_prefs` jsonb shape 확장 + CHECK 제약 재작성 (migration 0033)
  - **신규 테이블 `public.kudos_push_log`** (migration 0034, ADR-0017) — service_role only, FK CASCADE
  - 새 events row: `name='notification_sent'`, `props.type='kudos_received'` (관측용; dedup 책임 아님)
  - 기존 RLS 변경 없음 (`kudos_insert_self_not_own` 으로 본인→본인 차단 이미 보장)
- 외부 서비스: Web Push (기존 인프라 활용)
- 재사용 후보: 기존 `dispatch()` helper 의 `safeSend` · `cleanupInvalidSubscription` · `isQuietHoursKST`

## 작업 단계 (small batch)

> **선결 조건**: 자매 plan [`header-unread-dot-source`](2026-05-22-header-unread-dot-source.md) 의 작업 단계 1~4 가 먼저 완료되어 있어야, kudos push → IDB 적재 → 헤더 dot 자동 ON 흐름을 한 PR 에서 검증 가능. 두 plan 을 순차 실행.

1. **Migrations + ADR 적용 (0033 + 0034)**
   - `supabase/migrations/0033_notification_prefs_kudos.sql` 작성 ([spec §C4](../specs/2026-05-22-kudos-notification-schema.md) SQL 그대로).
   - `supabase/migrations/0034_kudos_push_log.sql` 작성 ([spec §C5](../specs/2026-05-22-kudos-notification-schema.md) SQL 그대로). RLS enable + 정책 미부여.
   - `pnpm supabase db reset` 으로 로컬 재적용 — 기존 row backfill + 신규 테이블 생성 확인.
   - `pnpm db:types` 로 `src/types/supabase.ts` 재생성.
   - 검증: `pnpm supabase db reset && pnpm db:types && pnpm typecheck`
   - RLS 검증 (anon/authenticated 각각): `select * from kudos_push_log` → 0 row.
2. **타입 SoT 확장 (zod + payload)**
   - `notificationPrefsSchema` 에 `kudos: z.boolean()` 추가
   - `PushPayload.type` 에 `"kudos_received"` 추가
   - `NotificationType` 에 `"kudos_received"` 추가
   - `DEFAULT_PREFS.kudos: false`
   - 검증: `pnpm typecheck && pnpm lint`
3. **analytics enum 확장**
   - `notification_sent.type` enum 에 `"kudos_received"`
   - props 에 `actionLogId.optional()` · `actorUserId.optional()` 추가
   - 검증: `pnpm test src/lib/analytics/schema-union-parity.spec.ts`
4. **`dispatchKudosReceivedNotification` helper 신설**
   - 시그니처 (M2 — `KudosEmoji` 타입 강제):
     ```ts
     import type { KudosEmoji } from "@/lib/validators/kudos";

     dispatchKudosReceivedNotification(args: {
       recipientUserId: string;
       actorUserId: string;
       actorDisplayName: string;
       actionLogId: string;
       challengeId: string;
       emoji: KudosEmoji;
     }): Promise<DispatchSummary>
     ```
   - **모든 DB 접근은 `adminClient()` (A2)**: kudos_push_log / push_subscriptions / users / challenges 조회는 RLS 우회 일관.
   - 동작 순서:
     1. **본인→본인 방어 (선)**: `recipientUserId === actorUserId` 면 즉시 리턴 (RLS 가 1차 차단하지만 dispatch 단 2차 가드 — DB 왕복 절약).
     2. **A3. 챌린지 상태 체크**: `admin.from('challenges').select('status').eq('id', challengeId).single()` — `status !== 'active'` 면 `{recipientCount:0, quietHours:false}` 즉시 리턴. closed/pending 챌린지 옛 글에 달린 응원은 push 안 함 (PO 결정 2026-05-22). RLS 정책 `kudos_insert_self_not_own` 은 status 미체크라 INSERT 자체는 가능 — push 만 차단.
     3. recipient 의 `notification_prefs.kudos` 확인 → false 면 `{recipientCount:0, quietHours:isQuietHoursKST()}` 즉시 리턴.
     4. **H1. dedup 선예약** (ADR-0017 — spec §C5 의 SQL):
        ```ts
        const { data: reserved, error: insErr } = await admin
          .from("kudos_push_log")
          .insert({ recipient_user_id, action_log_id, actor_user_id })
          .select("recipient_user_id")
          .maybeSingle();
        if (insErr?.code === "23505" || !reserved) {
          return { recipientCount: 0, quietHours: isQuietHoursKST() };
        }
        ```
        UNIQUE PK 가 atomic dedup — events 5분 윈도우 race 영구 해소.
     5. recipient 의 `push_subscriptions` 로드.
     6. quiet hours 적용 — `isQuietHoursKST()` true 면 send 생략, 단 dedup row 는 **유지** (quiet 끝나도 재발송 안 함 — start/deadline 알림 패턴 동일).
     7. payload: `{ title: "응원이 도착했어요", body: "{actorDisplayName}님이 {emoji}을 보냈어요", type: "kudos_received", category: "friend_action", targetUrl: "/challenge/{challengeId}", challengeId, url: "/challenge/{challengeId}" }`.
     8. `safeSend`. **실패 보상**: web-push 가 throw 하면 dedup row 삭제 (`admin.from('kudos_push_log').delete().match(...)`) — 동일 actor retry 가능.
     9. `track("notification_sent", { type:"kudos_received", challengeId, suppressed, outcome, actionLogId, actorUserId })`.
   - 검증: 단위 테스트 7케이스 — recipient prefs OFF / 본인=actor / **closed 챌린지 skip (A3)** / **dedup hit (H1)** / **send 실패 후 dedup 보상** / quietHours / sent
5. **toggleKudos 에 dispatch 통합 (H3 — `after()` 채택)**
   - **호출 순서 (A1)**: `kudos.insert()` 성공 → `track("kudos_given")` → `after(() => dispatchKudosReceivedNotification(...))`. 기존 `markActionStarted` 가 track → dispatch 순서이므로 일관 적용.
   - **lookup 클라이언트 선택 (M1, H2)**:
     - `action_logs.user_id` · `challenge_id` lookup → 일반 `supabase` (authenticated) client. 근거: kudos INSERT 성공 = actor 가 `kudos_insert_self_not_own` 통과(같은 그룹 멤버) → `al_select_member` RLS 자동 통과.
     - `users.display_name` (actor 본인) lookup → 일반 supabase client. 근거: `users_select_self_or_group` RLS 가 본인 row SELECT 허용.
     - 즉 **본 단계에서는 admin client 불필요** — admin 은 §4 dispatch helper 내부에서만.
   - actor display_name 이 비었으면 fallback `"친구"`.
   - **H3 결정됨 (`after()` 채택)**: `void` 답습이 아닌 Next.js 15+ `import { after } from "next/server"` 사용. Vercel `waitUntil` 보장으로 push 누락 영구 해소. `markActionStarted` 와의 차이: 그쪽은 `await` 로 summary 를 응답에 포함해야 하지만 (`recipientCount`, `quietHours`), kudos 는 응답에 push 결과 미포함이라 `after()` 가 맞다.
     ```ts
     import { after } from "next/server";
     // ...
     after(() =>
       dispatchKudosReceivedNotification({...}).catch((e) =>
         console.error("[toggleKudos] dispatch failed", e)
       )
     );
     ```
   - 검증: `pnpm test src/app/(app)/challenge`
6. **start 알림 dispatch 도 `after()` 로 일괄 마이그레이션 (H3 follow-up 흡수)**
   - [`src/app/(app)/challenge/[id]/_actions.ts:280`](../../../src/app/(app)/challenge/[id]/_actions.ts) 의 `void dispatchStartNotification(parsed.data.challengeId).catch(...)` → `after(() => dispatchStartNotification(...).catch(...))` 로 변경.
   - `markActionStarted` (응답에 summary 포함) 는 그대로 `await` 유지 — 정직한 토스트가 필요한 경로는 변경 금지.
   - **왜 같이 마이그레이션**: 두 경로가 같은 fire-and-forget 패턴이라 한 PR 에서 정렬해야 추후 일관성 부채 없음.
   - 검증: 단위 테스트 — `dispatchStartNotification` 모킹 후 `after()` 호출 검증. (`vi.mock("next/server")`)
7. **`/me` prefs 토글 UI 에 kudos 추가 (ADR-0016 follow-up 흡수)**
   - [`src/app/(app)/me/_components/push-settings.tsx`](../../../src/app/(app)/me/_components/push-settings.tsx) 에 신규 `<Toggle>`:
     ```tsx
     <Toggle
       label="응원 받음 알림"
       description="내 인증글에 응원이 달리면 알려드려요"
       checked={prefs.kudos}
       onChange={(v) => handlePrefChange("kudos", v)}
     />
     ```
   - `handlePrefChange` 내부 `anyOn` 계산 갱신: `const anyOn = next.start || next.deadline || next.kudos;` — kudos 만 ON 인 사용자도 push_subscription 유지되도록.
   - 기타 변경 없음 — `updateNotificationPrefs` server action 은 `NotificationPrefs` 전체 객체를 받으므로 schema 확장만으로 자동 지원.
   - 검증: `pnpm test src/app/(app)/me` (기존 spec 확장).
8. **`kudos_push_log` cleanup cron (ADR-0017 follow-up 흡수)**
   - 신규 route handler: `src/app/api/cron/cleanup-kudos-push-log/route.ts` — admin client 로 `delete().lt('sent_at', new Date(Date.now() - 90*24*3600*1000).toISOString())` 실행. 응답: `{ deleted: number }`.
   - 기존 `src/app/api/cron/deadline-push/route.ts` 의 `CRON_SECRET` Bearer 인증 패턴 동일 적용.
   - `vercel.json` `crons` 배열에 추가:
     ```json
     { "path": "/api/cron/cleanup-kudos-push-log", "schedule": "0 4 * * 0" }
     ```
     매주 일요일 04:00 UTC (= KST 13:00). 부하 낮은 시간.
   - **TTL 90일**: 운영 데이터 부재 상태의 default. 5만 row/년 가정 시 90일 자르면 ~1.2만 유지. 추후 운영 보고 후 조정.
   - 검증: 단위 테스트 — 90일 초과/미만 row 각각 시드 후 cron 실행 → 초과만 삭제 확인.
9. **수동 dev 검증** (아래 §검증 §시나리오)
10. **전체 검증**
    - `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
    - `pnpm validate:docs`

## 검증

```bash
pnpm supabase db reset
pnpm db:types
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### 수동 시나리오

**Setup (L1 — Web Push 의 HTTPS 전제)**: Web Push API 는 `http://localhost` 에서 동작하지 않으므로 다음 중 하나 필요:
- Vercel preview 배포 환경 (권장 — 본 PR 푸시 시 자동 생성됨)
- 로컬 + `mkcert` 로 HTTPS dev 서버
- `ngrok https://...` 로 dev 서버 터널링

2개 계정(A=actor, B=recipient) 각각 모바일 viewport. B 가 위 환경에서 push 구독 등록 완료 후, Supabase Studio 에서 B 의 `notification_prefs.kudos` 수동 `true` 로 UPDATE (UI 토글 follow-up 전이라 옵트인 경로 없음).

- [ ] **golden path**: B 가 인증글 작성 → A 가 해당 글에 👍 kudos → B 의 모바일에 push 도착, body="A님이 👍을 보냈어요", `/notifications` 페이지에 항목 적재, 헤더 dot ON (자매 plan 머지 시점부터). `kudos_push_log` 에 row 1개 생성 확인.
- [ ] **DELETE 무시**: A 가 👍 취소 → B 에 새 알림 없음. `kudos_push_log` row 도 유지 (재발송 안 함).
- [ ] **emoji 변경 spam 차단 (H1 해소 검증)**: A 가 👍 후 0.5초 내 ❤️ 로 변경 → B 에 추가 push 없음. `kudos_push_log` 의 (B, action_log, A) PK 가 UNIQUE 라 두 번째 INSERT 가 ON CONFLICT.
- [ ] **다른 actor 별개**: A 의 👍 직후 C 가 👏 → B 에 별도 push 도착. `kudos_push_log` 에 (B, action_log, C) 새 row.
- [ ] **본인 kudos 차단**: B 가 자기 글에 kudos 시도 → RLS 차단 (이미 보장), dispatch 진입도 안 함.
- [ ] **prefs OFF**: B 의 `notification_prefs.kudos=false` 일 때 A 가 kudos → push 없음, `kudos_push_log` row 도 없음 (prefs 체크가 dedup 선예약 전 단계).
- [ ] **A3. closed 챌린지 skip**: 챌린지 종료(`status='closed'`) → A 가 옛 인증글에 kudos INSERT → push 안 가고 `kudos_push_log` row 도 없음. analytics `notification_sent` 도 안 남음 (dispatch step 2 에서 즉시 리턴).
- [ ] **send 실패 후 retry**: web-push 가 throw 하는 환경(예: 잘못된 subscription) 으로 강제 → 첫 dispatch 실패 → `kudos_push_log` row 삭제(보상) → 동일 actor 재시도 시 dedup 재INSERT 성공.
- [ ] **quiet hours (KST 02-07)**: 시각 조작 또는 `isQuietHoursKST` 모킹 — push suppressed 로 발송 안 됨, `kudos_push_log` row 는 **유지**, analytics `outcome:"suppressed"` 기록.
- [ ] **/notifications 페이지**: kudos 알림이 "친구 인증" 탭에 노출.
- [ ] **`/me` 토글 (ADR-0016 follow-up)**: PushSettings 에 "응원 받음 알림" 토글 노출. OFF 상태에서 A 가 kudos → push 없음. 토글 ON → 다음 kudos 부터 push. 토글 OFF 만 있고 start/deadline 도 OFF 면 push_subscription 자동 정리(`!anyOn` 분기).
- [ ] **cleanup cron (ADR-0017 follow-up)**: `kudos_push_log` 에 `sent_at = now() - interval '100 days'` row 시드 + 최근 row 시드 → `curl -H "Authorization: Bearer $CRON_SECRET" $VERCEL/api/cron/cleanup-kudos-push-log` → 100일 row 만 삭제, 최근 row 유지.
- [ ] **`after()` 동작 검증 (H3)**: toggleKudos 응답이 push 발송 결과를 기다리지 않고 즉시 리턴 (latency 측정). dispatch 는 Vercel function logs 에서 응답 후에도 실행 완료 확인.

### 수동 확인 비대상

- middleware/auth 플로우 — 변경 없음
- recap / settlement — 무관

## 리스크 / 미해결

- **prefs.kudos default false 의 임시 무성 상태**: /me 토글 UI 가 머지되기 전까지 일반 사용자는 옵트인 불가 → kudos 알림 사실상 발송 0. dogfood 단계에서 Supabase Studio 로 수동 ON 해 검증. PO 와 follow-up 우선순위 합의 필요.
- **PRD §9.1 표 갱신**: PO 승인 후 PRD 본문 갱신. 미반영 시 가드레일 §3 §AnalyticsEvent 위반. PR 본문 체크박스로 추적.
- **push_subscriptions 의 다중 디바이스**: recipient 가 여러 디바이스 구독 시 모두에게 발송 (기존 dispatch 패턴 동일). idempotency 는 events 기반이라 사용자 단위 1회로 묶임 → 첫 디바이스 그룹은 다 받고, 5분 내 두 번째 actor 시 새 디바이스 등록되어도 같은 5분 내면 skip. POC 수준 허용.
- **메시지 본문 i18n**: 한국어 hardcoded. POC 정책상 허용.
- ~~**H1. events idempotency race**~~ → **해소됨 (ADR-0017)**: events 5분 윈도우 폐지, `kudos_push_log` UNIQUE PK 로 atomic dedup. §작업 단계 4 step 4 참조.
- ~~**A3. closed 챌린지의 옛 action_log 에 kudos INSERT**~~ → **결정됨 (2026-05-22 PO)**: dispatch helper 진입 직후 `challenges.status='active'` 체크 → closed/pending 이면 skip. kudos INSERT 자체는 RLS 가 허용(과거 응원이 사라지지 않음) 하되 push 만 차단. §작업 단계 4 step 2 참조.
- ~~**H3. Vercel Server Action `void` promise 종료 보증**~~ → **해소됨 (2026-05-22)**: `after()` API 채택. `void` 패턴은 Lambda 응답 후 컨테이너 freeze 시점에 promise 가 잘릴 위험이 있으나, Next.js 15+ `import { after } from "next/server"` (Vercel `waitUntil` 빌트인) 는 응답 후에도 함수를 계속 살려 완주 보장. 본 PR 에서 kudos dispatch + 기존 `_actions.ts:280` startChallengeWithSignedParticipants 의 `void dispatchStartNotification` 일괄 마이그레이션. §작업 단계 5, 6 참조.

## 후속 액션 (별도 PR/issue)

> 2026-05-22 — follow-up 4개 (`after()` 도입 · `/me` 토글 · cleanup cron · SELECT 정책 결정) 본 PR scope 로 흡수됨. 아래는 운영/PO 결정 동반 항목만 남김.

- **PRD §9.1 이벤트 표 갱신** — PO 승인 후 PRD 본문에 `notification_sent.type="kudos_received"` 행 추가. 코드 변경 없음.
- **kudos 알림 그룹 단위 묶음 (digest)** — 다수 응원 시 1개 알림으로 합치는 정책. 운영 데이터 (응원 건/일) 확인 후 결정.
- **메시지 i18n** — 다국어 단계에서 전체 앱과 함께.
- **`kudos_push_log` 본인 이력 UI + SELECT 정책 부여** — "내가 받은 응원 푸시 이력" 화면이 추가되면 recipient 본인 SELECT 정책 부여. UX 결정 동반.
- **`/me` 페이지의 cron 알림** — cleanup 실행 결과 모니터링 (Vercel dashboard) — 별도 작업 아님, 운영 항목.
