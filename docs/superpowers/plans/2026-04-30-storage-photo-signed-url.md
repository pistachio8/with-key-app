# Storage 사진 업로드 + signed URL end-to-end 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `submitActionLog` 한 번 호출로 사용자의 실 사진이 Supabase Storage(`action-photos` bucket, private) 에 저장되고, 피드 조회 시 서버 컴포넌트가 `createSignedUrl` 로 TTL 기반 접근 URL 을 발급해 `FeedCard` 에 전달한다. 현재 하드코딩된 `photoUrl: "https://example.com/photo.jpg"` ([action-form.tsx:52-53](src/app/(app)/action/_components/action-form.tsx#L52-L53)) 을 **private bucket + RLS + 10 분 TTL signed URL** 파이프라인으로 교체한다.

**Architecture:**

- **버킷 1 개 `action-photos` (private)**. POC 범위라 challenge/그룹 단위 분할 금지. 파일 경로 자체에 소유 구조를 박는다.
- **경로 규약**: `{userId}/{challengeId}/{actionLogId}-{nonce}.{ext}`. `actionLogId` 는 DB 가 발급 — `action_logs` row 를 `photo_path=null` 로 먼저 insert → 반환된 id + 서버 nonce (`crypto.randomUUID()`) 로 path 확정 → Storage 업로드 → 성공 시 같은 row 를 `photo_path=<path>` 로 update. **단, 업로드가 5분을 넘기면** `al_update_self_5min` RLS ([0002_rls.sql:157-160](supabase/migrations/0002_rls.sql#L157-L160)) 가 update 를 막는다 → D-box-5 에서 해결(서버 측 update 에 `auth.uid()` 재확인 RPC 도입).
- **쓰기 경로 = Server Action 단일 step**. 브라우저 → Server Action (`submitActionLog`) 이 `FormData` 로 파일을 받고 → user-scoped client 로 `storage.from("action-photos").upload(path, file)`. Next.js 16 기본 `serverActions.bodySizeLimit=1mb` 라 → `8mb` 로 상향. 대안 (`createSignedUploadUrl` + 브라우저 직접 PUT) 은 D-box-1 에서 기각.
- **읽기 경로 = 서버 단일 원점**. `fetchChallengeFeed` (서버 컴포넌트만 호출) 가 각 행의 `photo_path` 를 받아 `storage.from("action-photos").createSignedUrl(path, 600)` 으로 10 분 TTL URL 발급 → `photoSignedUrl: string | null` 을 view 에 싣는다. 클라이언트는 URL 만 수신, path 는 노출되지 않음.
- **RLS 이중 게이트**: bucket 속성 (`allowed_mime_types` + `file_size_limit`) + `storage.objects` 의 RLS 4 정책. INSERT 는 `auth.uid()::text = (storage.foldername(name))[1]`, SELECT 는 path 2번째 세그먼트를 `challenge_id` 로 해석해 `challenge_participants` 로 그룹 멤버만 통과, UPDATE 정책 없음(= 차단), DELETE 는 소유자. signed URL 발급 자체는 user-scoped client 로 수행해 SELECT policy 를 태우므로 비멤버에게는 발급이 실패한다 — admin bypass 금지.
- **MIME + 크기 검증 3 중 방어**: (1) client `<input accept>`, (2) Server Action 내부 Zod (`image/jpeg | image/png | image/webp | image/heic | image/heif` + `≤ 5MB`), (3) bucket policy. 어느 한 단계라도 실패면 업로드 포기 + photo 없이 제출.
- **이벤트 확장**: `action_logged.props` 양측 (Zod + TS union) 에 `photoAttached: boolean` 추가. 기존 `photoSize: number` 유지(업로드 안 됐으면 `0`).
- **폴백**: Storage 업로드 실패 (네트워크/정책/413) 는 logger 로 남기고 `photo_path=null` 상태로 제출 성공. UX 메시지는 "사진 없이 인증됐어요" (비파괴).
- **삭제/정리**: POC 범위에서 v1 보존/청소 정책 없음. `truncate_test_data` 가 `@test.local` 유저의 Storage 오브젝트를 같이 삭제해 CI 안전성 유지.

**Tech Stack:** Next.js 16 App Router · Supabase JS v2 + `@supabase/storage-js` (supabase-js 에 이미 포함) · zod · Vitest (unit + integration) · Playwright E2E · `<input type="file" capture="environment">`. 신규 의존성 없음.

---

## 0. Revision History

**v1 (2026-04-30)** — 초안. D-017 (AI 일기 + events 로깅) 머지 직후 JOURNAL "남긴 부채 → Supabase Storage" 정식 plan 화. 사진 업로드는 PRD §11 Happy Path 필수 단계이고, 하드코딩된 `https://example.com/photo.jpg` 는 Day 10 dogfooding · 사용자 인터뷰 직전 피드 신뢰도를 통째로 깎음. Web Push plan (`2026-04-30-web-push-start-deadline.md`) 과는 **파일 교집합 없음** → 병렬 진행 가능하나 **Storage 가 Happy Path 핵심이라 선행**.

---

## 0. 사전 이해 — 이 plan 이 해결하는 것

`docs/JOURNAL.md` 2026-04-30 (밤) "남긴 부채 → B4 — Supabase Storage" 항목과 `docs/ONBOARDING.md` §6.1 이 요구하지만 **현재 코드에 미배선**인 것 (repo 실측):

1. **클라이언트가 하드코딩 URL 제출** — [src/app/(app)/action/_components/action-form.tsx:52-53](src/app/(app)/action/_components/action-form.tsx#L52-L53) 가 `photoUrl: "https://example.com/photo.jpg"` 리터럴. `// NOTE: Supabase Storage signed URL 로 교체 (B4).` 주석이 이미 플래그.
2. **파일 선택 UI 부재** — `<input type="file">` · `capture="environment"` · 프리뷰 · 파일 크기 표시 전부 없음.
3. **DB 가 URL 을 받음** — [supabase/migrations/0001_init.sql:95](supabase/migrations/0001_init.sql#L95) 의 `photo_url text not null`. Storage path (`uuid/uuid/uuid-uuid.jpg`) 를 저장하려면 컬럼 의미 변경 + `not null` 해제 필요.
4. **Storage 배선 자체가 없음** — `supabase/migrations/` 최신은 `0009_ai_cost_log.sql`. `storage.buckets` / `storage.objects` 관련 DDL 전무.
5. **읽기 레이어에 signed URL 해석 없음** — [src/lib/db/reads/challenge-feed.ts:85](src/lib/db/reads/challenge-feed.ts#L85) 가 `photoUrl: row.photo_url` 로 DB 원문을 그대로 방출. signed URL 발급 지점이 없음.
6. **FeedCard 는 `next/image unoptimized`** — [src/app/(app)/challenge/[id]/_components/feed-card.tsx:32-39](src/app/(app)/challenge/[id]/_components/feed-card.tsx#L32-L39) 가 `src={photoUrl}` 그대로. private bucket URL 을 받을 경로가 준비돼 있지만 값 소스가 바뀌어야 함.
7. **validator 가 URL 을 강제** — [src/lib/validators/action-log.ts:11](src/lib/validators/action-log.ts#L11) 의 `photoUrl: z.string().url()`. FormData 경로로 바뀌면 이 필드는 optional + file metadata 로 교체.
8. **analytics `action_logged` props 에 `photoAttached` 없음** — [src/lib/analytics/schema.ts:61-71](src/lib/analytics/schema.ts#L61-L71) · [src/lib/analytics/track.ts:34-44](src/lib/analytics/track.ts#L34-L44) 양측 `photoSize` 만.
9. **`truncate_test_data` 가 Storage 오브젝트를 안 지움** — [supabase/migrations/0003_state_transitions.sql:53-87](supabase/migrations/0003_state_transitions.sql#L53-L87) 은 DB 테이블만. D-014 (단일 Supabase 공유) 환경에서 테스트 업로드가 누적되면 local/CI/Preview 에 부피 부담.
10. **5 분 update 정책이 2-step 업로드와 충돌** — [supabase/migrations/0002_rls.sql:157-160](supabase/migrations/0002_rls.sql#L157-L160) 의 `al_update_self_5min` 은 **`user_id = auth.uid()` AND `created_at > now() - interval '5 minutes'`**. 2-step 플로우에서 업로드가 5 분을 넘기면 `photo_path` update 가 차단된다. D-box-5 로 해결.

이 plan 이 **하지 않는 것** (§3 에 명시): (a) 이미지 편집 (crop · EXIF 제거 · 재인코딩) — 단순 MIME/size 서버 검증만. (b) CDN / Image 최적화 — `next/image optimized` 는 signed URL redirect 처리 이슈로 별도 ADR 필요 시 v1. (c) Storage 사용량 · 비용 알림 가드 — AI cost 가드(D-017) 대비 우선도 낮음 · v1 이월. (d) 기존 `https://example.com/photo.jpg` row 의 실 사진 마이그레이션 — local/CI/Preview 모두 `truncate_test_data` 스코프 안이라 RPC 한 번으로 리셋 가능. (e) 사진 삭제 UI. (f) 연속 재업로드 시 이전 파일 정리 루틴 (v1 이월). (g) HEIC→JPG 재인코딩 — v1 이월, 본 plan 은 HEIC 업로드를 받아 저장만.

---

## 0.5 실행 가드레일 (Pre-flight)

### 의존성 순서 (반드시 이 순서로)

```
Task 1 (0010 migration: action_logs.photo_url → photo_path + NOT NULL 해제 + CHECK)
  → Task 2 (0011 migration: action-photos bucket + storage RLS 4개 + truncate 확장
           + update_action_log_photo_path RPC)
  → Task 3 (next.config.ts: serverActions.bodySizeLimit="8mb")
  → Task 4 (Zod + TS union photoAttached 추가 · action-log validator 재설계)
  → Task 5 (src/lib/storage/action-photos.ts: uploadPhoto / getPhotoSignedUrl / deletePhoto)
  → Task 6 (submitActionLog: FormData + 2-step insert/RPC-update + 폴백)
  → Task 7 (ActionForm: file input + 프리뷰 + FormData 제출)
  → Task 8 (fetchChallengeFeed: photoSignedUrl 주입)
  → Task 9 (FeedCard · ChallengeFeed: photoSignedUrl 수신 + 이미지 없는 케이스)
  → Task 10 (integration: RLS 3-case + upload 성공/실패 + 2-step window)
  → Task 11 (Playwright E2E: 실 파일 업로드 → 피드 렌더)
  → Task 12 (ONBOARDING §6.1 보강 · D-018 ADR · JOURNAL 항목)
```

- Task 2 는 Task 1 migration 이 remote apply 되어야 테스트 가능 (로컬 `pnpm db:reset` + CI `pnpm db:push`).
- Task 5 는 Task 4 (validator) + Task 2 (bucket) 양쪽 의존.
- Task 6 는 Task 2 RPC(`update_action_log_photo_path`) + Task 5 helper 양쪽 의존.
- Task 8 은 Task 5 의 `getPhotoSignedUrl` 만 의존 — Task 6/7 (쓰기) 와 독립 → PR-B 와 PR-C 병렬 리뷰 가능.

### PR 분할 (권장)

| PR | Tasks | 합쳐진 상태에서 green |
|----|-------|--------------------|
| **PR-A** — DB + Storage DDL | 1 · 2 · 10(부분) | 마이그레이션 apply 후 admin-only 업로드 smoke 통과. UI 는 아직 example.com. |
| **PR-B** — 업로드 파이프라인 | 3 · 4 · 5 · 6 · 7 | `/action` 에서 실 사진 업로드 + `action_logs.photo_path` 저장. 피드는 아직 path 그대로. |
| **PR-C** — 읽기 + E2E + ADR | 8 · 9 · 11 · 12 · 10(나머지) | `/challenge/[id]` 피드에 signed URL 이미지 렌더. E2E 통과. D-018 머지. |

각 PR 은 독립적으로 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` green. PR-A 만 머지돼도 회귀 없음 (action-form 은 example.com fallback 유지).

### Task × ECC 에이전트 매핑

| Task | ECC 호출 | 핵심 체크 |
|------|---------|----------|
| 1 action_logs 컬럼 변경 | database-reviewer | `photo_url` → `photo_path` 의미 전환, `not null` 해제, backfill 전략, index 변경 영향 |
| 2 storage bucket + RLS + RPC | database-reviewer + security-reviewer | SELECT/INSERT/DELETE policy predicate, challenge_participants join 성능, update RPC 가 5 min 창을 명시적으로 우회(소유자 확인 후) |
| 3 next.config.ts | /code-review | `experimental.serverActions.bodySizeLimit` 위치 · 실제 413 회피 |
| 4 validator + analytics | type-design-analyzer | Zod ↔ TS union `photoAttached` 일치, parity spec 가 검출 |
| 5 storage helper | security-reviewer | user-scoped client 만 사용, admin 사용 금지, MIME 재검증, path traversal 차단 |
| 6 submitActionLog FormData | /code-review + silent-failure-hunter | 업로드 실패 시 action_logs row 고아 없음, 폴백 로그 의도적 swallow, RPC 호출 위치 |
| 7 ActionForm UI | a11y-architect + /code-review | 메모리 누수 없는 blob URL revoke, pending 중 재제출 차단, label/aria |
| 8 fetchChallengeFeed | /code-review | N 행 × signed URL N 호출 → `Promise.all` 병렬, 실패 행 null degrade |
| 9 FeedCard + ChallengeFeed | a11y-architect | `photoSignedUrl=null` placeholder · aspect-square 유지, `unoptimized` 유지 |
| 10 integration test | /code-review | 3-case RLS matrix, truncate 스코프, 2-step 5 min 창 회귀 |
| 11 Playwright E2E | e2e-runner | 실 파일 (`tests/fixtures/pixel.jpg`) 업로드 → `action_logs.photo_path` 확인 → 피드 이미지 렌더 |
| 12 ADR D-018 | architecture-decision-records | 단일 버킷 · 2-step + RPC · TTL 근거 |

### 환경 가드

- [ ] `pnpm exec supabase migration list --linked` 로 remote sync 확인. 새 migration 두 개(0010, 0011) 는 Task 1 · 2 커밋 직후 **수동 `pnpm db:push`** 로 원격 apply (CI 는 `scripts/ci/apply-migrations.sh` 가 idempotent 지만 **첫 apply 는 사람이 확인**).
- [ ] Next.js 16 Server Action body size 상한 기본 **1MB** 주의. Task 3 에서 `next.config.ts` 에 `experimental.serverActions.bodySizeLimit = "8mb"` 명시. 잊으면 413 이 Server Action 단에서 먼저 터진다 (PRD §5 UX 허용하지만 로그 어려움).
- [ ] `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY` 는 D-017 에서 이미 정비. 추가 env 없음.
- [ ] `@supabase/storage-js` 는 `@supabase/supabase-js@2.x` 설치 시 포함. 별도 dependency 추가 불필요.
- [ ] Web Push plan (`2026-04-30-web-push-start-deadline.md`) 이 `0010_notification_prefs.sql` 을 제안했음. **본 plan 이 먼저 머지**되면 그쪽이 0012/0013 으로 shift — 본 plan 은 0010/0011 그대로 진행.

---

## 0.6 Decision 박스 — 설계 분기점

### D-box-1: 쓰기 경로 — 서버 경유 단일 step vs. 사전 서명 URL 투 step

| 기준 | A. 서버 경유 (선택) | B. `createSignedUploadUrl` + 브라우저 PUT |
|------|---------------------|-----------------------------------------|
| 라운드트립 | 1 (FormData POST) | 2 (서명 요청 → PUT → 완료 알림) |
| 구현 복잡도 | Low — 기존 `withUser` 계약 확장 | High — 클라이언트 retry · CORS · 완료 ack |
| 파일 크기 상한 | Next body limit (`bodySizeLimit` 설정 필요) | 무관 (Storage ≤ 50MB) |
| 에러 관찰 | Server Action 에 집중 | 브라우저 → Storage → 재통지 3 지점 분산 |

**선택: A (서버 경유)**. POC 범위 5MB JPG 한 장은 `bodySizeLimit=8mb` 로 충분. v1 에서 다건/대용량 필요 시 B 로 마이그레이션 + ADR 추가.

### D-box-2: 경로 규약 — 2-step insert/update vs. 클라 uuid 사전 생성

| 기준 | A. insert(null) → upload → update (선택) | B. 클라 uuid → upload → insert(with path) |
|------|-----------------------------------------|-----------------------------------------|
| 고아 row | 업로드 실패 시 `photo_path=null` 로 남음 — `action_logged.photoAttached=false` 로 관찰 | insert 실패 시 Storage 에 orphan 파일 |
| path 의 2번째 seg | `action_logs.id` (FK 자연 확보) | 클라 임의 uuid — id 와 무관 |
| 쿼리 수 | 3 | 2 |

**선택: A**. Storage orphan 불가능 + path 의 2번째 segment 가 `action_logs.id` → 감사 단순.

### D-box-3: signed URL TTL

| 기준 | 5 분 | **10 분 (선택)** | 1 시간 |
|------|-----|----------------|------|
| 피드 스크롤 중 만료 | 위험 | 거의 없음 | 없음 |
| 링크 유출 리스크 | 최소 | 낮음 | 중간 |

**선택: 10 분**. PRD §7 피드 평균 세션 < 3 분. 초과 시 RSC 재렌더로 자연 재발급.

### D-box-4: HEIC 처리

iOS Safari 는 `<input capture>` 로 얻은 파일 Content-Type 을 `image/heic` / `image/heif` / 드물게 공란.

- **v1 정책**: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` 5 종 허용. 빈 Content-Type 이면 **확장자 fallback** (`.heic/.heif/.jpg/.jpeg/.png/.webp`). 파일 내용 magic-byte 검사는 하지 않음 (POC 범위 초과).
- bucket policy `allowed_mime_types` 도 같은 5 종.

### D-box-5: `al_update_self_5min` vs. 2-step 업로드 충돌

기존 policy ([0002_rls.sql:157-160](supabase/migrations/0002_rls.sql#L157-L160)) 는 owner 가 5 분 이내에만 update 허용. 2-step 플로우에서 업로드가 지연되면 `photo_path` update 가 RLS 에 막힌다. **해결 3 안**:

| 안 | 평가 |
|----|------|
| A. 서버측 update 를 admin client 로 수행 | admin bypass — RLS 경계 무력화. 보안 리뷰 강력 거부. |
| B. `al_update_self_5min` 의 5 min 을 10 min 으로 완화 | AC 변경 · PRD §X.X 수정 · 다른 이해관계자 승인 필요. 본 plan 범위 초과. |
| **C. SECURITY DEFINER RPC `update_action_log_photo_path(p_log_id uuid, p_photo_path text)` (선택)** | RPC 내부에서 `auth.uid() = a.user_id` 직접 확인 + `photo_path` 컬럼만 수정. RLS 우회하되 권한 경계 복원. D-017 의 `sign_and_maybe_activate` 와 동일 패턴. |

**선택: C**. 기존 RLS 정책 유지 + RPC 한 개 추가로 2-step 완결. RPC 가 `photo_path` **만** 수정하도록 타 컬럼 불변성을 SQL 안에서 강제.

---

## 1. File Structure

### 1.1 DB (2 마이그레이션)

- Create: `supabase/migrations/0010_action_logs_photo_path.sql` — `alter table public.action_logs rename column photo_url to photo_path` + `alter column photo_path drop not null` + CHECK (`char_length(photo_path) between 10 and 512`). rename 은 값 보존 — `https://example.com/...` 텍스트도 그대로 남아 기존 피드가 깨지지 않음(Task 8 에서 path 처럼 생긴 값만 signed URL 로 변환하도록 방어).
- Create: `supabase/migrations/0011_storage_action_photos.sql` — bucket insert + `storage.objects` RLS 4 policy + `truncate_test_data` 덮어쓰기 (test user 소유 오브젝트 삭제 블록 추가) + `update_action_log_photo_path` RPC (D-box-5).

### 1.2 앱 설정

- Modify: `next.config.ts` — `experimental.serverActions.bodySizeLimit = "8mb"`.

### 1.3 validator + analytics

- Modify: `src/lib/validators/action-log.ts` — `photoUrl: z.string().url()` 제거. 2 스키마 분할:
  - `actionLogInputSchema` (텍스트 필드만): `challengeId · activityType · selectedKeywords · shownKeywords · rerollCount · memo`.
  - `photoMetaSchema`: `{ mime: z.enum([...5종]), sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024) }`.
- Modify: `src/lib/validators/action-log.spec.ts` — 케이스 갱신.
- Modify: `src/lib/analytics/schema.ts` — `action_logged.props` 에 `photoAttached: z.boolean()` 추가.
- Modify: `src/lib/analytics/track.ts` — TS union 동기화.
- Modify: `src/lib/analytics/schema.spec.ts` · `src/lib/analytics/schema-union-parity.spec.ts` — 기대값 갱신.

### 1.4 Server helper

- Create: `src/lib/storage/action-photos.ts` — `import "server-only"`. Export:
  - `uploadPhoto(opts: { userId; challengeId; actionLogId; file; client? })`
  - `getPhotoSignedUrl(path: string, client?: SupabaseClient): Promise<string | null>`
  - `deletePhoto(userId: string, path: string, client?: SupabaseClient): Promise<void>` — 테스트용.
  - `buildPhotoPath({ userId, challengeId, actionLogId, ext })` — pure helper.
- Create: `src/lib/storage/action-photos.spec.ts`.

### 1.5 Server Action

- Modify: `src/app/(app)/action/_actions.ts` — signature 를 `(formData: FormData)` 로 변경. 내부에서 `parseFormData()` → `actionLogInputSchema` → logs.insert(photo_path=null) → uploadPhoto → RPC update → track(photoAttached).
- Modify: `src/app/(app)/action/_actions.spec.ts` — FormData 경로. uploadPhoto mock.

### 1.6 Client UI

- Modify: `src/app/(app)/action/_components/action-form.tsx` — `<input type="file" accept="image/*" capture="environment">` + blob URL 프리뷰 + 파일 제거 버튼 + 제출 시 FormData 구성. `photoUrl` 리터럴 제거.
- Create: `src/app/(app)/action/_components/action-form.spec.tsx`.

### 1.7 Read layer

- Modify: `src/lib/db/reads/challenge-feed.ts` — select 를 `photo_url` → `photo_path`. `FeedItemView` 에 `photoUrl` 제거, `photoSignedUrl: string | null` 추가. 각 행에 대해 `getPhotoSignedUrl` 를 `Promise.all` 로 병렬 발급 (실패 행 null).

### 1.8 Display

- Modify: `src/app/(app)/challenge/[id]/_components/feed-card.tsx` — props `photoUrl: string` → `photoSignedUrl: string | null`. null 이면 gradient placeholder.
- Modify: `src/app/(app)/challenge/[id]/_components/challenge-feed.tsx` — prop drilling (`photoUrl` → `photoSignedUrl`) + spec.

### 1.9 Tests

- Create: `tests/fixtures/pixel.jpg` — 1×1 JPEG (< 500 bytes).
- Create: `tests/integration/storage/upload-rls.spec.ts` — RLS 3-case matrix.
- Create: `tests/integration/storage/two-step-window.spec.ts` — 5 분 창 회귀.
- Create: `tests/integration/actions/submit-action-log-photo.spec.ts` — FormData end-to-end.
- Modify: `tests/integration/reads/challenge-feed.spec.ts` — `photoSignedUrl` 단일 assertion 추가.
- Create: `tests/e2e/action-photo-upload.spec.ts`.

### 1.10 문서

- Modify: `docs/ONBOARDING.md` §6.1 — Storage 실 wiring 구체화 추가.
- Modify: `docs/TEAM_SHARE_DECISIONS.md` — D-018 append.
- Modify: `docs/JOURNAL.md` — "남긴 부채" 에서 B4 제거 + 새 항목 기록.

---

## 2. Tasks

### Task 1: `action_logs.photo_url` → `photo_path` 마이그레이션

> **근거**: Storage path(`uuid/uuid/uuid-nonce.jpg`) 를 저장하려면 (1) 컬럼명이 의미와 맞아야 하고 (2) 업로드 실패 폴백을 위해 `not null` 해제 필요. rename 은 값 보존 — `https://example.com/...` row 는 그대로 남고 Task 8 이 signed URL 로 변환하지 않도록 방어.

**Files:**
- Create: `supabase/migrations/0010_action_logs_photo_path.sql`
- Modify: `src/types/supabase.ts` (자동 생성)

- [ ] **Step 1: migration 파일 작성**

Create `supabase/migrations/0010_action_logs_photo_path.sql`:

```sql
-- 0010_action_logs_photo_path.sql — photo_url → photo_path 의미 전환.
-- D-018: Storage path 저장, 업로드 실패 폴백 허용.

alter table public.action_logs
  rename column photo_url to photo_path;

alter table public.action_logs
  alter column photo_path drop not null;

alter table public.action_logs
  add constraint action_logs_photo_path_len_chk
  check (photo_path is null or char_length(photo_path) between 10 and 512);

comment on column public.action_logs.photo_path is
  'Storage object path "{userId}/{challengeId}/{actionLogId}-{nonce}.{ext}". NULL = 사진 없이 제출. 기존 https://example.com/... 값은 legacy.';
```

- [ ] **Step 2: 로컬 reset + 타입 재생성**

Run: `pnpm db:reset && pnpm db:types`
Expected: `src/types/supabase.ts` 의 `action_logs.Row` 에 `photo_path: string | null` 필드.

- [ ] **Step 3: 회귀 테스트 작성**

Create `tests/integration/migrations/action-log-photo-path.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { admin } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";

async function seedActive() {
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
      end_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .eq("id", c.id);
  return { ownerId: owner.id, challengeId: c.id };
}

describe("action_logs.photo_path", () => {
  it("accepts null", async () => {
    const { ownerId, challengeId } = await seedActive();
    const { error } = await admin.from("action_logs").insert({
      challenge_id: challengeId,
      user_id: ownerId,
      activity_type: "gym",
      photo_path: null,
      selected_keywords: ["집중"],
      shown_keywords: ["집중"],
      reroll_count: 0,
      ai_summary: "ok",
      prompt_version: "v1",
    });
    expect(error).toBeNull();
  });

  it("rejects too-short path via CHECK", async () => {
    const { ownerId, challengeId } = await seedActive();
    const { error } = await admin.from("action_logs").insert({
      challenge_id: challengeId,
      user_id: ownerId,
      activity_type: "gym",
      photo_path: "short",
      selected_keywords: ["집중"],
      shown_keywords: ["집중"],
      reroll_count: 0,
      ai_summary: "ok",
      prompt_version: "v1",
    });
    expect(error?.code).toBe("23514");
  });
});
```

- [ ] **Step 4: 실행**

Run: `pnpm test:integration tests/integration/migrations/action-log-photo-path.spec.ts`
Expected: 2 pass.

- [ ] **Step 5: 기존 코드 drift 컴파일 확인**

Run: `pnpm typecheck`
Expected: **실패**. `src/lib/db/reads/challenge-feed.ts` · `src/app/(app)/action/_actions.ts` 가 `photo_url` 참조. Task 5/6/8 에서 순차 교체. 이 Task 커밋 시 `// TODO(0010): photo_url→photo_path after Task 5/6/8 merge` 주석을 drift 위치에 붙여두지 않음 — 대신 본 plan 은 **Task 1 커밋이 typecheck 를 깨는 것을 명시적으로 허용**하고, Task 8 머지까지 "PR-A 내부에서만" 깨진 상태를 유지. PR-A 를 일괄 머지하는 것을 전제.

> **주의**: PR 분할 제약. PR-A 가 "Task 1 + Task 2 + Task 10(부분)" 이라 typecheck 깨진 채 머지되지 않도록, **Task 1 은 Task 8 (fetchChallengeFeed) 까지 같은 브랜치에 쌓아서 마지막에 `pnpm typecheck` green 으로 PR 올린다**. 중간 커밋은 깨져도 OK.

- [ ] **Step 6: database-reviewer 호출 + commit**

- [ ] database-reviewer 호출 (rename 영향 · CHECK 범위)
- [ ] Commit

```bash
git add supabase/migrations/0010_action_logs_photo_path.sql src/types/supabase.ts \
        tests/integration/migrations/action-log-photo-path.spec.ts
git commit -m "feat(db): rename action_logs.photo_url → photo_path + drop not null"
```

---

### Task 2: Storage bucket + RLS + update-path RPC + truncate 확장

> **근거**: 버킷 생성 · RLS 4 정책 · 5 분 update 창 우회 RPC · CI 안전성(`truncate_test_data` 확장) 을 한 마이그레이션에 묶는다. 분리하면 bucket 만 있고 RLS 없는 과도기가 생김.

**Files:**
- Create: `supabase/migrations/0011_storage_action_photos.sql`
- Create: `tests/integration/migrations/storage-action-photos.spec.ts`

- [ ] **Step 1: migration 파일 작성**

Create `supabase/migrations/0011_storage_action_photos.sql`:

```sql
-- 0011_storage_action_photos.sql — action-photos private bucket + RLS + path update RPC.

-- ============================================================
-- 1. bucket
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'action-photos',
  'action-photos',
  false,
  5 * 1024 * 1024,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- 2. RLS policies on storage.objects (bucket='action-photos')
--    path: {userId}/{challengeId}/{actionLogId}-{nonce}.{ext}
-- ============================================================

-- SELECT: 같은 그룹 멤버만. path 의 2번째 segment = challenge_id 로 해석.
drop policy if exists ap_select_group_member on storage.objects;
create policy ap_select_group_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'action-photos'
    and exists (
      select 1
      from public.challenges c
      where c.id::text = (storage.foldername(name))[2]
        and public.is_group_member(c.group_id)
    )
  );

-- INSERT: 본인 폴더만.
drop policy if exists ap_insert_self on storage.objects;
create policy ap_insert_self on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'action-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- UPDATE: 전면 차단 (policy 없음 = deny). 파일 내용 수정 금지.

-- DELETE: 본인 오브젝트만.
drop policy if exists ap_delete_self on storage.objects;
create policy ap_delete_self on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'action-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 3. update_action_log_photo_path RPC (D-box-5)
--    2-step 업로드에서 5 min RLS 창을 우회하되 owner 확인 명시.
--    photo_path 컬럼만 수정. 기타 컬럼 불변.
-- ============================================================
create or replace function public.update_action_log_photo_path(
  p_log_id uuid,
  p_photo_path text
)
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.action_logs where id = p_log_id;
  if v_owner is null then
    raise exception 'action_log not found' using errcode = 'P0002';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'not owner' using errcode = '42501';
  end if;
  if p_photo_path is not null and char_length(p_photo_path) not between 10 and 512 then
    raise exception 'invalid photo_path length' using errcode = '22023';
  end if;

  update public.action_logs
    set photo_path = p_photo_path
    where id = p_log_id;
end;
$$;

revoke all on function public.update_action_log_photo_path(uuid, text) from public, anon;
grant execute on function public.update_action_log_photo_path(uuid, text) to authenticated, service_role;

-- ============================================================
-- 4. truncate_test_data 확장 — test user 소유 오브젝트 삭제
-- ============================================================
create or replace function public.truncate_test_data()
returns void
language plpgsql security definer
set search_path = public, storage as $$
declare
  v_test_user_ids uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[]) into v_test_user_ids
    from auth.users where email like '%@test.local';

  if array_length(v_test_user_ids, 1) is null then
    return;
  end if;

  -- Storage 오브젝트: path 1번째 segment 가 test user id 인 것 삭제.
  delete from storage.objects
    where bucket_id = 'action-photos'
      and (storage.foldername(name))[1] = any(
        select unnest(v_test_user_ids)::text
      );

  delete from public.kudos where user_id = any(v_test_user_ids);
  delete from public.action_logs where user_id = any(v_test_user_ids);
  delete from public.challenge_participants where user_id = any(v_test_user_ids);
  delete from public.challenges where group_id in (
    select id from public.groups where owner_id = any(v_test_user_ids)
  );
  delete from public.invites where created_by = any(v_test_user_ids);
  delete from public.group_members where user_id = any(v_test_user_ids);
  delete from public.groups where owner_id = any(v_test_user_ids);
  delete from public.push_subscriptions where user_id = any(v_test_user_ids);
  delete from public.events where user_id = any(v_test_user_ids);

  delete from auth.users where id = any(v_test_user_ids);
end;
$$;
```

- [ ] **Step 2: reset + 검증**

Run: `pnpm db:reset`
Expected: 에러 없음.

Run(확인): `pnpm exec supabase db query "select id, public, file_size_limit from storage.buckets where id='action-photos'"`
Expected: `action-photos | false | 5242880`.

- [ ] **Step 3: RLS + RPC 회귀 테스트 작성**

Create `tests/integration/migrations/storage-action-photos.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { admin, asUser } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";

async function seedActive() {
  const owner = await createUser();
  const other = await createUser();
  const stranger = await createUser();
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
      end_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .eq("id", c.id);
  return { owner, other, stranger, challengeId: c.id };
}

const tinyJpeg = () =>
  new Blob(
    [Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00])],
    { type: "image/jpeg" },
  );

describe("storage: action-photos RLS", () => {
  it("owner can insert into own folder; stranger cannot", async () => {
    const { owner, other, stranger, challengeId } = await seedActive();
    const logId = crypto.randomUUID();

    // owner insert ok — but first needs an action_logs row for the path's 2nd seg to be valid on SELECT.
    await admin.from("action_logs").insert({
      id: logId,
      challenge_id: challengeId,
      user_id: owner.id,
      activity_type: "gym",
      selected_keywords: ["집중"],
      shown_keywords: ["집중"],
      reroll_count: 0,
      ai_summary: "ok",
      prompt_version: "v1",
      photo_path: null,
    });

    const ownerClient = asUser(owner.id);
    const path = `${owner.id}/${challengeId}/${logId}-n1.jpg`;
    const uploadOwner = await ownerClient.storage
      .from("action-photos")
      .upload(path, tinyJpeg(), { contentType: "image/jpeg" });
    expect(uploadOwner.error).toBeNull();

    // stranger tries to write into owner's folder → RLS block
    const strangerClient = asUser(stranger.id);
    const strangerUpload = await strangerClient.storage
      .from("action-photos")
      .upload(`${owner.id}/${challengeId}/${logId}-n2.jpg`, tinyJpeg(), {
        contentType: "image/jpeg",
      });
    expect(strangerUpload.error).not.toBeNull();

    // group member (other) can SELECT owner's object
    const otherClient = asUser(other.id);
    const otherList = await otherClient.storage
      .from("action-photos")
      .createSignedUrl(path, 60);
    expect(otherList.data?.signedUrl).toBeTruthy();

    // non-member cannot SELECT
    const strangerSelect = await strangerClient.storage
      .from("action-photos")
      .createSignedUrl(path, 60);
    expect(strangerSelect.data?.signedUrl).toBeFalsy();
  });
});

describe("RPC update_action_log_photo_path", () => {
  it("owner can set path outside 5-min RLS window", async () => {
    const { owner, challengeId } = await seedActive();
    const logId = crypto.randomUUID();
    // created_at in the past beyond 5 min
    await admin.from("action_logs").insert({
      id: logId,
      challenge_id: challengeId,
      user_id: owner.id,
      activity_type: "gym",
      selected_keywords: ["집중"],
      shown_keywords: ["집중"],
      reroll_count: 0,
      ai_summary: "ok",
      prompt_version: "v1",
      photo_path: null,
    });
    await admin
      .from("action_logs")
      .update({ created_at: new Date(Date.now() - 10 * 60_000).toISOString() })
      .eq("id", logId);

    const ownerClient = asUser(owner.id);
    const path = `${owner.id}/${challengeId}/${logId}-n.jpg`;
    const { error } = await ownerClient.rpc("update_action_log_photo_path", {
      p_log_id: logId,
      p_photo_path: path,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from("action_logs")
      .select("photo_path")
      .eq("id", logId)
      .single();
    expect(data?.photo_path).toBe(path);
  });

  it("non-owner cannot set path via RPC", async () => {
    const { owner, stranger, challengeId } = await seedActive();
    const logId = crypto.randomUUID();
    await admin.from("action_logs").insert({
      id: logId,
      challenge_id: challengeId,
      user_id: owner.id,
      activity_type: "gym",
      selected_keywords: ["집중"],
      shown_keywords: ["집중"],
      reroll_count: 0,
      ai_summary: "ok",
      prompt_version: "v1",
      photo_path: null,
    });

    const strangerClient = asUser(stranger.id);
    const { error } = await strangerClient.rpc("update_action_log_photo_path", {
      p_log_id: logId,
      p_photo_path: `${stranger.id}/${challengeId}/${logId}-n.jpg`,
    });
    expect(error?.code).toBe("42501");
  });
});
```

- [ ] **Step 4: pass 확인**

Run: `pnpm test:integration tests/integration/migrations/storage-action-photos.spec.ts`
Expected: 3 pass.

- [ ] **Step 5: 리뷰 + commit**

- [ ] database-reviewer + security-reviewer 호출 (foldername predicate, RPC 권한 경계, truncate 스코프)
- [ ] Commit

```bash
git add supabase/migrations/0011_storage_action_photos.sql \
        tests/integration/migrations/storage-action-photos.spec.ts
git commit -m "feat(storage): action-photos private bucket + RLS + path RPC + truncate"
```

---

### Task 3: Next.js body size 상한 8MB

> **근거**: `serverActions.bodySizeLimit` 기본 1MB 라서 5MB 파일은 Server Action 진입도 못 함. 설정 1 줄.

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: 설정 추가**

Edit `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: 기존 drift 외엔 추가 에러 없음.

- [ ] **Step 3: commit**

```bash
git add next.config.ts
git commit -m "chore(next): raise serverActions.bodySizeLimit to 8mb for photo upload"
```

---

### Task 4: validator + analytics schema 확장

> **근거**: `photoUrl` 은 이제 path (optional). 파일 metadata (`photoMetaSchema`) 는 별도. analytics 는 `photoAttached: boolean` 추가 + parity spec 커버.

**Files:**
- Modify: `src/lib/validators/action-log.ts`
- Modify: `src/lib/validators/action-log.spec.ts` (없으면 Create)
- Modify: `src/lib/analytics/schema.ts`
- Modify: `src/lib/analytics/track.ts`
- Modify: `src/lib/analytics/schema.spec.ts`
- Modify: `src/lib/analytics/schema-union-parity.spec.ts`

- [ ] **Step 1: validator 테스트 작성/수정**

Create (없으면) / Modify `src/lib/validators/action-log.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { actionLogInputSchema, photoMetaSchema } from "./action-log";

describe("actionLogInputSchema (post-Storage)", () => {
  const base = {
    challengeId: "00000000-0000-0000-0000-000000000001",
    activityType: "gym" as const,
    selectedKeywords: ["집중"],
    shownKeywords: ["집중", "무산소", "펌핑"],
    rerollCount: 0,
  };

  it("accepts without photoUrl", () => {
    const res = actionLogInputSchema.safeParse(base);
    expect(res.success).toBe(true);
  });

  it("rejects extra photoUrl key", () => {
    const res = actionLogInputSchema.safeParse({
      ...base,
      photoUrl: "https://example.com/x.jpg",
    });
    // strict: extra key rejected
    expect(res.success).toBe(false);
  });
});

describe("photoMetaSchema", () => {
  it("accepts jpeg 1MB", () => {
    expect(
      photoMetaSchema.safeParse({ mime: "image/jpeg", sizeBytes: 1_000_000 }).success,
    ).toBe(true);
  });
  it("accepts heic", () => {
    expect(
      photoMetaSchema.safeParse({ mime: "image/heic", sizeBytes: 500_000 }).success,
    ).toBe(true);
  });
  it("rejects mime outside allowlist", () => {
    expect(
      photoMetaSchema.safeParse({ mime: "application/pdf", sizeBytes: 1000 }).success,
    ).toBe(false);
  });
  it("rejects > 5MB", () => {
    expect(
      photoMetaSchema.safeParse({
        mime: "image/jpeg",
        sizeBytes: 5 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: validator 구현**

Replace `src/lib/validators/action-log.ts`:

```ts
import { z } from "zod";
import { ACTIVITY_TYPES, KEYWORD_POOL } from "@/lib/keywords/pool";

const activityType = z.enum(ACTIVITY_TYPES);

export const ALLOWED_PHOTO_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export type AllowedPhotoMime = (typeof ALLOWED_PHOTO_MIME)[number];
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const actionLogInputSchema = z
  .object({
    challengeId: z.string().uuid(),
    activityType,
    selectedKeywords: z.array(z.string()).min(1).max(3),
    shownKeywords: z.array(z.string()).min(1),
    rerollCount: z.number().int().min(0).max(5),
    memo: z.string().max(100).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const pool = KEYWORD_POOL[data.activityType];
    data.selectedKeywords.forEach((kw, idx) => {
      if (!pool.includes(kw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selectedKeywords", idx],
          message: `'${kw}' is not in the ${data.activityType} pool`,
        });
      }
    });
  });

export type ActionLogInput = z.infer<typeof actionLogInputSchema>;

export const photoMetaSchema = z.object({
  mime: z.enum(ALLOWED_PHOTO_MIME),
  sizeBytes: z.number().int().min(1).max(MAX_PHOTO_BYTES),
});
export type PhotoMeta = z.infer<typeof photoMetaSchema>;
```

- [ ] **Step 3: analytics schema 확장**

Edit `src/lib/analytics/schema.ts` — `action_logged` 블록에 `photoAttached: z.boolean()` 추가:

```ts
// (기존)
  z.object({
    name: z.literal("action_logged"),
    props: z.object({
      challengeId: uuid,
      activityType,
      selectedKeywords: z.array(z.string()).min(1),
      keywordCount: z.number().int().min(1).max(3),
      hasMemo: z.boolean(),
      rerollCount: z.number().int().min(0).max(5),
      photoSize: z.number().int().min(0),
      photoAttached: z.boolean(),
    }),
  }),
```

- [ ] **Step 4: TS union 동기화**

Edit `src/lib/analytics/track.ts`:

```ts
  | {
      name: "action_logged";
      props: {
        challengeId: string;
        activityType: ActivityType;
        selectedKeywords: string[];
        keywordCount: number;
        hasMemo: boolean;
        rerollCount: number;
        photoSize: number;
        photoAttached: boolean;
      };
    }
```

- [ ] **Step 5: 기존 spec 기대값 갱신**

Edit `src/lib/analytics/schema.spec.ts` · `src/lib/analytics/schema-union-parity.spec.ts` — `action_logged` 샘플에 `photoAttached: false` (또는 true) 추가. parity spec 는 TS union 의 모든 arm 을 Zod 로 parse 해야 하므로 `action_logged` sample 이 새 필드를 포함하도록.

- [ ] **Step 6: 실행**

Run: `pnpm test src/lib/validators/ src/lib/analytics/`
Expected: 모두 pass.

- [ ] **Step 7: 리뷰 + commit**

- [ ] type-design-analyzer 호출
- [ ] Commit

```bash
git add src/lib/validators/action-log.ts src/lib/validators/action-log.spec.ts \
        src/lib/analytics/schema.ts src/lib/analytics/track.ts \
        src/lib/analytics/schema.spec.ts src/lib/analytics/schema-union-parity.spec.ts
git commit -m "feat(validator): drop photoUrl + add photoMetaSchema + analytics photoAttached"
```

---

### Task 5: Storage helper (`src/lib/storage/action-photos.ts`)

> **근거**: 업로드/서명/삭제 로직을 Server Action · Read layer 가 공유. user-scoped client 만 사용 (admin bypass 금지). path 조립은 pure helper 로 분리해 단위 테스트 가능.

**Files:**
- Create: `src/lib/storage/action-photos.ts`
- Create: `src/lib/storage/action-photos.spec.ts`

- [ ] **Step 1: 테스트 작성 (pure helper 먼저)**

Create `src/lib/storage/action-photos.spec.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildPhotoPath, extFromFile } from "./action-photos";

describe("buildPhotoPath", () => {
  it("composes {userId}/{challengeId}/{logId}-{nonce}.{ext}", () => {
    const path = buildPhotoPath({
      userId: "u-1",
      challengeId: "c-1",
      actionLogId: "l-1",
      ext: "jpg",
      nonce: "abcd",
    });
    expect(path).toBe("u-1/c-1/l-1-abcd.jpg");
  });

  it("rejects traversal in any segment", () => {
    expect(() =>
      buildPhotoPath({
        userId: "../etc",
        challengeId: "c",
        actionLogId: "l",
        ext: "jpg",
        nonce: "n",
      }),
    ).toThrow(/invalid/i);
  });

  it("rejects ext not in allowlist", () => {
    expect(() =>
      buildPhotoPath({
        userId: "u",
        challengeId: "c",
        actionLogId: "l",
        ext: "exe",
        nonce: "n",
      }),
    ).toThrow(/ext/);
  });
});

describe("extFromFile", () => {
  it("uses mime when present", () => {
    expect(
      extFromFile({ type: "image/jpeg", name: "x" } as File),
    ).toBe("jpg");
    expect(extFromFile({ type: "image/heic", name: "y" } as File)).toBe("heic");
  });

  it("falls back to extension when mime empty", () => {
    expect(extFromFile({ type: "", name: "x.HEIC" } as File)).toBe("heic");
  });

  it("rejects unknown", () => {
    expect(() => extFromFile({ type: "", name: "x.exe" } as File)).toThrow();
  });
});
```

- [ ] **Step 2: helper 구현**

Create `src/lib/storage/action-photos.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  ALLOWED_PHOTO_MIME,
  MAX_PHOTO_BYTES,
  type AllowedPhotoMime,
} from "@/lib/validators/action-log";

const BUCKET = "action-photos";
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif"] as const;
type AllowedExt = (typeof ALLOWED_EXT)[number];

const MIME_TO_EXT: Record<AllowedPhotoMime, AllowedExt> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const SEG_RE = /^[A-Za-z0-9._-]+$/;

export function buildPhotoPath(opts: {
  userId: string;
  challengeId: string;
  actionLogId: string;
  ext: string;
  nonce?: string;
}): string {
  const { userId, challengeId, actionLogId, ext } = opts;
  const nonce = opts.nonce ?? randomUUID().slice(0, 8);

  for (const seg of [userId, challengeId, actionLogId, nonce]) {
    if (!SEG_RE.test(seg)) throw new Error(`invalid segment: ${seg}`);
  }
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) {
    throw new Error(`ext not allowed: ${ext}`);
  }
  return `${userId}/${challengeId}/${actionLogId}-${nonce}.${ext}`;
}

export function extFromFile(file: Pick<File, "type" | "name">): AllowedExt {
  if (file.type && (ALLOWED_PHOTO_MIME as readonly string[]).includes(file.type)) {
    return MIME_TO_EXT[file.type as AllowedPhotoMime];
  }
  const dot = file.name.lastIndexOf(".");
  if (dot > 0) {
    const lower = file.name.slice(dot + 1).toLowerCase();
    if ((ALLOWED_EXT as readonly string[]).includes(lower)) return lower as AllowedExt;
  }
  throw new Error(`unknown file type: mime=${file.type} name=${file.name}`);
}

type UploadArgs = {
  userId: string;
  challengeId: string;
  actionLogId: string;
  file: File;
  client?: SupabaseClient;
};

export type UploadResult =
  | { ok: true; path: string }
  | { ok: false; reason: "mime" | "size" | "upload_failed" };

export async function uploadPhoto(args: UploadArgs): Promise<UploadResult> {
  const { userId, challengeId, actionLogId, file } = args;
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, reason: "size" };

  let ext: AllowedExt;
  try {
    ext = extFromFile(file);
  } catch {
    return { ok: false, reason: "mime" };
  }

  const path = buildPhotoPath({ userId, challengeId, actionLogId, ext });
  const supabase = args.client ?? (await createClient());
  const contentType = file.type || `image/${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false });

  if (error) {
    console.error("[uploadPhoto] storage error", { path, error });
    return { ok: false, reason: "upload_failed" };
  }
  return { ok: true, path };
}

export async function getPhotoSignedUrl(
  path: string,
  client?: SupabaseClient,
): Promise<string | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deletePhoto(
  userId: string,
  path: string,
  client?: SupabaseClient,
): Promise<void> {
  if (!path.startsWith(`${userId}/`)) return;
  const supabase = client ?? (await createClient());
  await supabase.storage.from(BUCKET).remove([path]);
}
```

- [ ] **Step 3: unit pass 확인**

Run: `pnpm test src/lib/storage/action-photos.spec.ts`
Expected: 7 pass.

- [ ] **Step 4: 리뷰 + commit**

- [ ] security-reviewer 호출 (path traversal, admin 미사용, `upsert:false`)
- [ ] Commit

```bash
git add src/lib/storage/action-photos.ts src/lib/storage/action-photos.spec.ts
git commit -m "feat(storage): action-photos helper (upload/sign/delete/path)"
```

---

### Task 6: `submitActionLog` FormData + 2-step insert/update

> **근거**: 기존 JSON signature 를 FormData 로. logs.insert(photo_path=null) → uploadPhoto → `update_action_log_photo_path` RPC. 업로드 실패는 row 는 남기고 `photoAttached=false`.

**Files:**
- Modify: `src/app/(app)/action/_actions.ts`
- Modify / Create: `src/app/(app)/action/_actions.spec.ts`

- [ ] **Step 1: 테스트 작성**

Create / Modify `src/app/(app)/action/_actions.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const supabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(supabase),
}));
vi.mock("@/lib/auth/with-user", () => ({ withUser: (fn: unknown) => fn }));
vi.mock("@/lib/ai/diary", () => ({
  generateDiary: vi.fn().mockResolvedValue({
    summary: "ok",
    fallback: false,
    keywordCoverage: 1,
    promptVersion: "v3",
    latencyMs: 100,
  }),
}));
const uploadPhoto = vi.fn();
vi.mock("@/lib/storage/action-photos", () => ({ uploadPhoto }));
const track = vi.fn();
vi.mock("@/lib/analytics/track", () => ({ track }));

import { submitActionLog } from "./_actions";

const user = { id: "11111111-1111-1111-1111-111111111111" } as const;
const challengeId = "22222222-2222-2222-2222-222222222222";
const logId = "33333333-3333-3333-3333-333333333333";

function stubActiveMembership() {
  const maybeSingle = vi
    .fn()
    .mockResolvedValueOnce({
      data: {
        user_id: user.id,
        challenges: {
          status: "active",
          start_at: new Date(Date.now() - 60_000).toISOString(),
          end_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
      error: null,
    })
    .mockResolvedValueOnce({ data: { display_name: "Ian" }, error: null });
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
  });
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: logId }, error: null }),
    }),
  });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "challenge_participants")
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) };
    if (table === "users") return { select: () => ({ eq: () => ({ maybeSingle }) }) };
    if (table === "action_logs") return { insert };
    return { select, insert };
  });
  supabase.from.mockImplementation(from);
  supabase.rpc.mockResolvedValue({ error: null });
}

function formData(fields: Record<string, string>, file?: File): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append("photo", file);
  return fd;
}

describe("submitActionLog (FormData)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubActiveMembership();
  });

  it("succeeds without photo (photoAttached=false, no RPC)", async () => {
    const fd = formData({
      challengeId,
      activityType: "gym",
      selectedKeywords: JSON.stringify(["집중"]),
      shownKeywords: JSON.stringify(["집중", "무산소", "펌핑"]),
      rerollCount: "0",
    });
    const res = await submitActionLog(fd);
    expect(res.ok).toBe(true);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "action_logged",
        props: expect.objectContaining({ photoAttached: false, photoSize: 0 }),
      }),
      { userId: user.id },
    );
  });

  it("uploads photo then RPC-updates photo_path", async () => {
    uploadPhoto.mockResolvedValueOnce({
      ok: true,
      path: `${user.id}/${challengeId}/${logId}-ab.jpg`,
    });
    const file = new File([new Uint8Array(1000)], "p.jpg", { type: "image/jpeg" });
    const fd = formData(
      {
        challengeId,
        activityType: "gym",
        selectedKeywords: JSON.stringify(["집중"]),
        shownKeywords: JSON.stringify(["집중", "무산소", "펌핑"]),
        rerollCount: "0",
      },
      file,
    );
    const res = await submitActionLog(fd);
    expect(res.ok).toBe(true);
    expect(uploadPhoto).toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith("update_action_log_photo_path", {
      p_log_id: logId,
      p_photo_path: `${user.id}/${challengeId}/${logId}-ab.jpg`,
    });
    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "action_logged",
        props: expect.objectContaining({ photoAttached: true, photoSize: 1000 }),
      }),
      { userId: user.id },
    );
  });

  it("upload failure: returns ok=true, photoAttached=false, no RPC", async () => {
    uploadPhoto.mockResolvedValueOnce({ ok: false, reason: "upload_failed" });
    const file = new File([new Uint8Array(100)], "p.jpg", { type: "image/jpeg" });
    const fd = formData(
      {
        challengeId,
        activityType: "gym",
        selectedKeywords: JSON.stringify(["집중"]),
        shownKeywords: JSON.stringify(["집중", "무산소", "펌핑"]),
        rerollCount: "0",
      },
      file,
    );
    const res = await submitActionLog(fd);
    expect(res.ok).toBe(true);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "action_logged",
        props: expect.objectContaining({ photoAttached: false }),
      }),
      { userId: user.id },
    );
  });
});
```

- [ ] **Step 2: 구현 재작성**

Replace `src/app/(app)/action/_actions.ts`:

```ts
"use server";

