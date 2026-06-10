---
spec: 2026-06-10-feedback-suggestion
title: 개발자에게 건의하기 — feedback 테이블 + 사진 첨부 + Slack 알림
author: ian
date: 2026-06-10
status: draft
---

## Summary

로그인 사용자가 마이페이지에서 진입하는 전용 화면 `/me/feedback` 에서 **카테고리(버그/기능 제안/기타) + 본문(1~1000자) + 선택적 사진 1장**을 제출하는 기능을 설계한다. 제출은 신규 `feedback` 테이블에 저장되고(기록의 SoT(Source of Truth)), 저장 성공 시 Slack #qa 채널로 best-effort 알림을 보낸다(실패해도 제출은 성공).

본 spec은 신규 validator(`packages/domain/src/validators/feedback.ts`) 추가에 대한 spec-required 산출물이다. migration(`0047_feedback.sql`)에 대한 ADR은 별도로 동반한다.

## Why

- dogfood 기간에 사용자 건의·버그 리포트가 카톡/구두로 흩어져 유실된다. 앱 안에서 받아 한 곳(`feedback` 테이블)에 모은다.
- Slack #qa 가 이미 QA 리포트 허브라서, 새 대시보드 없이 기존 채널로 실시간 인지가 가능하다.
- 버그 리포트는 화면 캡처가 텍스트보다 정보량이 크다 — 사진 1장 첨부를 지원한다.
- 분석 이벤트(`feedback_submitted`)는 추가하지 않는다 — feedback 테이블 자체가 모든 제출을 보존하므로 PRD §9.1(AnalyticsEvent 표) 갱신·PO 승인 비용을 들일 이유가 없다.

## Impact Scope

### 변경 경로

- 신규: `supabase/migrations/0047_feedback.sql`
- 신규: `packages/domain/src/validators/feedback.ts` (+ `feedback.spec.ts`, `index.ts` export 추가)
- 신규: `apps/web/src/app/(app)/me/feedback/page.tsx` · `_components/feedback-form.tsx` · `_actions.ts` (+ `_actions.spec.ts`)
- 신규: `apps/web/src/lib/storage/feedback-photos.ts` (+ spec)
- 신규: `apps/web/src/lib/slack/notify.ts` (+ spec)
- 수정: `apps/web/src/app/(app)/me/page.tsx` (진입 링크 행 추가)
- 수정: `apps/web/.env.example` (`SLACK_FEEDBACK_WEBHOOK_URL` 주석 추가)
- 수정: `docs/BE_SCHEMA.md` (테이블 인벤토리 13번째 + 컬럼·RLS 섹션)
- 신규: `docs/adr/0035-feedback-table-storage.md` (migration 동반 ADR)

### src/ 영향

위 변경 경로의 `apps/web/src/**` · `packages/domain/src/**` 한정. 기존 action-log 사진 플로우(`action-photos.ts`)는 수정하지 않는다 — 경로 규격이 달라(3-segment vs 2-segment) 별도 헬퍼를 신설한다.

### Supabase / RLS / migration 영향

- 신규 테이블 `feedback` + RLS(INSERT-only)
- 신규 private Storage 버킷 `feedback-photos` + owner-scoped RLS
- `truncate_test_data` 함수 재발행(0012 정의 기반 확장)

### 외부 서비스

Slack Incoming Webhook (신규 server-only env `SLACK_FEEDBACK_WEBHOOK_URL`). 미설정 시 알림 단계만 건너뛴다.

## Design

### C1. DB — `feedback` 테이블 (13번째)

```sql
-- supabase/migrations/0047_feedback.sql (발췌)
create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  category   text not null check (category in ('bug','feature','other')),
  body       text not null check (char_length(body) between 1 and 1000),
  photo_path text,        -- '{userId}/{feedbackId}-{nonce}.{ext}', NULL = 사진 없음
  created_at timestamptz not null default now()
);
```

- FK는 `public.users(id) on delete cascade` — 레포 컨벤션(migration 0034·0042)과 일치하고, 유저 삭제 시 feedback 이 남아 FK 가 막히는 사고를 cascade 가 이중으로 방지한다.
- **RLS: INSERT-only** (`with check (user_id = auth.uid())`). SELECT/UPDATE/DELETE 정책 없음 — 앱에 건의 열람 화면이 없고(YAGNI), 개발자는 Supabase Studio(service_role)로 조회하므로 노출면을 최소화한다.
- **함정 — `insert(...).select()` 금지**: SELECT 정책이 없어 insert 후 `.select("id")` 체이닝이 RLS 에 막힌다. 그래서 Server Action 이 `randomUUID()` 로 id 를 선생성해 insert 에 넣는다.

