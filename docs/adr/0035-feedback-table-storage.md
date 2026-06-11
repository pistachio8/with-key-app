# ADR-0035: feedback 테이블 + feedback-photos Storage (개발자에게 건의하기)

**Date**: 2026-06-11
**Status**: accepted <!-- accepted / superseded / deprecated -->
**Deciders**: pistachio8
**관련**: spec [2026-06-10-feedback-suggestion-design](../superpowers/specs/2026-06-10-feedback-suggestion-design.md) · plan [2026-06-10-feedback-suggestion](../superpowers/plans/2026-06-10-feedback-suggestion.md) · migration `0047_feedback.sql` · [ADR-0024](./0024-admin-cache-after-layer1-visibility.md)(admin cache 경계)

## Context

dogfood 기간에 사용자 건의·버그 리포트가 카톡·구두로 흩어져 유실된다. 앱 안에서 받아 한 곳(DB)에 모으고, 이미 QA 허브인 Slack #qa 로 실시간 인지하는 경로가 필요하다. 버그 리포트는 화면 캡처가 텍스트보다 정보량이 커서 사진 1장 첨부도 받는다.

해결해야 할 제약:

1. **열람 화면이 없다.** 앱에는 건의 목록·답변 화면이 없고(YAGNI), 개발자는 Supabase Studio(service_role)로 본다. RLS(Row Level Security, 행 단위 접근 제어) 노출면을 최소화해야 한다.
2. **사진 첨부의 권한 모델이 action-log 와 다르다.** 기존 `action-photos` 버킷의 SELECT 정책은 "챌린지 그룹 멤버" 기준이라, 챌린지와 무관한 건의 사진에 부적합하다.
3. **INSERT-only RLS 는 insert 후 행을 못 읽는다.** SELECT 정책이 없으면 `insert(...).select()` 체이닝이 RLS 에 막혀, 사진 경로를 만드는 데 필요한 `id` 를 insert 응답에서 받을 수 없다.

## Decision

**신규 `feedback` 테이블은 INSERT-only RLS 로 닫고, 사진은 owner-scoped RLS 를 가진 신규 private 버킷 `feedback-photos` 에 저장하며, Server Action 은 id 를 선생성해 사진 업로드를 insert 보다 먼저 수행한다.** 기존 0011(버킷 + owner-scoped storage RLS)·0012(`truncate_test_data` + `storage.allow_delete_query` 플래그) 패턴을 재사용하고 새 패턴을 만들지 않는다.

1. **`feedback` 테이블 INSERT-only RLS** — `with check (user_id = auth.uid())` 만 두고 SELECT/UPDATE/DELETE 정책은 두지 않는다. FK 는 `public.users(id) on delete cascade`(레포 컨벤션 0034·0042 정합).
2. **신규 private 버킷 `feedback-photos` (owner-scoped RLS)** — INSERT·SELECT·DELETE 모두 `auth.uid()::text = (storage.foldername(name))[1]`. 경로는 `{userId}/{feedbackId}-{nonce}.{ext}`(2-segment) — action-photos 의 3-segment(`{userId}/{challengeId}/...`)와 다르다.
3. **id 선생성 + 사진 업로드 선행 → insert** — SELECT 정책이 없어 insert-후-`.select()` 가 막히므로 Server Action 이 `randomUUID()` 로 `id` 를 만든다. INSERT-only 라 insert-후-`photo_path` UPDATE 경로도 없으므로, orphan row 대신 orphan object 를 택하고 insert 실패 시 best-effort `remove()` 로 정리한다.
4. **Slack signed URL 은 `adminClient()`(service_role)로 TTL 72h 생성** — 내부 #qa 한정 노출. [ADR-0024](./0024-admin-cache-after-layer1-visibility.md) 위반이 아니다: user-facing cache 에 admin 결과를 저장하는 것이 아니라 1회성 URL 을 발급할 뿐이다.
5. **`truncate_test_data` 는 0012 정의 전문 기반 재발행** — `storage.allow_delete_query` 플래그(0012 가 추가한 `storage.protect_delete` 트리거 우회)를 반드시 보존하고, ① storage delete 의 bucket 스코프에 `feedback-photos` 추가 ② `delete from public.feedback`(auth.users 삭제 이전) 두 줄만 확장한다. **0011 기반으로 재발행하면 플래그가 빠져 함수가 실패하므로 금지.**

> 본 ADR 은 migration `0047_feedback.sql`(데이터 레이어, EVAL-0027)의 동반 산출물이다. Server Action·storage 헬퍼·Slack notify·UI 는 후속(EVAL-0028·0029)이며 결정 근거는 위 4·5번에 미리 고정한다.

## Alternatives Considered

### 1. 기존 `action-photos` 버킷 재사용

- **Pros**: 버킷·RLS 신설 없음.
- **Cons**: SELECT 정책이 챌린지 그룹 멤버 기준이라 챌린지 없는 건의 사진에 부적합.
- **Why not**: owner-scoped 별도 버킷이 private + signed URL 가드레일에 깔끔히 정렬된다.

### 2. insert 선행 + `photo_path` UPDATE (action-log 동형)

- **Pros**: orphan object 가 안 생긴다(행이 먼저 있으니 경로를 나중에 채움).
- **Cons**: UPDATE 정책 또는 SECURITY DEFINER RPC 가 추가로 필요해 INSERT-only RLS 의 단순함을 해친다.
- **Why not**: 업로드 선행 + orphan object best-effort 정리로 더 작은 표면을 유지한다.

### 3. DB-only + Supabase DB Webhook 릴레이

- **Pros**: Slack 결합을 앱에서 완전히 분리.
- **Cons**: webhook 설정·중계 endpoint 등 인프라가 늘어 POC 과잉.
- **Why not**: v1 백로그로 미룬다(spec 대안 3).

## Consequences

### 긍정적

- 건의가 DB(SoT, Single Source of Truth — 중복 없는 단일 원본)에 보존되고 #qa 로 실시간 인지된다. 새 대시보드가 필요 없다.
- 노출면이 최소다 — 건의 행은 service_role 외에는 누구도 읽지 못하고, 사진은 본인만 접근 가능하다.
- 기존 0011·0012 패턴 재사용으로 새 RLS·트리거 우회 패턴을 도입하지 않는다.

### 부정적 / 비용

- 사진 orphan object 가 드물게 잔존할 수 있다(insert 실패 **및** remove 실패가 겹칠 때). 빈도가 낮고 Studio 정리로 충분하다.
- Slack signed URL 72h 는 앱 피드(600s)보다 길게 노출되지만, 내부 #qa 한정 + 72h 만료로 위험을 가둔다.

### 후속 영향

- (인지 기록 — 본 ADR 범위 밖) `truncate_test_data` 가 `point_ledger`·`settlements` 를 정리하지 않는 **기존 잠복 결함**을 재발행 과정에서 확인했다. 본 migration 은 0012 동작을 1:1 보존하므로 그 결함을 고치지 않는다 — 별도 forward-fix migration 이 필요하다.
- BE_SCHEMA(§2 인벤토리·§5.11 컬럼·§7 RLS·§12 Changelog)와 `apps/web/.env.example`(`SLACK_FEEDBACK_WEBHOOK_URL` 서버 전용)이 본 ADR 과 같은 PR 에서 동기화된다.
- Server Action(`submitFeedback`)·storage 헬퍼(`feedback-photos.ts`)·Slack notify(`slack/notify.ts`)·UI(`/me/feedback`)는 EVAL-0028·0029 가 본 결정을 SoT 로 구현한다.