import { actionLogInputSchema, type ActionLogInput } from "@/lib/validators/action-log";
import { generateDiary } from "@/lib/ai/diary";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { uploadPhoto } from "@/lib/storage/action-photos";

type SubmitResult = { id: string; summary: string; photoAttached: boolean };

function parseForm(fd: FormData): { input: ActionLogInput; file: File | null; issues?: unknown } {
  const raw = {
    challengeId: String(fd.get("challengeId") ?? ""),
    activityType: String(fd.get("activityType") ?? ""),
    selectedKeywords: JSON.parse(String(fd.get("selectedKeywords") ?? "[]")),
    shownKeywords: JSON.parse(String(fd.get("shownKeywords") ?? "[]")),
    rerollCount: Number(fd.get("rerollCount") ?? 0),
    memo: fd.get("memo") ? String(fd.get("memo")) : undefined,
  };
  const parsed = actionLogInputSchema.safeParse(raw);
  if (!parsed.success)
    return { input: raw as ActionLogInput, file: null, issues: parsed.error };
  const rawFile = fd.get("photo");
  const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
  return { input: parsed.data, file };
}

export const submitActionLog = withUser<FormData, SubmitResult>(
  async (user, formData): Promise<ActionResult<SubmitResult>> => {
    const { input, file, issues } = parseForm(formData);
    if (issues) return validationFailure(issues as never);

    const supabase = await createClient();

    const { data: membership, error: mErr } = await supabase
      .from("challenge_participants")
      .select("user_id, challenges!inner(status, start_at, end_at)")
      .eq("challenge_id", input.challengeId)
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

    const { data: profile } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const diary = await generateDiary(
      {
        activityType: input.activityType,
        keywords: input.selectedKeywords,
        memo: input.memo,
      },
      { displayName: profile?.display_name ?? undefined },
    );

    // Step 1: insert with photo_path=null.
    const { data, error } = await supabase
      .from("action_logs")
      .insert({
        challenge_id: input.challengeId,
        user_id: user.id,
        activity_type: input.activityType,
        photo_path: null,
        selected_keywords: input.selectedKeywords,
        shown_keywords: input.shownKeywords,
        reroll_count: input.rerollCount,
        memo: input.memo ?? null,
        ai_summary: diary.summary,
        template_fallback: diary.fallback,
        prompt_version: diary.promptVersion,
      })
      .select("id")
      .single();

    if (error) return failure(mapSupabaseError(error));
    if (!data) return failure("upstream_error");

    // Step 2: upload + RPC update. 실패는 비파괴 폴백.
    let photoAttached = false;
    let photoSize = 0;
    if (file) {
      photoSize = file.size;
      const upload = await uploadPhoto({
        userId: user.id,
        challengeId: input.challengeId,
        actionLogId: data.id,
        file,
        client: supabase,
      });
      if (upload.ok) {
        const { error: rpcErr } = await supabase.rpc("update_action_log_photo_path", {
          p_log_id: data.id,
          p_photo_path: upload.path,
        });
        if (rpcErr) {
          console.error("[submitActionLog] RPC update_photo_path failed", rpcErr);
        } else {
          photoAttached = true;
        }
      } else {
        console.warn("[submitActionLog] uploadPhoto failed", {
          reason: upload.reason,
          logId: data.id,
        });
      }
    }

    void track(
      {
        name: "action_logged",
        props: {
          challengeId: input.challengeId,
          activityType: input.activityType,
          selectedKeywords: input.selectedKeywords,
          keywordCount: input.selectedKeywords.length,
          hasMemo: Boolean(input.memo),
          rerollCount: input.rerollCount,
          photoSize,
          photoAttached,
        },
      },
      { userId: user.id },
    );

    void track(
      {
        name: "ai_generated",
        props: {
          actionLogId: data.id,
          latencyMs: diary.latencyMs,
          fallback: diary.fallback,
          keywordCoverage: diary.keywordCoverage,
          promptVersion: diary.promptVersion,
        },
      },
      { userId: user.id },
    );

    return success({ id: data.id, summary: diary.summary, photoAttached });
  },
);
```

- [ ] **Step 3: unit pass**

Run: `pnpm test src/app/\(app\)/action/_actions.spec.ts`
Expected: 3 pass.

- [ ] **Step 4: 리뷰 + commit**

- [ ] /code-review + silent-failure-hunter 호출 (RPC 실패 swallow 의 의도성, photoAttached race)
- [ ] Commit

```bash
git add src/app/\(app\)/action/_actions.ts src/app/\(app\)/action/_actions.spec.ts
git commit -m "feat(action): submitActionLog accepts FormData + 2-step upload via RPC"
```

---

### Task 7: ActionForm file input + 프리뷰

> **근거**: 제출 시 FormData 구성. 파일 선택 · 프리뷰 blob URL · 제거 버튼 · pending 중 재제출 차단 · blob URL revoke.

**Files:**
- Modify: `src/app/(app)/action/_components/action-form.tsx`
- Create: `src/app/(app)/action/_components/action-form.spec.tsx`

- [ ] **Step 1: 테스트 작성**

Create `src/app/(app)/action/_components/action-form.spec.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionForm } from "./action-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const submit = vi.fn().mockResolvedValue({ ok: true, data: { id: "l1", photoAttached: true } });
vi.mock("../_actions", () => ({ submitActionLog: submit }));