### C2. Storage — 신규 `feedback-photos` private 버킷

- 5MB 제한, `image/jpeg`·`image/png`·`image/webp` (클라이언트 `prepareForUpload` 가 HEIC→JPEG 변환·1920px 리사이즈를 이미 담당 — 0013 방향과 정합).
- 객체 경로: `{userId}/{feedbackId}-{nonce}.{ext}` (2-segment).
- storage.objects RLS: INSERT·SELECT·DELETE 모두 owner-scoped (`auth.uid()::text = (storage.foldername(name))[1]`) — 0011 의 `ap_insert_self`/`ap_delete_self` 와 동형.
- **왜 신규 버킷**: 기존 `action-photos` 의 SELECT 정책은 "챌린지 그룹 멤버" 기준이라 챌린지 없는 건의 사진에 부적합. owner-scoped 별도 버킷이 private+signed URL 가드레일에 깔끔히 정렬된다.
- 업로드 헬퍼는 `apps/web/src/lib/storage/feedback-photos.ts` 신설 — 기존 `action-photos.ts` 의 `PHOTO_PATH_RE` 가 3-segment 고정이고 `BUCKET` 이 하드코딩이라 재사용 불가.

### C3. 도메인 validator — `@withkey/domain`

```ts
// packages/domain/src/validators/feedback.ts
export const FEEDBACK_CATEGORIES = ["bug", "feature", "other"] as const;
export const feedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);
export const feedbackSchema = z.object({
  category: feedbackCategorySchema,
  body: z.string().trim().min(1).max(1000),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;
```

사진 File 은 zod 입력 밖에서 size/mime 을 검증한다(기존 action-log 패턴 동형) — File 은 직렬화 가능한 zod 스키마 대상이 아니다.

### C4. Server Action — `submitFeedback(formData)`

`app/(app)/me/feedback/_actions.ts`, `withUser` 래퍼 + `ActionResult<{ ok: true }>` 계약.

```text
① FormData → category·body·photo(File|null) 추출 → feedbackSchema.safeParse
   (실패 시 validationFailure)
② feedbackId = randomUUID() 선생성 (C1 함정 회피)
③ 사진 있으면 유저 세션 client 로 feedback-photos 업로드
   — 실패 시 비파괴 폴백: photo_path=null 로 본문만 저장 + console.warn
④ feedback insert (id·user_id·category·body·photo_path)
   — insert 실패 && 사진 업로드 성공이면 best-effort 객체 remove (orphan object 정리)
⑤ insert 성공 → next/server after() 안에서 Slack 알림 (C5)
```

- **왜 업로드 선행(③→④)**: RLS 가 INSERT-only 라 insert-후-update 경로가 없다. orphan row 대신 orphan object 를 택하고 ④ 실패 시 정리한다 — 이 트레이드오프는 ADR-0035 에 기록.
- **왜 `after()`**: Slack 왕복(최대 2.5s 타임아웃)을 사용자 응답 latency 에서 분리 — `submitActionLog` 의 push·검증 신호 기록과 동일한 확립 패턴.
- 더블 제출 방지는 클라이언트 제출 중 버튼 비활성으로 충분(POC 신뢰 사용자 기준). 하드 rate limit 없음.

### C5. Slack 알림 — `lib/slack/notify.ts`

- server-only env `SLACK_FEEDBACK_WEBHOOK_URL` (`NEXT_PUBLIC_` 접두 금지 — webhook URL 자체가 발송 권한). 미설정이면 조용히 skip.
- `AbortController` 2.5s 타임아웃 + 자체 try/catch — **never-throw** (`track()` 철학: 알림 실패가 제출 성공을 절대 뒤집지 않는다).
- 메시지: 카테고리 배지 · 본문 · 제출자(user id + email) · 사진 있으면 signed URL 링크.
- 사진 signed URL 은 `adminClient()`(service_role)로 생성, **TTL 72h** — 개발자가 채널에서 늦게 클릭해도 열리되, 600s(앱 피드)보다 길게 노출되는 위험은 내부 #qa 한정 + 72h 만료로 제한한다. ADR-0024 위반 아님: user-facing cache 에 admin 결과를 저장하는 것이 아니라 1회성 URL 생성이다.

### C6. UI — `/me/feedback` + `/me` 진입점

- `page.tsx`(RSC): `requireUser` 게이트 + 제목 + `<FeedbackForm/>`.
- `_components/feedback-form.tsx`(client): `Select`(카테고리) · `Textarea`(본문, 잔여 글자 카운터) · 사진 input(카메라/라이브러리, `prepareForUpload` 전처리, `URL.createObjectURL` 미리보기, 제거 버튼, 5MB/형식 클라 검증) · 제출 버튼(제출 중 비활성). 성공 시 인라인 성공 상태("전달됐어요" + 마이페이지로 돌아가기).
- `/me` 에 "개발자에게 건의하기" 행 추가 — `LegalLinks` 와 동일한 카드 행 스타일.