describe("ActionForm file input", () => {
  beforeEach(() => {
    submit.mockClear();
    URL.createObjectURL = vi.fn().mockReturnValue("blob:preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows file preview after selecting", () => {
    render(<ActionForm challengeId="c1" />);
    const input = screen.getByLabelText(/사진/i, { selector: 'input[type="file"]' });
    const file = new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByAltText(/사진 미리보기/)).toBeVisible();
  });

  it("remove button clears preview and calls revokeObjectURL", () => {
    render(<ActionForm challengeId="c1" />);
    const input = screen.getByLabelText(/사진/i, { selector: 'input[type="file"]' });
    const file = new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /사진 제거/ }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(screen.queryByAltText(/사진 미리보기/)).not.toBeInTheDocument();
  });

  it("submits FormData when user clicks submit", async () => {
    render(<ActionForm challengeId="c1" />);
    // Select keyword first to enable submit
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    const input = screen.getByLabelText(/사진/i, { selector: 'input[type="file"]' });
    const file = new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /인증하기/ }));
    await vi.waitFor(() => expect(submit).toHaveBeenCalled());
    const fd = submit.mock.calls[0][0] as FormData;
    expect(fd.get("challengeId")).toBe("c1");
    expect(fd.get("photo")).toBeInstanceOf(File);
  });
});
```

> **주의**: KeywordChipGroup 의 실제 role 이 checkbox 가 아니면 쿼리 조정. 현재 코드 조회 시 `role="checkbox"` 아니면 `button` 일 가능성 — 구현 전에 확인 후 테스트 selector 보정.

- [ ] **Step 2: 구현 교체**

Replace `src/app/(app)/action/_components/action-form.tsx` — 기존 구조 유지 + file input 섹션 + submit 을 FormData 로:

```tsx
"use client";