### Data flow

```text
[client] prepareForUpload(photo) → FormData(category, body, photo?)
   → [Server Action] zod 검증 → Storage 업로드(비파괴) → feedback insert(SoT)
   → after(): adminClient signed URL(72h) → Slack #qa POST(2.5s timeout, never-throw)
```

## Alternatives Considered

1. **Slack inline await (insert 직후 동기 POST)** — 코드 경로는 단순하지만 webhook 지연·타임아웃 2.5s 가 사용자 체감 latency 에 더해진다. 레포의 `after()` 확립 패턴과도 어긋나 기각.
2. **fire-and-forget (`void` POST, await 없음)** — Vercel serverless 는 응답 반환 후 미await promise 를 종료시켜 알림이 유실될 수 있다. 기각.
3. **DB-only + Supabase DB Webhook 릴레이** — 가장 디커플링이 좋지만 webhook 설정·중계 endpoint 등 인프라가 늘어 POC 과잉. v1 백로그.
4. **insert 선행 + photo_path UPDATE (action-log 동형)** — UPDATE 정책 또는 SECURITY DEFINER RPC 가 추가로 필요해 INSERT-only RLS 의 단순함을 해친다. 업로드 선행 + orphan object 정리로 대체.
5. **기존 `action-photos` 버킷 재사용** — SELECT 정책이 챌린지 그룹 멤버 기준이라 부적합. 기각.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
```

### 시나리오

- 정상: 카테고리+본문 제출 → feedback row 생성 → #qa 메시지 도착
- 정상(사진): 사진 첨부 제출 → Storage 객체 + photo_path 저장 → Slack 메시지에 signed URL 포함, 클릭 시 이미지 열람
- 검증 실패: 빈 본문 / 1000자 초과 / 잘못된 카테고리 → `invalid_input` + 필드 이슈
- 사진 폴백: Storage 업로드 실패(mime/size/네트워크) → 본문만 저장(photo_path=null), 제출은 성공
- insert 실패: 업로드된 객체 best-effort remove 확인
- Slack 실패: env 미설정 / webhook 4xx / 타임아웃 → 제출 성공 유지, 에러 로그만
- RLS: anon 으로 feedback INSERT 거부, authenticated 로 타인 user_id INSERT 거부, SELECT 거부 실측
- 모바일 viewport 수동: 진입(/me) → 작성 → 사진 첨부 → 제출 → 성공 상태

## Rollout

1. migration `0047_feedback.sql` + ADR-0035 + 본 spec 을 같은 PR 로 머지 (CI Integration 이 공유 Supabase 에 db push)
2. Vercel env 에 `SLACK_FEEDBACK_WEBHOOK_URL` 설정 (#qa Incoming Webhook 발급)
3. dogfood 기간 #qa 도착률 관찰 — 유실 의심 시 DB(SoT) 와 대조

### 롤백

UI·action·헬퍼는 1 commit revert. migration 은 단방향(POC 정책) — 테이블·버킷은 잔존하되 진입점 제거로 신규 유입이 차단되므로 데이터 위험 없음. env 제거 시 Slack 단계만 자동 skip.

## Out of scope

- 다중 사진 첨부 (1장 고정)
- 개발자 답변·2-way 스레드, 앱 내 제출 이력 화면
- 서버 rate limit (제출 중 버튼 비활성만)
- 분석 이벤트 (`AnalyticsEvent` union 불변)
- DB Webhook 릴레이 (대안 3 — v1 백로그)
- `truncate_test_data` 의 기존 잠복 결함(point_ledger·settlements 미정리)은 본 기능과 무관한 별도 forward-fix — ADR-0035 에 인지만 기록

## 용어집

- **best-effort**: 실패해도 주 흐름(제출 성공)을 막지 않고 로그만 남기는 처리 방식
- **orphan object**: 참조하는 DB row 가 없는 채 Storage 에 남은 파일
- **owner-scoped RLS**: 객체 경로 첫 segment(=userId)가 본인일 때만 허용하는 Row Level Security 정책
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어, Supabase 전 테이블 ON
- **signed URL**: 만료 시간이 있는 사전 서명 접근 URL — private 버킷 객체를 한시적으로 노출
- **SoT**: Single Source of Truth — 중복 정의 없이 기준으로 삼는 단일 원본
- **spec-required 경로**: 변경 시 spec 또는 ADR 동반이 필수인 경로 (AGENTS.md §4)