import { useId, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/keywords/pool";
import { initialShuffle, reroll, type ShuffleState } from "@/lib/keywords/shuffle";
import { cn } from "@/lib/utils";
import { KeywordChipGroup } from "./keyword-chip-group";
import { RerollButton } from "./reroll-button";
import { submitActionLog } from "../_actions";
import {
  ALLOWED_PHOTO_MIME,
  MAX_PHOTO_BYTES,
} from "@/lib/validators/action-log";

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  running: "🏃 러닝",
  gym: "🏋️ 헬스",
  yoga: "🧘 요가",
  other: "✨ 기타",
};

const userMessage = makeUserMessage({
  not_found: "현재 참여 중인 챌린지를 찾을 수 없어요.",
  forbidden: "지금은 인증할 수 있는 기간이 아니에요.",
});

type Props = { challengeId: string };

export function ActionForm({ challengeId }: Props) {
  const router = useRouter();
  const fileInputId = useId();
  const [pending, startTransition] = useTransition();
  const [activityType, setActivityType] = useState<ActivityType>("gym");
  const [shuffle, setShuffle] = useState<ShuffleState>(() => initialShuffle("gym"));
  const [selected, setSelected] = useState<string[]>([]);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function switchActivity(next: ActivityType) {
    setActivityType(next);
    setShuffle(initialShuffle(next));
    setSelected([]);
  }

  function handleFile(selected: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    if (!selected) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (selected.size > MAX_PHOTO_BYTES) {
      toast.error("사진은 5MB 이하만 올릴 수 있어요.");
      return;
    }
    if (
      selected.type &&
      !(ALLOWED_PHOTO_MIME as readonly string[]).includes(selected.type)
    ) {
      // 빈 Content-Type 은 허용 (iOS HEIC fallback)
      toast.error("지원하지 않는 이미지 형식이에요.");
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  function submit() {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("challengeId", challengeId);
        fd.append("activityType", activityType);
        fd.append("selectedKeywords", JSON.stringify(selected));
        fd.append("shownKeywords", JSON.stringify(shuffle.shown));
        fd.append("rerollCount", String(shuffle.rerollCount));
        if (memoOpen && memo) fd.append("memo", memo);
        if (file) fd.append("photo", file);

        const res = await submitActionLog(fd);
        if (!res.ok) {
          const firstField = res.issues
            ? Object.values(res.issues).flat().filter(Boolean)[0]
            : undefined;
          toast.error(firstField ?? userMessage(res.error));
          if (res.error === "unauthorized") router.push("/login");
          return;
        }
        if (!res.data?.id) {
          console.error("[submitActionLog] ok=true but missing data.id", res);
          toast.error(FALLBACK_ERROR_MESSAGE);
          return;
        }
        toast.success(
          res.data.photoAttached ? "인증 완료!" : "사진 없이 인증됐어요",
        );
        router.push("/home");
      } catch (err) {
        console.error("[submitActionLog] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">운동 종류</legend>
        <div role="radiogroup" aria-label="운동 종류" className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map((t) => {
            const checked = activityType === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => switchActivity(t)}
                className={cn(
                  "min-h-12 flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-colors",
                  "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  checked
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {ACTIVITY_LABELS[t]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <section className="flex flex-col gap-2" aria-labelledby="photo-heading">
        <h2 id="photo-heading" className="text-sm font-semibold">
          사진
        </h2>
        <label
          htmlFor={fileInputId}
          className="text-muted-foreground bg-muted inline-flex min-h-12 items-center justify-center rounded-xl border px-4 text-sm font-semibold"
        >
          {file ? "사진 바꾸기" : "📷 사진 선택"}
        </label>
        <input
          id={fileInputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
          capture="environment"
          className="sr-only"
          aria-label="사진 선택"
          disabled={pending}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        {preview && (
          <div className="flex flex-col gap-2">
            <div className="relative aspect-square w-full overflow-hidden rounded-xl">
              {/* blob URL — next/image 불필요 */}
              <img
                src={preview}
                alt="사진 미리보기"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => handleFile(null)}
              className="text-muted-foreground text-xs underline-offset-4 hover:underline"
            >
              사진 제거
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="keyword-heading">
        <div className="flex items-center justify-between">
          <h2 id="keyword-heading" className="text-sm font-semibold">
            키워드 <span className="text-muted-foreground tabular-nums">({selected.length}/3)</span>
          </h2>
          <RerollButton
            rerollCount={shuffle.rerollCount}
            onClick={() => setShuffle(reroll(shuffle))}
          />
        </div>
        <KeywordChipGroup shown={shuffle.shown} selected={selected} onChange={setSelected} />
      </section>

      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setMemoOpen((v) => !v)}
          className="text-muted-foreground focus-visible:ring-ring rounded text-left text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-expanded={memoOpen}
          aria-controls="action-memo"
        >
          {memoOpen ? "✏️ 메모 접기" : "✏️ 직접 쓰고 싶어요"}
        </button>
        {memoOpen && (
          <textarea
            id="action-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value.slice(0, 100))}
            placeholder="자유롭게 남겨도 돼요 (0~100자)"
            className="focus-visible:ring-ring min-h-24 rounded-xl border p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            maxLength={100}
          />
        )}
      </section>

      <Button
        size="lg"
        className="h-12"
        disabled={selected.length === 0 || pending}
        onClick={submit}
      >
        {pending ? "일기 쓰는 중..." : "인증하기"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: test pass**

Run: `pnpm test src/app/\(app\)/action/_components/action-form.spec.tsx`
Expected: 3 pass (KeywordChipGroup role 에 맞춰 조정 후).

- [ ] **Step 4: 로컬 수동 확인**

Run: `pnpm dev`
Browse: `/action` (활성 챌린지 있는 시드 유저로 로그인 후)
Expected: 파일 선택 → 프리뷰 · 제거 버튼 · 제출 시 "인증 완료!" 토스트.

- [ ] **Step 5: 리뷰 + commit**

- [ ] a11y-architect + /code-review 호출 (label 연결, blob revoke, pending 재진입)
- [ ] Commit

```bash
git add src/app/\(app\)/action/_components/action-form.tsx \
        src/app/\(app\)/action/_components/action-form.spec.tsx
git commit -m "feat(action): file input + preview + FormData submit"
```

---

### Task 8: `fetchChallengeFeed` 에 signed URL 주입

> **근거**: 피드 행마다 path → signed URL 변환. `Promise.all` 병렬 · 실패 null degrade. 기존 `https://example.com/...` row (legacy) 는 URL 처럼 보이므로 path 가 아니면 그대로 내리지 않고 null 로 처리(안전 기본값).

**Files:**
- Modify: `src/lib/db/reads/challenge-feed.ts`
- Modify: `tests/integration/reads/challenge-feed.spec.ts` — `photoSignedUrl` assertion 추가

- [ ] **Step 1: 구현**

Replace `src/lib/db/reads/challenge-feed.ts` select + mapping:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";
import { getPhotoSignedUrl } from "@/lib/storage/action-photos";

export type FeedItemView = {
  id: string;
  authorId: string;
  authorName: string;
  photoSignedUrl: string | null;
  summary: string;
  keywords: ReadonlyArray<string>;
  kudosByEmoji: Readonly<Record<KudosEmoji, number>>;
  viewerKudos: ReadonlyArray<KudosEmoji>;
  createdAt: string;
};

type Options = { client?: SupabaseClient };

type FeedRow = {
  id: string;
  user_id: string;
  photo_path: string | null;
  ai_summary: string;
  selected_keywords: string[] | null;
  created_at: string;
  users: { display_name: string | null } | Array<{ display_name: string | null }> | null;
  kudos: Array<{ user_id: string; emoji: string }> | null;
};

function emptyKudosByEmoji(): Record<KudosEmoji, number> {
  return Object.fromEntries(KUDOS_EMOJIS.map((e) => [e, 0])) as Record<KudosEmoji, number>;
}
function isKudosEmoji(v: string): v is KudosEmoji {
  return KUDOS_EMOJIS.includes(v as KudosEmoji);
}
function looksLikeStoragePath(v: string | null): v is string {
  if (!v) return false;
  // legacy 값 ("https://example.com/...") 또는 URL 은 path 로 취급 금지.
  if (v.includes("://")) return false;
  return /^[^/]+\/[^/]+\/[^/]+/.test(v);
}

export async function fetchChallengeFeed(
  challengeId: string,
  viewerId: string,
  options: Options = {},
): Promise<FeedItemView[]> {
  const supabase = options.client ?? (await createClient());

  const { data, error } = await supabase
    .from("action_logs")
    .select(
      [
        "id",
        "user_id",
        "photo_path",
        "ai_summary",
        "selected_keywords",
        "created_at",
        "users!inner(display_name)",
        "kudos(user_id, emoji)",
      ].join(","),
    )
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  const rows = data as unknown as FeedRow[];

  const signedUrls = await Promise.all(
    rows.map((r) =>
      looksLikeStoragePath(r.photo_path)
        ? getPhotoSignedUrl(r.photo_path, supabase)
        : Promise.resolve(null),
    ),
  );

  return rows.map((row, idx) => {
    const author = Array.isArray(row.users) ? row.users[0] : row.users;
    const kudosByEmoji = emptyKudosByEmoji();
    const viewerKudos: KudosEmoji[] = [];
    for (const k of row.kudos ?? []) {
      if (!isKudosEmoji(k.emoji)) continue;
      kudosByEmoji[k.emoji] += 1;
      if (k.user_id === viewerId) viewerKudos.push(k.emoji);
    }
    return {
      id: row.id,
      authorId: row.user_id,
      authorName: author?.display_name ?? "익명",
      photoSignedUrl: signedUrls[idx],
      summary: row.ai_summary,
      keywords: row.selected_keywords ?? [],
      kudosByEmoji,
      viewerKudos,
      createdAt: row.created_at,
    };
  });
}
```

- [ ] **Step 2: integration 테스트 보강**

Edit `tests/integration/reads/challenge-feed.spec.ts` — 이미 있는 seed 에 photo 업로드 1 건 추가 + assertion:

```ts
// seed 업로드 추가
const ownerClient = asUser(ownerId);
const path = `${ownerId}/${challengeId}/${logId}-ff.jpg`;
await ownerClient.storage
  .from("action-photos")
  .upload(path, new Blob([new Uint8Array(10)], { type: "image/jpeg" }), {
    contentType: "image/jpeg",
  });
await admin
  .from("action_logs")
  .update({ photo_path: path })
  .eq("id", logId);

const feed = await fetchChallengeFeed(challengeId, otherId, { client: otherClient });
expect(feed[0].photoSignedUrl).toMatch(/^https?:\/\//);
```

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: green (FeedCard/ChallengeFeed 가 아직 `photoUrl` 참조면 Task 9 에서 해결 — 이 시점에서는 아직 drift 가능. PR 단위 green 확인은 Task 9 이후).

- [ ] **Step 4: 리뷰 + commit**

- [ ] /code-review 호출
- [ ] Commit

```bash
git add src/lib/db/reads/challenge-feed.ts tests/integration/reads/challenge-feed.spec.ts
git commit -m "feat(reads): fetchChallengeFeed emits photoSignedUrl via Storage"
```

---

### Task 9: FeedCard + ChallengeFeed props 교체

> **근거**: 소비자 업데이트. `photoSignedUrl: string | null` 수신, null 이면 placeholder gradient. next/image `unoptimized` 유지.

**Files:**
- Modify: `src/app/(app)/challenge/[id]/_components/feed-card.tsx`
- Modify: `src/app/(app)/challenge/[id]/_components/challenge-feed.tsx`
- Modify: `src/app/(app)/challenge/[id]/_components/challenge-feed.spec.tsx` (있는 경우)

- [ ] **Step 1: FeedCard 수정**

Edit `src/app/(app)/challenge/[id]/_components/feed-card.tsx`:

```tsx
"use client";

import Image from "next/image";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

type Props = {
  authorName: string;
  photoSignedUrl: string | null;
  summary: string;
  keywords: ReadonlyArray<string>;
  kudosByEmoji: Readonly<Partial<Record<KudosEmoji, number>>>;
  onKudos: (emoji: KudosEmoji) => void;
  disabled?: boolean;
};

export function FeedCard({
  authorName,
  photoSignedUrl,
  summary,
  keywords,
  kudosByEmoji,
  onKudos,
  disabled = false,
}: Props) {
  return (
    <article className="bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <header className="flex items-center gap-2">
        <span className="font-semibold">{authorName}</span>
      </header>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl">
        {photoSignedUrl ? (
          <Image
            src={photoSignedUrl}
            alt={`${authorName}의 인증 사진`}
            fill
            sizes="(max-width: 640px) 100vw, 640px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-muted to-muted/60"
          />
        )}
      </div>
      <p className="text-sm leading-relaxed break-keep">{summary}</p>
      <ul className="text-muted-foreground flex flex-wrap gap-1.5 text-xs">
        {keywords.map((k) => (
          <li key={k} className="bg-muted rounded-full px-2 py-0.5">
            #{k}
          </li>
        ))}
      </ul>
      <footer className="flex gap-2">
        {KUDOS_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onKudos(e)}
            disabled={disabled}
            aria-label={`${e} 응원 (${kudosByEmoji[e] ?? 0}개)`}
            className="bg-muted hover:bg-muted/80 focus-visible:ring-ring flex items-center gap-1 rounded-full px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">{e}</span>
            <span className="tabular-nums">{kudosByEmoji[e] ?? 0}</span>
          </button>
        ))}
      </footer>
    </article>
  );
}
```

- [ ] **Step 2: ChallengeFeed prop drilling 교체**

Edit `src/app/(app)/challenge/[id]/_components/challenge-feed.tsx` — `photoUrl` 참조를 전부 `photoSignedUrl` 로. 타입도 `string | null`.

- [ ] **Step 3: 기존 spec 갱신**

Edit (있으면) `challenge-feed.spec.tsx` — mock 데이터의 `photoUrl` 키를 `photoSignedUrl: null | "https://.../signed"` 로.

- [ ] **Step 4: typecheck + 전체 pass**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green. 여기가 PR-B 의 green 지점.

- [ ] **Step 5: 리뷰 + commit**

- [ ] a11y-architect 호출 (alt, placeholder aspect-square 유지)
- [ ] Commit

```bash
git add src/app/\(app\)/challenge/\[id\]/_components/feed-card.tsx \
        src/app/\(app\)/challenge/\[id\]/_components/challenge-feed.tsx \
        src/app/\(app\)/challenge/\[id\]/_components/challenge-feed.spec.tsx
git commit -m "feat(feed): FeedCard + ChallengeFeed consume photoSignedUrl"
```

---

### Task 10: Integration — RLS 3-case + upload 성공/실패 + 5 min 창

> **근거**: Server Action end-to-end 가 실 DB · 실 Storage 와 함께 돌아가는지 확인. 5 min 창 회귀는 RPC 가 실제로 지연 update 를 허용하는지.

**Files:**
- Create: `tests/integration/actions/submit-action-log-photo.spec.ts`
- Create: `tests/integration/storage/two-step-window.spec.ts`
- Create: `tests/fixtures/pixel.jpg`

- [ ] **Step 1: fixture 생성**

Run:

```bash
node -e "const fs=require('fs');const b=Buffer.from([0xff,0xd8,0xff,0xdb,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,0x09,0x08,0x0a,0x0c,0x14,0x0d,0x0c,0x0b,0x0b,0x0c,0x19,0x12,0x13,0x0f,0x14,0x1d,0x1a,0x1f,0x1e,0x1d,0x1a,0x1c,0x1c,0x20,0x24,0x2e,0x27,0x20,0x22,0x2c,0x23,0x1c,0x1c,0x28,0x37,0x29,0x2c,0x30,0x31,0x34,0x34,0x34,0x1f,0x27,0x39,0x3d,0x38,0x32,0x3c,0x2e,0x33,0x34,0x32,0xff,0xd9]);fs.mkdirSync('tests/fixtures',{recursive:true});fs.writeFileSync('tests/fixtures/pixel.jpg',b);"
```
Expected: `tests/fixtures/pixel.jpg` 생성 (~70 bytes).

- [ ] **Step 2: submit-action-log-photo 통합 테스트**

Create `tests/integration/actions/submit-action-log-photo.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { path as fxPath } from "node:path";
import { admin, asUser, setSessionCookies } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";
import { submitActionLog } from "@/app/(app)/action/_actions";

async function seedActive() {
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
      end_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .eq("id", c.id);
  return { ownerId: owner.id, challengeId: c.id };
}

describe("submitActionLog (FormData, real Storage)", () => {
  it("attaches photo end-to-end", async () => {
    const { ownerId, challengeId } = await seedActive();
    await setSessionCookies(ownerId);

    const bytes = readFileSync("tests/fixtures/pixel.jpg");
    const file = new File([bytes], "p.jpg", { type: "image/jpeg" });

    const fd = new FormData();
    fd.append("challengeId", challengeId);
    fd.append("activityType", "gym");
    fd.append("selectedKeywords", JSON.stringify(["집중"]));
    fd.append("shownKeywords", JSON.stringify(["집중", "무산소", "펌핑"]));
    fd.append("rerollCount", "0");
    fd.append("photo", file);

    const res = await submitActionLog(fd);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data?.photoAttached).toBe(true);

    const { data } = await admin
      .from("action_logs")
      .select("photo_path, user_id")
      .eq("id", res.data!.id)
      .single();
    expect(data?.photo_path).toMatch(
      new RegExp(`^${ownerId}/${challengeId}/${res.data!.id}-[A-Za-z0-9-]+\\.jpg$`),
    );

    // signed URL 발급 가능해야 함
    const ownerClient = asUser(ownerId);
    const { data: signed } = await ownerClient.storage
      .from("action-photos")
      .createSignedUrl(data!.photo_path!, 60);
    expect(signed?.signedUrl).toBeTruthy();
  });

  it("succeeds without photo (photoAttached=false, row photo_path=null)", async () => {
    const { ownerId, challengeId } = await seedActive();
    await setSessionCookies(ownerId);

    const fd = new FormData();
    fd.append("challengeId", challengeId);
    fd.append("activityType", "gym");
    fd.append("selectedKeywords", JSON.stringify(["집중"]));
    fd.append("shownKeywords", JSON.stringify(["집중", "무산소", "펌핑"]));
    fd.append("rerollCount", "0");

    const res = await submitActionLog(fd);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const { data } = await admin
      .from("action_logs")
      .select("photo_path")
      .eq("id", res.data!.id)
      .single();
    expect(data?.photo_path).toBeNull();
  });
});
```

> **주의**: `setSessionCookies(userId)` 는 기존 harness (`tests/integration/setup.ts`) 에 있어야 Server Action (`withUser`) 이 Session 을 본다. 없으면 `integration/setup.ts` 에 추가: magic-link admin `generateLink` → verifyOtp → cookie jar. 기존 e2e global-setup 과 동일 패턴.

- [ ] **Step 3: 5 min 창 회귀**

Create `tests/integration/storage/two-step-window.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { admin, asUser } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";

describe("2-step window: RPC bypasses 5-min RLS update policy", () => {
  it("RPC succeeds even when created_at is older than 5 minutes", async () => {
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
        end_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .eq("id", c.id);

    const { data: row } = await admin
      .from("action_logs")
      .insert({
        challenge_id: c.id,
        user_id: owner.id,
        activity_type: "gym",
        photo_path: null,
        selected_keywords: ["집중"],
        shown_keywords: ["집중", "무산소", "펌핑"],
        reroll_count: 0,
        ai_summary: "ok",
        prompt_version: "v1",
      })
      .select("id")
      .single();

    // created_at 을 10 분 전으로 조정 → RLS al_update_self_5min 이 차단해야 정상
    await admin
      .from("action_logs")
      .update({ created_at: new Date(Date.now() - 10 * 60_000).toISOString() })
      .eq("id", row!.id);

    const ownerClient = asUser(owner.id);
    const path = `${owner.id}/${c.id}/${row!.id}-zz.jpg`;

    // 직접 UPDATE 는 RLS 에 막혀야 함
    const { error: directErr } = await ownerClient
      .from("action_logs")
      .update({ photo_path: path })
      .eq("id", row!.id);
    expect(directErr).not.toBeNull();

    // RPC 는 성공해야 함
    const { error: rpcErr } = await ownerClient.rpc("update_action_log_photo_path", {
      p_log_id: row!.id,
      p_photo_path: path,
    });
    expect(rpcErr).toBeNull();

    const { data: updated } = await admin
      .from("action_logs")
      .select("photo_path")
      .eq("id", row!.id)
      .single();
    expect(updated?.photo_path).toBe(path);
  });
});
```

- [ ] **Step 4: pass 확인**

Run: `pnpm test:integration tests/integration/actions/submit-action-log-photo.spec.ts tests/integration/storage/two-step-window.spec.ts`
Expected: 3 pass.

- [ ] **Step 5: 리뷰 + commit**

- [ ] /code-review 호출
- [ ] Commit

```bash
git add tests/fixtures/pixel.jpg \
        tests/integration/actions/submit-action-log-photo.spec.ts \
        tests/integration/storage/two-step-window.spec.ts \
        tests/integration/setup.ts
git commit -m "test(integration): action photo upload end-to-end + 5-min window regression"
```

---

### Task 11: Playwright E2E — 실 파일 업로드 → 피드 렌더

**Files:**
- Create: `tests/e2e/action-photo-upload.spec.ts`

- [ ] **Step 1: 테스트 작성**

Create `tests/e2e/action-photo-upload.spec.ts`:

```ts
import { test, expect } from "./fixtures";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIXEL = resolve(__dirname, "../fixtures/pixel.jpg");

test("user uploads photo → appears in challenge feed", async ({
  page,
  seedActiveChallenge,
}) => {
  const { challengeId } = await seedActiveChallenge();

  await page.goto("/action");
  await expect(page.getByRole("heading", { name: /키워드/ })).toBeVisible();

  // 키워드 하나 선택
  await page.getByRole("checkbox").first().click();

  // 사진 업로드
  await page.locator('input[type="file"]').setInputFiles(PIXEL);
  await expect(page.getByAltText(/사진 미리보기/)).toBeVisible();

  // 제출
  await page.getByRole("button", { name: /인증하기/ }).click();
  await expect(page).toHaveURL(/\/home/);

  // 챌린지 상세 피드 이동
  await page.goto(`/challenge/${challengeId}`);
  const card = page.locator("article").first();
  await expect(card).toBeVisible();
  const img = card.getByRole("img", { name: /인증 사진/ });
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("src", /supabase\.co/);
});
```

> **주의**: `seedActiveChallenge` fixture 가 기존 `tests/e2e/fixtures.ts` 에 없으면 추가. 구현: admin client 로 active 챌린지 생성 + 현재 로그인 유저를 participant 로 등록. 기존 `challenge-create.spec.ts` · `pledge-sign.spec.ts` 가 일부 패턴을 이미 사용.

- [ ] **Step 2: 실행**

Run: `pnpm test:e2e tests/e2e/action-photo-upload.spec.ts`
Expected: 1 pass.

- [ ] **Step 3: 리뷰 + commit**

- [ ] e2e-runner 호출
- [ ] Commit

```bash
git add tests/e2e/action-photo-upload.spec.ts tests/e2e/fixtures.ts
git commit -m "test(e2e): photo upload → feed image render"
```

---

### Task 12: ADR D-018 + ONBOARDING §6.1 + JOURNAL

**Files:**
- Modify: `docs/TEAM_SHARE_DECISIONS.md`
- Modify: `docs/ONBOARDING.md`
- Modify: `docs/JOURNAL.md`

- [ ] **Step 1: D-018 append**

Edit `docs/TEAM_SHARE_DECISIONS.md` 맨 아래:

```md
## D-018 — Storage: 단일 private bucket + 2-step insert/update via RPC + 10min signed URL (2026-04-30)

**Context**
- PRD §11 Happy Path 의 "사진 찍기 → 인증 제출" 이 [action-form.tsx:52-53](src/app/(app)/action/_components/action-form.tsx#L52-L53) 에서 `https://example.com/photo.jpg` 로 하드코딩. 피드 신뢰도가 Day 10 dogfooding 에서 붕괴.

**Decision**
1. **버킷 1 개 (`action-photos`, private)**. 소유/권한을 path (`{userId}/{challengeId}/{logId}-{nonce}.{ext}`) 로 표현. Challenge/그룹 단위 분할 금지.
2. **쓰기 = Server Action 단일 step** (FormData). `bodySizeLimit=8mb`. 사전 서명 URL (브라우저 직접 PUT) 은 POC 과잉으로 기각.
3. **경로는 2-step insert/update** — `action_logs.insert(photo_path=null)` → `uploadPhoto` → `update_action_log_photo_path(p_log_id, p_photo_path)` RPC. Storage orphan 원천 차단. id 는 DB 발급.
4. **5-min update RLS 창 (`al_update_self_5min`) 과의 충돌은 SECURITY DEFINER RPC 로 해결**. RPC 는 `auth.uid() = user_id` 확인 후 `photo_path` 만 수정. 기존 5-min 정책 건드리지 않음.
5. **읽기 = 서버 10 min signed URL**. `fetchChallengeFeed` 가 user-scoped client 로 `createSignedUrl(path, 600)` 호출 → 비멤버는 발급 자체 실패 (RLS 자연 차단).
6. **업로드 실패 = 비파괴 폴백**. row 는 `photo_path=null` 로 남고 사용자는 "사진 없이 인증됐어요" UX 메시지. `action_logged.photoAttached=false` 이벤트로 관찰.
7. **MIME allowlist 5 종** (jpg/png/webp/heic/heif). HEIC 는 iOS Safari 대응 — 재인코딩 없음.
8. **`truncate_test_data` 가 Storage 오브젝트도 삭제** — D-014 (단일 Supabase 공유) 환경에서 CI 누적 방어.

**Consequences**
- v1 전 사용자당 사진 다건/대용량 필요 시 `createSignedUploadUrl` + 브라우저 PUT 경로로 마이그레이션. ADR 추가.
- CDN / `next/image optimized` 는 signed URL redirect 이슈로 별도 ADR 필요 시 v1 이월.

**Rejected alternatives**
- 클라 측 uuid 선발급 (D-box-2 B) — Storage orphan · audit 복잡성.
- admin client 로 update 우회 — RLS 경계 무력화 (security-reviewer 거부).
- 5-min 정책을 10-min 으로 완화 — PRD AC 수정 · 이해관계자 승인 필요.
```

- [ ] **Step 2: ONBOARDING §6.1 보강**

Edit `docs/ONBOARDING.md` — 기존 "6.1 Supabase" 블록의 Storage 문단 아래에 실 wiring 추가:

```md
### 6.1.1 Storage 실 wiring (D-018 이후)

- **버킷**: `action-photos` (private, 5MB, MIME 5 종). DDL: `supabase/migrations/0011_storage_action_photos.sql`.
- **path 규약**: `{userId}/{challengeId}/{actionLogId}-{nonce}.{ext}`.
- **쓰기**: `submitActionLog` Server Action (FormData) → `action_logs.insert(photo_path=null)` → `uploadPhoto` → `update_action_log_photo_path` RPC.
- **읽기**: `fetchChallengeFeed` 가 path → `createSignedUrl(path, 600)` 로 10 min URL. 비멤버는 RLS 로 발급 실패.
- **실패 폴백**: upload 실패 시 row 는 `photo_path=null` 유지 + `action_logged.photoAttached=false` 이벤트.
- **테스트**: `truncate_test_data` 가 `@test.local` 유저 소유 오브젝트 삭제.
- **next.config.ts**: `experimental.serverActions.bodySizeLimit="8mb"` (기본 1MB 로는 5MB 파일 413).
```

- [ ] **Step 3: JOURNAL 업데이트**

Edit `docs/JOURNAL.md` — "다음 부채" 섹션에서 "Web Push + `notification_sent`" 는 유지하고 **"Storage (B4)" 항목 제거**. 새 entry 추가:

```md
## 2026-04-30 (후속) — Storage end-to-end (D-018)

### 사실

Plan: [`2026-04-30-storage-photo-signed-url.md`](./superpowers/plans/2026-04-30-storage-photo-signed-url.md) · ADR: **D-018** · PR: PR-A/B/C 3 개 분할 머지.

- `0010_action_logs_photo_path.sql`: rename + not null 해제.
- `0011_storage_action_photos.sql`: bucket + RLS 4 정책 + `update_action_log_photo_path` RPC + `truncate_test_data` 확장.
- `submitActionLog` FormData 경로 + 2-step upload.
- `fetchChallengeFeed` 에 10 min signed URL.
- integration 5 case · e2e 1 case · unit 갱신.

### 내러티브

- **5-min update 창 회피 방법** 이 설계의 핵심. admin bypass 유혹을 security-reviewer 가 거부 → SECURITY DEFINER RPC 로 귀결.
- HEIC 파일 Content-Type 공란 이슈는 확장자 fallback 으로 해결. 재인코딩은 v1 이월.
- 기존 `https://example.com/...` legacy row 는 path 형태가 아니라 signed URL 발급 경로를 타지 않음 → 자연스럽게 null placeholder 로 렌더.

### 다음 부채

- self-retry (누락 키워드 지시 + wall-clock timeout)
- **Web Push + `notification_sent`** → `2026-04-30-web-push-start-deadline.md`
- `/admin/ai-cost` 대시보드
- AI 예산 80% Slack 알림
```

- [ ] **Step 4: 최종 검증**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`
Expected: all green.

- [ ] **Step 5: commit**

```bash
git add docs/TEAM_SHARE_DECISIONS.md docs/ONBOARDING.md docs/JOURNAL.md
git commit -m "docs: D-018 Storage architecture + ONBOARDING §6.1.1 + JOURNAL"
```

---

## 3. Out of Scope (명시)

- (a) 이미지 편집/재인코딩 (crop · EXIF 제거 · HEIC→JPG). 서버는 MIME/size 검증만.
- (b) CDN / `next/image optimized` — signed URL redirect 이슈 별도 ADR.
- (c) Storage 사용량/비용 알림 가드.
- (d) legacy `https://example.com/...` row 실 사진 마이그레이션 — `truncate_test_data` 로 리셋 후 재시드.
- (e) 사진 삭제 UI (운영툴 v1).
- (f) 재업로드 시 이전 파일 정리 루틴 (v1).
- (g) 파일 magic-byte 검증 (재업로드된 원본만 검증).

---

## 4. Self-Review Checklist

**Spec coverage (ONBOARDING §6.1 · PRD §11 · JOURNAL "B4"):**

| 요구 | Task |
|------|------|
| private bucket + path 규약 | 2 · 5 |
| Server Action FormData 경로 | 3 · 6 · 7 |
| 2-step insert/update | 1 · 2 · 6 |
| 5-min RLS 창 우회 (RPC) | 2 · 10 |
| MIME/size 3 중 검증 | 4 · 5 · 2 (bucket policy) |
| 읽기 signed URL 10 min | 5 · 8 |
| FeedCard null placeholder | 9 |
| 업로드 실패 비파괴 폴백 | 6 |
| `action_logged.photoAttached` | 4 · 6 |
| `truncate_test_data` Storage 확장 | 2 |
| E2E 실 파일 업로드 | 11 |
| ADR + ONBOARDING 보강 | 12 |

**Placeholder scan:** "TBD" · "implement later" · 완전하지 않은 code block 없음. `// TODO(0010): …` 마커는 Task 1 Step 5 에서 **명시적으로 금지** — PR-A 는 Task 1~10 을 한 브랜치에 쌓아 최종 green 으로 올린다.

**Type consistency:**
- `buildPhotoPath` / `uploadPhoto` / `getPhotoSignedUrl` (Task 5) 시그니처 ↔ `submitActionLog` (Task 6) · `fetchChallengeFeed` (Task 8) 호출부 일치 ✓
- `UploadResult` discriminated union `{ ok: true; path } | { ok: false; reason }` 일관 사용 ✓
- `ActionLogInput` (Task 4) ↔ `submitActionLog` parseForm (Task 6) 필드 일치 ✓ (`photoUrl` 키 삭제 확정)
- `FeedItemView` (Task 8) ↔ `FeedCard` props (Task 9) 일치 ✓ (`photoSignedUrl: string | null`)
- `update_action_log_photo_path(p_log_id uuid, p_photo_path text)` (Task 2 SQL) ↔ `supabase.rpc("update_action_log_photo_path", { p_log_id, p_photo_path })` (Task 6) 이름/인자 일치 ✓
- `action_logged.props.photoAttached` (Task 4 Zod) ↔ `track(...)` 호출 (Task 6) 일치 ✓

**Gaps / notes:**
- Task 1 커밋은 `pnpm typecheck` 를 깨뜨린다 (의도적). PR-A 브랜치는 Task 1~10 을 한꺼번에 올려 green 으로 리뷰. 본 plan 이 이 운영을 **명시**.
- `parseForm` 의 `issues?: unknown` 반환 타입은 기존 `validationFailure` 계약과 정합. 추가 타입 정의 불필요.
- `tests/integration/setup.ts` 에 `setSessionCookies(userId)` helper 가 없으면 Task 10 Step 2 에서 추가. 기존 e2e `global-setup.ts` 의 magic-link 패턴을 재사용. 없어도 된다면 `asUser(uid)` 클라이언트로 RPC/Storage 직접 호출하는 버전으로 수정.
