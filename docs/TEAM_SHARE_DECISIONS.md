# 🧭 윗키(With-key) — Decisions Log (ADR-lite)

> **목적**: 3개월 후에도 "**왜** 우리가 X를 선택했는지" 재구성 가능하게.
> **원칙**:
> - 의미 있는 결정 = **되돌리기 비용이 큰 선택**만 기록 (작은 코드 스타일 선택 제외).
> - 하나의 결정 = 하나의 `### D-NNN` 엔트리. **수정 금지** (덮어쓰려면 **새 엔트리로 supersede**).
> - 최신이 위. 번호는 단순 증가 (D-001부터).
> - **반드시 "되돌릴 조건"을 적는다** — 이게 빠지면 PIVOT 타이밍을 놓친다.
>
> **관련**:
> - [KICKOFF.md §2](./KICKOFF.md) — D0 결정은 모두 여기 D-001~D-0XX로 등록
> - [TEAM_SHARE_KICKOFF_AGENDA.md §7](../.claude/drafts/TEAM_SHARE_KICKOFF_AGENDA.md) — 원본 포맷 (로컬 전용)
> - [VALIDATION.md §7.3](./VALIDATION.md) — PIVOT 패턴
>
> **언제 기록?**
> - ✅ 기술 스택 선택 (DB, 모델, 호스팅…)
> - ✅ 스코프 변경 (기능 추가/삭제/연기)
> - ✅ 지표 정의 변경 (목표 수치 이동)
> - ✅ 팀/R&R 변경
> - ✅ 외부 조건 변화로 인한 방향 전환
> - ❌ 변수명, 폴더 구조, 라이브러리 minor 버전 — PR 메시지로 족함

---

## 📝 템플릿 (복사해서 사용 — 최신이 위)

```markdown
---

### D-NNN — [한 줄 제목]

- **날짜**: YYYY-MM-DD
- **상태**: ✅ Active | 🔄 Superseded by D-MMM | ⛔ Reverted (sunset YYYY-MM-DD)
- **참여자**: Ian, (이름)
- **맥락 (Context)**:
  - 무엇이 문제였나? 왜 결정이 필요했나?
  - 3줄 이내.
- **고려한 옵션 (Options considered)**:
  - A) (선택지) — 장점 / 단점
  - B) (선택지) — 장점 / 단점
  - C) (선택지) — 장점 / 단점
- **결정 (Decision)**:
  - 우리는 **___** 를 선택한다.
- **근거 (Reasoning)**:
  - 핵심 이유 2~3줄.
  - 측정 가능한 기준이 있으면 숫자로: "응답 지연 <8s 보장" 등.
- **영향 범위 (Impact)**:
  - 어떤 문서/코드/사람이 영향받는가?
  - (예) PRD §5, ENG §6.2, Supabase 스키마
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - "만약 ___ 이 ___ 를 넘으면 재논의한다." — 구체적 수치/이벤트
  - 예: "월 AI 비용이 $50 초과 3주 연속" / "memo fallback 사용률 ≥40%"
- **Follow-up**:
  - 이 결정으로 인해 해야 할 후속 작업 (있으면)
```

---

<!--
================================================================
아래부터 실제 결정을 append. 최신이 위에 오도록 (D-NNN 번호는 단순 증가).
================================================================
-->

---

### D-021 · 초대 수락을 SECURITY DEFINER RPC 로 구현 (2026-05-06)

- **결정**: 초대 수락 경로를 `accept_invite(p_token text) returns uuid` RPC 로 구현.
- **왜**: `group_members` INSERT 는 0002_rls.sql 기준 `service_role` 전용. 사용자 토큰으로 직접 insert 불가. 대안 A (앱 서버 Action 에서 `adminClient` 로 insert) 는 RLS 우회면 확대. 대안 B (group_members INSERT RLS 정책 추가) 는 멤버십-자기증명 loop 위험 (A 가 B 를 초대하는 걸 막을 수 없음). RPC 경로는 토큰 검증과 insert 를 한 트랜잭션에 묶어 최소 노출면 보장.
- **적용 범위**: `supabase/migrations/0018_accept_invite_rpc.sql`, `src/app/(auth)/invite/[token]/_actions.ts`.
- **되돌릴 조건**: 초대 외에 "자발적 그룹 탐색 가입" 기능이 생기면 RPC 1개로는 부족 — 그때 RLS 정책 재설계.

---

### D-020 — 정산 수단: 카카오페이 송금 링크 → 앱 레이어 AES-256-GCM 암호화 계좌번호 (D-009 반전)

- **날짜**: 2026-05-06
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - D-009 가 채택한 `NEXT_PUBLIC_KAKAOPAY_SEND_URL` + QR 경로는 외부 카카오페이 송금 링크/QR 스펙이 정책·도메인 변경으로 갑자기 깨질 수 있어 POC 가설 검증의 안정성이 떨어진다.
  - 멀티 그룹 전환 시점(`groups` 가 N:N 지원)과 맞물려 "오너별 수취 주체" 를 스키마 수준에서 1급 필드로 둘 필요가 생겼다.
  - 벌금 정산 플로우에서 사용자 저항이 낮은 1차 기능은 "오너 계좌번호 공유 + 복사" 이다(실결제 API 연동은 POC 밖).
- **고려한 옵션 (Options considered)**:
  - A) D-009 유지 (송금 링크 + QR) — 구현 단순 / 외부 스펙 리스크 잔존.
  - B) 오픈뱅킹·ARS 실명 검증 — 정확도 高 / POC 대비 심사·비용 과다.
  - C) **오너 수기 입력 + 앱 레이어 AES-256-GCM + 마스킹 표시 + 복사 버튼 (채택).**
  - D) pgcrypto `pgp_sym_encrypt` + Postgres GUC `app.account_key` — DB-local 구현 단순 / DB 덤프 + GUC 동시 유출 시 무력화(키와 암호문이 같은 신뢰 경계).
- **결정 (Decision)**:
  - 우리는 **C 안** 을 선택한다.
  - DB: `groups` 에 `bank_code`, `account_holder`, `account_number_encrypted(bytea)`, `account_number_last4` 4 컬럼 + 묶음 CHECK(all-or-nothing).
  - 암호화: `ACCOUNT_ENCRYPTION_KEY` env(base64 32B) + Node `crypto` AES-256-GCM. 포맷 `iv(12) || cipher || tag(16)` 단일 bytea.
  - 읽기 경로: 마스킹 표시용 `bank_code`/`account_holder`/`account_number_last4` 만 RSC 화이트리스트 SELECT. `account_number_encrypted` 는 **오직** `revealAccountNumber` Server Action 한 경로로만 SELECT + 복호화하여 평문 반환 → `navigator.clipboard.writeText`.
  - 쓰기 경로: `create_group_with_owner(p_name, p_bank_code, p_account_holder, p_account_number_encrypted, p_account_number_last4)` SECURITY DEFINER RPC 가 groups insert + group_members(role=owner) 를 한 트랜잭션에서 처리(0002_rls 가 group_members INSERT 를 service_role-only 로 막기 때문).
  - 복호화 RPC 는 두지 않는다 — RLS `is_group_member` 만으로 비멤버 차단.
- **근거 (Reasoning)**:
  - **키와 DB 의 신뢰 경계 분리**: 키는 Vercel env, 암호문은 Supabase DB → 한쪽 덤프만으로는 평문 복구 불가(D 안 대비 우위).
  - **노출면 최소화**: 복호화는 앱 레이어 1개 모듈(`account-cipher.ts` + `import "server-only"`) + Server Action 1개 경로. definer RPC 로 복호화를 여는 설계를 거부.
  - **v1 KMS 이관 경로 단순**: `encryptAccountNumber`/`decryptAccountNumber` 시그니처 고정, 내부 구현을 AWS KMS / Supabase Vault 호출로 교체하면 끝.
  - POC 가설("정산 액션이 실제로 발생하는가") 검증에 외부 API 의존을 완전히 제거.
- **영향 범위 (Impact)**:
  - Supabase: `groups` 컬럼 4개 추가 + 묶음 CHECK · `create_group_with_owner(text, text, text, bytea, text)` RPC (0017 migration).
  - 앱: `src/lib/crypto/account-cipher.ts` (신규), `src/lib/bank/**` (신규), `/group/new` (계좌 3필드 묶음 optional 폼), `AccountInfoSheet` + `revealAccountNumber` Server Action.
  - 삭제: `src/lib/kakaopay/**`, `SettlementSheet`/`SettlementTrigger`, `qrcode` 의존성, `NEXT_PUBLIC_KAKAOPAY_SEND_URL` env.
  - 신규 env `ACCOUNT_ENCRYPTION_KEY` (REQUIRED, base64 32B).
  - PRD §8.2 `groups` 컬럼 표 갱신, §11 정산 섹션 갱신, §14 Non-Goals 갱신.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 실결제 API 운영 여력(사업자등록·PG 계약·심사) 확보 시 실결제 플로우로 상향. 또는 KMS 이관 시 D-020.1 로 superseding.
  - 유저가 "복사 후 실제 이체" 누락률 ≥ TBD% 로 측정되면 실결제 API 재검토.
- **되돌리기 비용**: 중간 — migration + AccountInfoSheet + account-cipher 모듈 교체.

---

### D-019 — Web Push: in-request fan-out + events 기반 dedup + quiet hours suppressed-only

- **날짜**: 2026-05-01
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - PRD §6.3 은 2종 알림(시작 / 마감)을 요구하지만 코드는 `src/lib/push/*` 헬퍼와 `push_subscriptions` 테이블까지만 배선되고 실제 dispatch 경로가 한 번도 호출되지 않던 상태였다.
  - 참가자 전원 서명 시점(`sign_and_maybe_activate` 가 `status='active'` 반환)과 마감 24 시간 전을 실제 사용자 기기까지 도달하는 알림으로 연결할 필요가 있다.
  - POC 스케일(그룹당 2~10 인)에서 큐/스케줄러 인프라를 새로 들이면 과잉.
- **고려한 옵션 (Options considered)**:
  - A) Server Action 내 직접 fan-out (`await sendPush` 순차) + Vercel Cron / 별도 `notification_dispatch_log` 없이 기존 `events` 테이블로 중복 제어.
  - B) 큐(Upstash / SQS / pg_cron) + 전용 `notification_dispatch_log` 테이블 + 독립 워커.
  - C) Supabase Realtime / Database Webhook 으로 상태 전이를 구독해 알림을 보내는 경로.
- **결정 (Decision)**:
  - 우리는 **A 안** 을 선택한다.
  - **시작 알림**: `signPledge` Server Action 이 RPC 결과 `status === "active"` 분기에서만 `void dispatchStartNotification(challengeId)` 를 fire-and-forget 호출. 참가자 서명 응답은 dispatch 결과와 무관하게 반환.
  - **마감 임박 알림**: `vercel.json` crons 가 **하루 1 회** (`0 0 * * *` = UTC 자정 / KST 09 시, hobby plan 이 허용하는 최대 빈도 — cron 주 1 회 초과면 Vercel 배포 자체가 거부됨) `POST /api/cron/deadline-push` 호출. 24 시간 주기에서도 누락이 생기지 않도록 창을 넓혀 `status='active' AND end_at ∈ [now+12h, now+36h]` 스캔 → `events.name='notification_sent' AND props->>'type'='deadline' AND props->>'challengeId'=...` 조회로 중복 제거 → `dispatchDeadlineNotification` fan-out. `events` dedup 이 이미 있어 창이 겹쳐도 중복 발송은 없다.
  - **Quiet hours 02~07 KST**: 발송 포인트에서만 차단. `notification_sent` 이벤트는 `suppressed=true, outcome='suppressed'` 로 기록해 관찰성 유지(큐잉/재스케줄 X).
  - **410 Gone / 404**: 응답 상태 코드로 판별 후 `push_subscriptions` 에서 해당 endpoint 즉시 삭제, `outcome='cleaned'`.
  - **선호도 저장**: `users.notification_prefs jsonb` (D-box-3 동일 결정). 별도 1:1 테이블 도입 금지.
  - **Cron 인증**: `Authorization: Bearer $CRON_SECRET` 헤더 비교. 미설정 시 401.
- **근거 (Reasoning)**:
  - 큐는 POC 스케일 대비 과잉 — 참가자 10 인 × endpoint 1 개 기준 `await Promise.allSettled` 없이 순차 처리해도 500 ms 미만.
  - `events` 테이블은 이미 D-017 에서 `props` gin 인덱스(0008) 가 있어 `challengeId` 조회가 싸다. 전용 dispatch ledger 테이블을 또 만드는 건 중복 관심사.
  - Realtime/Webhook 은 인프라가 느슨하게 연결돼 실패 관찰이 나쁘고, Server Action 에서 직접 호출하는 쪽이 시점 보장이 명확하다.
  - Quiet hours 를 큐잉하면 수신자 경험은 나아지지만 POC 범위에서 재스케줄/중복 가드까지 관리할 만한 가치가 없음 → suppressed 이벤트만 기록해 나중에 UX 정책 바뀌면 다시 본다.
- **영향 범위 (Impact)**:
  - DB: `supabase/migrations/0014_notification_prefs.sql`, `0015_notification_prefs_require_keys.sql`.
  - Server: `src/lib/push/dispatch.ts`, `src/app/api/cron/deadline-push/route.ts`, `src/app/(app)/pledge/_actions.ts` 에 dispatch 주입.
  - Client: `src/app/(app)/settings/_components/push-settings.tsx` 에서 구독 등록/해제 + prefs 토글.
  - Analytics: `notification_sent` props 에 `challengeId / suppressed / outcome` 추가, `notification_opened` 에 `challengeId` 추가.
  - Config: `vercel.json` crons 배열, `.env.example` 의 `CRON_SECRET`, Vercel Preview + Production env 등록.
  - Test: unit(push helpers + actions) + integration(RLS · dispatch · cron) + E2E(`/settings` smoke).
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 참가자가 100 명을 넘거나 일일 dispatch 건수가 수천건 규모가 되면 in-request fan-out 이 응답 지연을 만들 수 있음 → 옵션 B(큐) 로 이전 + ADR 새로 등록.
  - `events` 조회가 dedup 병목이 되거나 감사 성격 쿼리와 충돌하면 `notification_dispatch_log` 전용 테이블 분리.
  - Quiet hours suppressed 만으로 사용자 불만이 발생하면 큐잉 + 재스케줄러 도입.
- **되돌리기 비용**: 중간. dispatch 함수 경계는 잘 나눠져 있어 내부만 교체 가능하지만, cron 주기/계약(`CRON_SECRET`·route path) 이 외부 인프라와 엮여 있어 Vercel/Supabase env 동기화가 필요하다.

---

### D-018 — Storage 사진: private bucket + 2-step path RPC + 10분 signed URL

- **날짜**: 2026-04-30
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - `/action` 인증 플로우가 `https://example.com/photo.jpg` 를 저장해 피드의 사진 신뢰도가 무너진다.
  - Supabase Storage 는 public bucket 으로 열면 링크 유출 시 그룹 외부 접근을 막기 어렵다.
  - 기존 `action_logs` UPDATE RLS 는 생성 후 5분만 허용하므로, DB insert 후 파일 업로드가 지연되면 `photo_path` 저장이 막힐 수 있다.
- **고려한 옵션 (Options considered)**:
  - A) public bucket URL 저장 — 구현 단순 / 그룹 경계 없음.
  - B) 브라우저 direct upload signed URL — 대용량에 유리 / CORS·완료 ack·retry 복잡도 증가.
  - C) Server Action FormData 업로드 + private bucket + server signed read URL — POC 사진 1장에 적합 / Next body limit 설정 필요.
- **결정 (Decision)**:
  - 우리는 **C) Server Action FormData 업로드** 를 선택한다.
  - `action-photos` private bucket 1개를 두고 path 는 `{userId}/{challengeId}/{actionLogId}-{nonce}.{ext}` 로 고정한다.
  - `action_logs.photo_url` 은 `photo_path` nullable 로 전환한다. 업로드 실패 시 row 는 유지되고 `photo_path=null` 로 폴백한다.
  - 쓰기는 `insert(photo_path=null) -> uploadPhoto -> update_action_log_photo_path()` 2-step 으로 처리한다.
  - 읽기는 `fetchChallengeFeed` 가 user-scoped client 로 `createSignedUrl(path, 600)` 을 호출해 `FeedCard` 에 URL 만 전달한다.
- **근거 (Reasoning)**:
  - Server Action 본문 제한은 `experimental.serverActions.bodySizeLimit="8mb"` 로 5MB 이미지 1장 POC 요구를 충족한다.
  - signed URL 발급도 user-scoped client 로 수행해 `storage.objects` SELECT RLS 를 그대로 태운다. service_role/admin bypass 는 쓰지 않는다.
  - 5분 UPDATE 창 충돌은 `SECURITY DEFINER` RPC 로 해결하되, 함수 내부에서 `auth.uid() = action_logs.user_id` 및 path 의 owner/challenge/log 세그먼트 일치를 재검증한다.
- **영향 범위 (Impact)**:
  - DB: `supabase/migrations/0010_action_logs_photo_path.sql`, `0011_storage_action_photos.sql`.
  - App: `submitActionLog(FormData)`, `/action` 사진 선택/프리뷰, `fetchChallengeFeed`, `FeedCard`.
  - Analytics: `action_logged.props.photoAttached` 추가.
  - Test cleanup: `truncate_test_data()` 가 `@test.local` 유저의 Storage object 도 삭제. **단, D-017 의 `ai_cost_log(scope='test')` 리셋 + `user_id IS NULL` 24h 정리 로직도 함께 유지한다** (0011 이 함수를 재정의할 때 D-017 블록을 제거하지 말 것).
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 사진 다건/대용량 업로드가 필요하거나 Server Action 8MB 제한이 실제 UX 병목이 되면 `createSignedUploadUrl` + 브라우저 direct upload 로 재설계.
  - signed URL 만료가 피드 세션 중 빈번히 관측되면 TTL 또는 RSC 재발급 전략 재논의.
- **되돌리기 비용**: 중간. migration forward-only 특성상 `photo_path` 의미를 유지한 채 별도 write/read 경로로 교체해야 한다.

---

### D-017 — analytics 이벤트는 service_role admin client 로 insert하고 Zod 로 런타임 검증, AI 월예산은 (month, scope) 분리된 micros 테이블 + RPC로 가드

- **날짜**: 2026-04-30
- **상태**: ✅ Active
- **참여자**: Ian

- **맥락 (Context)**
  - PRD §9 이벤트 로깅 + §5.3 AC-7 월 예산 폴백을 end-to-end 로 배선해야 한다.
  - D-014 에 따라 Supabase 프로젝트 1 개를 local/CI/Preview 가 공유 → test 호출이 prod 누적을 오염시키면 안 된다.
  - OpenAI gpt-4o-mini POC 스케일 호출 비용이 **호출당 1 cent 미만** — cent 단위 저장은 선형성/누적 의미를 잃는다.

- **이벤트 로깅 옵션**
  - A) Server Action 세션 client 로 events insert — 거부: `events_insert_self_or_anon` 정책상 system 이벤트(AI 비용·알림 발송 등 acting session 과 다른 user_id) insert 불가능. RLS 가 `name` 은 CHECK 로 강제해도 **`props` shape 은 못 본다**.
  - B) Edge Function + 큐 — 거부: POC 범위 초과.
  - C) **service_role admin client 직접 insert + Zod 런타임 검증 (채택)** — `import "server-only"` 가드, lazy singleton, Zod `discriminatedUnion` 이 RLS 가 못 보는 `props` shape 을 대신 방어.

- **AI 비용 가드 옵션**
  - A) In-memory cache — 거부: 서버 인스턴스 재시작마다 0.
  - B) 외부 KV/Redis — 거부: POC 인프라 최소화 위반.
  - C) **`ai_cost_log(month, scope, total_micros)` + atomic upsert RPC (채택)** — PK=(month, scope) 로 test/prod 호출 격리. `truncate_test_data` 는 `scope='test'` 만 리셋 → D-014 안전성 유지. micros 단위로 POC 스케일 정확도 확보.

- **결정 (Decision)**
  - 이벤트: **service_role admin + Zod discriminatedUnion 이중 방어**. TS union(SoT, `track.ts`) ↔ Zod(`schema.ts`) drift 는 parity 테스트로 방어.
  - AI 비용: **`ai_cost_log(month, scope)` + `add_ai_cost(p_micros, p_scope) RPC`**, 단위는 micros.
  - self-retry 는 이 ADR 범위에 포함하지 않는다 — "누락 키워드 지시 주입 + wall-clock timeout" 재설계와 한 번에 다뤄야 함.

- **영향 범위 (Impact)**
  - `src/lib/supabase/admin.ts` (lazy singleton) + 이벤트/비용 insert 경로가 RLS 를 우회 → Zod 가 방어선.
  - 모든 `track()` 호출부의 `.catch(console.error)` 가 dead code 가 됨 → 제거.
  - `truncate_test_data` 가 scope='test' / user_id=null 24h 범위까지 추가 정리.

- **되돌릴 조건 (Reversal trigger) ⚠️**
  - 이벤트 insert 가 월 수십만 건 수준으로 늘어나면 admin client 일원화가 병목 → 배치 insert / Edge Function 으로 승격.
  - `events_insert_self_or_anon` 정책이 recipient user_id 를 허용하도록 확장되면 admin bypass 전제가 무너짐 → 재평가.

- **되돌리기 비용**: 낮음~중간. `track` 내부 교체 + RPC 유지하면 FE 영향 없음.

- **Follow-up**
  - `notification_sent` / `notification_opened` 배선은 Web Push plan 에서.
  - self-retry 는 "누락 키워드 지시 + wall-clock timeout" plan 에서.
  - `/admin/ai-cost` read-only 대시보드는 v1.

---

### D-016 — Kudos toggle: useOptimistic + 전체 배열 재생성 + 롤백-by-동일-액션

- **날짜**: 2026-04-30
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - `toggleKudos` 는 insert/delete 양방향이다. 네트워크 왕복을 기다리면 피드의 핵심 인터랙션이 느리게 느껴진다.
  - RLS `kudos_insert_self_not_own` 때문에 자기 로그에는 insert 가 실패한다. UI 가드가 없으면 서버 왕복 후 에러만 보여 사용자 경험이 거칠다.
- **고려한 옵션 (Options considered)**:
  - A) 토글 후 `revalidatePath` — 서버 왕복 필수 · 구현 단순 / 반응 느림
  - B) 로컬 `useState` 관리 + 실패 시 refetch — 카운트 계산 분산 / 실패 복구 복잡
  - C) `useOptimistic` 전체 배열 변환 함수 + 성공 시 settled state 확정 — React 19 정석 / 배열 전체 복사 cost
- **결정 (Decision)**:
  - 우리는 **C) `useOptimistic` + 성공 시 settled state 확정** 을 선택한다.
  - 액션이 순수 토글(더하기 ↔ 빼기)이라 optimistic 변환 함수 하나로 count 와 viewer flag 를 함께 갱신한다.
  - 자기 로그에 대해서는 client-side `disabled` 가드를 두되, 실 보안은 RLS 가 담당한다.
- **근거 (Reasoning)**:
  - (A) 는 kudos 가 짧고 자주 일어나는 인터랙션이라 체감 저하가 크다.
  - (B) 는 카운트 계산을 여러 곳에 흩뜨리고 refetch 시 깜빡임이 생긴다.
  - (C) 는 React 19 native API 를 쓰면서 서버 성공 후 로컬 settled state 를 확정해 revalidate 없이도 UI 가 유지된다. POC 규모 피드(~10~50건)는 배열 복사 cost 가 낮다.
- **영향 범위 (Impact)**:
  - `src/app/(app)/challenge/[id]/_components/challenge-feed.tsx` 신설.
  - `src/lib/db/reads/challenge-feed.ts` 신설 (D-013 패턴 계승).
  - `src/app/(app)/challenge/[id]/_components/feed-card.tsx` 에 `disabled` prop 추가.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 피드가 100+ 건으로 늘어 배열 전체 복사 cost 가 사용자 입력 지연으로 보이면 per-item state 로 전환.
  - `useOptimistic` 가 React major 버전에서 API 의미를 바꾸면 재평가.
- **되돌리기 비용**: 낮음. `ChallengeFeed` 내부 상태 관리 교체 수준.

---

### D-015 — E2E 인증: admin generateLink + verifyOtp, 단일 storageState 재사용

- **날짜**: 2026-05-01
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - E2E 에서 이메일 수신을 실제로 기다리면 Inbucket/Mailtrap 같은 메일 서버가 필요하고 플레이크가 심하다.
  - 반대로 "폼 입력 → 링크 클릭" 전체를 mock 하면 auth 배선 자체의 회귀가 잡히지 않는다.
  - `generateLink({ type: "magiclink" })` 의 `action_link` 는 Supabase hosted `/auth/v1/verify` 로 redirect 해 hash flow(`#access_token=`)로 돌아오는데, 앱의 `/auth/callback` 은 PKCE `?code=` 만 처리한다 → 실경로 navigate 는 프로덕션 코드 변경이 필요해 부적절.
- **고려한 옵션 (Options considered)**:
  - A) `action_link` 직접 navigate — 실경로 / hash flow 미지원 → 프로덕션 코드 변경 필요
  - B) node 에서 `verifyOtp` → session JSON 을 `base64-<…>` 쿠키로 encode → `addCookies` — 브라우저/서버 동기화 보장
  - C) Inbucket 같은 로컬 메일 서버 삽입 — 가장 real / POC 범위 초과 · 플레이크 높음
- **결정 (Decision)**:
  - 우리는 **B) `verifyOtp` + 직접 쿠키 주입** 을 선택한다.
  - node 에서 `admin.generateLink` → OTP 추출 → anon client `verifyOtp` → session → `@supabase/ssr` 포맷 쿠키(`sb-<ref>-auth-token`, `base64-<base64url(JSON)>`)로 `context.addCookies` → `/home` 접근 확인 → `storageState` 저장.
  - 별도로 `auth-login.spec.ts` 한 개는 실폼 → 토스트 경로를 단독 커버하여 UI 회귀 방어.
- **근거 (Reasoning)**:
  - (A) 는 production-fidelity 는 높지만 callback route 를 hash flow 용으로 fork 하는 비용이 크다.
  - (C) 는 Supabase hosted 메일 발송의 rate-limit 문제는 해결하지만 컨테이너 라이프사이클 관리가 추가된다.
  - (B) 는 쿠키 포맷이 `@supabase/ssr` 내부 구현에 의존하지만 해당 라이브러리 공식 API 와 분리되어도 포맷은 버전 차이로 깨지기 어렵고, 깨지면 한 줄 로그에서 원인이 명확.
- **영향 범위 (Impact)**:
  - `tests/e2e/global-setup.ts` 신설.
  - `src/app/api/me/route.ts` — fixture 가 현재 user id 를 얻기 위한 얇은 read-only 엔드포인트.
  - `tests/e2e/fixtures.ts` — groupId seed/cleanup 포함.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - `@supabase/ssr` 쿠키 포맷이 major 버전에서 바뀌면 재작성.
  - 프로덕션 E2E 가 필요해지는 시점 — service_role 을 CI 에 노출할 수 없으므로 seed user + password 또는 Supabase SSO 테스트 유틸로 재설계 예정.
- **되돌리기 비용**: 낮음. 전부 `tests/e2e/` 내부 변경 + `/api/me` 하나.

---

### D-014 — POC 단일 Supabase 프로젝트 공유 (local + CI + preview)

- **날짜**: 2026-05-01
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - Runway 구축 시점에 원격 Supabase 는 `with-key` 프로젝트 1개(ref `ohvcaytmzzwxkbxsmyny`)만 존재하고 0001~0006 마이그레이션이 이미 반영되어 있었다.
  - 표준 가이드라인은 dev/ci/prod 3개 분리지만, POC 스케일에서 3개 프로젝트는 과투자다.
- **고려한 옵션 (Options considered)**:
  - A) `with-key-ci` 신규 생성 → CI 전용, dev 와 데이터 격리 — 안전 / 초기 운영 비용 2중화
  - B) 단일 프로젝트를 local + CI + preview 공유 — 관리 단순 / 격리 없음 (안전 근거 필요)
- **결정 (Decision)**:
  - 우리는 **B) 단일 프로젝트 공유** 를 선택한다.
  - 안전 근거: `truncate_test_data` RPC([supabase/migrations/0003_state_transitions.sql](../supabase/migrations/0003_state_transitions.sql)) 가 `email like '%@test.local'` 로 스코핑되어 있어, CI 통합 테스트가 수동 검증 데이터를 지울 수 없다.
  - 분리 운영 비용(2중 프로젝트 관리 · 마이그레이션 2중 apply · link 실수 리스크) > 얻는 격리 이득.
- **근거 (Reasoning)**:
  - 격리 이득의 대부분은 "CI 가 실데이터 지우면 안 됨" 이고 이는 scope 조건으로 이미 달성됨.
  - Preview 가 dev 와 같은 DB 를 쓰는 것도 POC 에서는 "어떤 데이터라도 최신 UI" 가 목적이라 오히려 이점.
- **영향 범위 (Impact)**:
  - GitHub secrets: `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` (CI 접두 없음).
  - `.github/workflows/ci.yml` integration + e2e job 이 위 secrets 를 `NEXT_PUBLIC_*` 이름으로 매핑.
  - `scripts/ci/apply-migrations.sh` 가 `SUPABASE_PROJECT_REF` 기본값을 `ohvcaytmzzwxkbxsmyny` 로 가짐.
  - [docs/DEPLOY.md](./DEPLOY.md) 환경 매트릭스.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - v1 컷오버 시 `with-key-prod` 생성 — 이 결정을 supersede 하는 새 ADR.
  - CI 가 수동 검증 데이터를 실제로 파괴하는 사건이 1회라도 발생 — 즉시 ci 프로젝트 분리.
- **되돌리기 비용**: 중간. 프로젝트 생성 + secrets rotation + 마이그레이션 push + Vercel env 재매핑.

---

### D-013 — BFF Read 레이어를 RSC 페이지에서 분리

- **날짜**: 2026-04-30
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 홈/챌린지 디테일/서약 페이지의 데이터 페칭을 `page.tsx` 에 inline `await supabase.from(...)` 으로 두면 POC 동작에는 문제 없음.
  - 주간 정산·피드 페이지네이션 같은 Day 2+ 요구가 들어오면 "쿼리 shape" 과 "UI 조립" 이 같은 파일에서 엉켜 캐싱 전략 교체가 어렵다.
- **고려한 옵션 (Options considered)**:
  - A) 페이지에 직접 호출 — 초기 속도 / Day 2 캐시 교체 비용 증가
  - B) `src/lib/db/reads/*.ts` 로 분리 — RSC 이점 유지 · view 타입 공유 / 파일 1개 추가
  - C) React Query + client fetch — Day 2 피드 친화 / SSR 비용 2배 + POC 범위 밖
- **결정 (Decision)**:
  - 우리는 **B) `src/lib/db/reads/*.ts` 로 분리** 를 선택한다.
  - 3개 read 지점(`fetchActiveChallenge` · `fetchChallengeDetail` · `fetchPendingPledge`) 분리 완료. page 는 supabase-js 를 직접 부르지 않는다.
- **근거 (Reasoning)**:
  - RSC 이점 유지 + material view · request-memo 교체 시 UI 미수정.
  - View 타입(`ActiveChallengeView` 등)이 page props 계약 역할.
- **영향 범위 (Impact)**:
  - `src/app/(app)/home/page.tsx` · `src/app/(app)/challenge/[id]/page.tsx` · `src/app/(app)/pledge/page.tsx` · `src/app/(app)/pledge/_components/pledge-sheet.tsx`.
  - 신규 디렉터리: `src/lib/db/reads/`.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - Day 2+ 에 "cache 전략을 쓸 일이 없다" 는 결론이 나오면 inline 으로 원복.
  - read 함수가 page 별 1:1 대응으로만 쓰이고 재사용이 없다면 YAGNI.
- **되돌리기 비용**: 낮음. 3 함수를 page 본문으로 inline 하는 리팩터 수준.

---

### D-012 — Error taxonomy 6 코드 확정

- **날짜**: 2026-04-30
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - Batch A~C 에서는 `ActionResult.error` 가 `unauthorized`/`invalid_input` 2 코드로 충분했으나, 실 DB 연동 후 RLS 거부(42501)·unique(23505)·대상 부재(PGRST116)·FK(23503) 가 등장.
  - UI 분기(로그인 화면 이동 vs 재시도 vs "없음" 안내) 가 각기 다르다.
- **고려한 옵션 (Options considered)**:
  - A) 모두 `upstream_error` 1 코드 — 코드 단순 / UX 분기 불가
  - B) 6 코드 유니언 (`unauthorized | forbidden | invalid_input | not_found | conflict | upstream_error`) — 의미 분리 / 컴파일 타임 exhaustiveness
  - C) HTTP 상태 코드 직수용 — 표준 / 의미 중복 + 프레임워크 종속
- **결정 (Decision)**:
  - 우리는 **B) 6 코드 유니언** 을 선택한다.
  - `mapSupabaseError()` 가 Postgres/PostgREST 코드를 이 6 코드로 투영. `makeUserMessage()` 는 6 코드 모두 한국어 카피 보유.
- **근거 (Reasoning)**:
  - (A) 는 UX 분기 불가. (C) 는 의미 중복 + 프레임워크 종속.
  - discriminated union 이라 컴파일 타임 exhaustiveness 체크 가능.
- **영향 범위 (Impact)**:
  - `src/lib/actions/response.ts` · `error-messages.ts` · `supabase-error.ts` 신설 + 모든 Server Action 호출부 업데이트.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 코드 3 개만 쓰이고 있다는 사용 통계가 6개월 간 지속되면 축소 고려.
- **되돌리기 비용**: 중간. 유니언 축소는 `ErrorCode` 참조 모든 호출부에 영향.

---

### D-011 — 로컬 dev 인증 경로는 Supabase Magic Link (원격 dev project)

- **날짜**: 2026-04-30
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 카카오 OAuth 는 redirect URL/키 발급/앱 심사가 필요해 POC 2주 내 진행 어려움.
  - 반면 RLS 검증은 real auth 없이 불가능 — `DEV_BYPASS_AUTH=1` 로는 RLS 를 한 줄도 검증 불가.
  - 원격 dev 프로젝트(`ohvcaytmzzwxkbxsmyny`)는 이미 발급되어 있어 Docker 로컬 스택은 불필요.
- **고려한 옵션 (Options considered)**:
  - A) `DEV_BYPASS_AUTH=1` 계속 유지 — 빠름 / RLS 검증 불가
  - B) Supabase email OTP (magic link) — real auth · RLS 검증 가능 / 이메일 한 번 확인 필요
  - C) 카카오 OAuth 즉시 연결 — 실사용 경로 / POC 범위 초과
- **결정 (Decision)**:
  - 우리는 **B) Magic Link** 를 선택한다.
  - 로컬 dev 기본 인증으로 magic link. 카카오 provider 는 v1 백로그.
  - dev DB 는 원격 Supabase 프로젝트 사용 (Docker 미사용) — `supabase link --project-ref` + `db push` 플로우.
- **근거 (Reasoning)**:
  - (A) 는 RLS 검증 불가 → Day 2 목표 충돌. (C) 는 POC 범위 초과 + 외부 의존.
  - 원격 dev 사용 시 Integration test 의 `truncate_test_data` 를 `@test.local` email 스코프로 좁히면 실 seed 데이터 보호 가능.
- **영향 범위 (Impact)**:
  - `src/app/(auth)/login/page.tsx` 이메일 입력 버튼, `src/app/(auth)/login/_actions.ts` 신설, `src/app/auth/callback/route.ts` 신설.
  - `src/app/(app)/layout.tsx` 의 `DEV_BYPASS_AUTH` 분기 제거.
  - `package.json`: `dev` 에서 `DEV_BYPASS_AUTH=1` 제거, `db:push`/`db:types` 스크립트 추가.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 카카오 OAuth 가 준비되면 magic link 는 dev 보조 경로로 축소.
  - 원격 dev 에서 여러 명이 충돌하는 상황이 생기면 per-contributor Supabase branch 로 전환 검토.
- **되돌리기 비용**: 낮음. login UI 교체 수준. `supabase/config.toml` + callback 확장이면 카카오 추가 가능.

---

### D-010 — AI 트레이너 판독 / 상호 인정·반려 UI 제거

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 프로토타입(`TEAM_SHARE_UI_PROTO_TYPE.tsx`)은 "AI 트레이너 판독 중" + "인정/반려 투표" UI 전제였으나 PRD/BE_SCHEMA 에 판독·투표 스키마 미존재.
  - Design Brief §1.4 "실패에도 따뜻하게" 톤과 "반려" 투표 UX 가 충돌.
  - 상호 반려는 친구 단톡방 규범에서 관리하는 것이 자연스러움.
- **고려한 옵션 (Options considered)**:
  - A) 프로토타입 그대로 이식 — UX 풍부함 유지 / 스키마·스토리지·권한 정책 모두 추가 필요, 톤 충돌
  - B) Kudos 3 이모지(🔥/💪/👏) + 키워드 칩 인증 + AI 일기로 대체 — 톤 일관 · POC 스키마 충분 / "판독" 엄격성은 약화
- **결정 (Decision)**:
  - 우리는 **B) Kudos + 키워드 + AI 일기 3 축으로 축소** 를 선택한다.
- **근거 (Reasoning)**:
  - POC 목표는 "친구와 함께하는 따뜻한 동기부여" 검증 — 엄격한 판독·반려는 본 가설에서 우선순위 낮음.
  - Kudos 만으로도 사회적 강화 가설 측정 가능 (PRD §7 kudos 이벤트 기반).
- **영향 범위 (Impact)**:
  - PRD §4·§7 (인증·피드 플로우), BE_SCHEMA §8.5 (action_logs 만 사용, 투표/판독 테이블 미추가).
  - `src/app/(app)/action`, `src/app/(app)/challenge/[id]/_components/feed-card.tsx`.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - POC 기간 중 "판독 엄격성이 참여율을 끌어올린다" 가설이 사용자 인터뷰에서 반복 등장할 경우 재검토.
  - Kudos 만으로 인증 신뢰도가 떨어진다는 정성 신호 ≥ TBD 건 누적 시.
- **되돌리기 비용**: 높음. UI + `action_logs` 스키마 확장 + 투표 테이블 + 알림 이벤트 모두 재도입 필요.

---

### D-009 — 카카오페이 결제 연동 대신 송금 링크 + QR

- **날짜**: 2026-04-28
- **상태**: ⛔ Reverted (sunset 2026-05-06) — D-020 으로 대체
- **참여자**: Ian
- **맥락 (Context)**:
  - 벌금 정산에 카카오페이 결제 API 연동은 심사/PG 계약/키 관리 비용이 높음.
  - Design Brief §1.4 "실패에도 따뜻하게" 톤 유지가 POC 의 핵심 가설.
- **고려한 옵션 (Options considered)**:
  - A) 실결제 API 연동 — 정산 자동화·정확도 / POC 단계 심사/키 관리 비용 과도
  - B) 외부 송금 링크(`NEXT_PUBLIC_KAKAOPAY_SEND_URL`) + 클라 QR + 링크 복사 — POC 비용 낮음 / 실제 송금 자동화 없음
  - C) 링크만, QR 없음 — 가장 단순 / 모바일 웹→앱 전환 비대칭(QR 이 더 자연스럽다)
- **결정 (Decision)**:
  - 우리는 **B) 송금 링크 + 클라 QR + 링크 복사** 를 선택한다.
- **근거 (Reasoning)**:
  - POC 에서 검증해야 하는 것은 "정산 액션이 실제로 발생하는가" — 자동화 정확도가 아님.
  - `qrcode` 라이브러리 클라 생성으로 서버 비용 0.
  - `buildKakaoPayLink` 에 `ALLOWED_HOSTS` allowlist 고정으로 env 오염 시 open-redirect 차단.
- **영향 범위 (Impact)**:
  - BE_SCHEMA §13.2 (결제 연동은 백로그 이연), `src/lib/kakaopay/link.ts`, `src/app/(app)/challenge/[id]/_components/settlement-sheet.tsx`.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 유저가 "정산했다"고 주장하지만 실제 송금 누락률이 ≥ TBD% 로 측정되면 실결제 API 재검토.
- **되돌리기 비용**: 중간. `src/lib/kakaopay/link.ts` + `SettlementSheet` 두 모듈 교체.

---

### D-008 — BottomNav 3탭 도입

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - Design Brief §3.3 은 "POC 탭바 없음" 으로 기재했으나, PRD §10 9 화면 중 5 개가 탭 진입 후보.
  - 프로토타입(`TEAM_SHARE_UI_PROTO_TYPE.tsx`)도 3 탭 전제였고 단일 화면 스와이프 대비 학습 비용 낮음.
- **고려한 옵션 (Options considered)**:
  - A) 탭바 없이 단일 화면 스와이프/토글 — minimal shell / 화면 독립 라우팅 이점 상실, 접근성 저하
  - B) 3 탭 BottomNav (`홈 · 인증 · 서약서`) — 프로토타입·APG 패턴 / 탭 선택 UX 가 가장 흔함
- **결정 (Decision)**:
  - 우리는 **B) 3 탭 BottomNav** 를 선택한다.
- **근거 (Reasoning)**:
  - 모바일 Bottom Navigation 은 iOS/Android 공통 학습된 패턴 — 온보딩 비용 낮음.
  - 각 탭이 독립 라우트라 deep-link / 뒤로가기 히스토리 자연 처리.
- **영향 범위 (Impact)**:
  - `src/app/(app)/layout.tsx` 레이아웃 구조, `src/components/app-shell/bottom-nav.tsx`.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 사용자 인터뷰에서 탭바 때문에 콘텐츠 영역이 답답하다는 신호 ≥ TBD 건 누적 시 재검토.
- **되돌리기 비용**: 낮음. layout + bottom-nav 2 파일 제거면 원복.

---

### D-007 — 서약서 최대 금액 10,000원으로 하향

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - D-006에서 최대 기간이 3개월로 확장되며, 기존 최대 금액 20,000원을 유지할 경우 누적 벌금 규모가 과도해짐.
  - 초기 사용자의 심리적 허들을 낮춰 진입을 유도할 필요.
- **고려한 옵션 (Options considered)**:
  - A) 20,000원 유지 — 동기부여 강도 유지 / 누적 부담 과도, 진입 허들 ↑
  - B) 10,000원으로 하향 — 누적 부담 완화·진입 허들 ↓ / 동기부여 약화 가능
- **결정 (Decision)**:
  - 우리는 **B) 최대 금액 10,000원** 을 선택한다.
- **근거 (Reasoning)**:
  - 3개월 × 반복 주기 누적 시 20,000원 상한은 실질 부담이 과도.
  - POC 단계에서는 금액 강도보다 행동 데이터 확보가 우선.
- **영향 범위 (Impact)**:
  - PRD (서약서 금액 정책), `lib/validators` 금액 상한 검증, 정산/결제 로직, UI 카피(입력 폼 안내 문구)
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 약속 파기율(이행 실패율) 지표가 목표 대비 과도하게 높아 "금액이 낮아 동기부여가 부족" 가설이 세워질 경우 상향 재논의.
  - 또는 사용자 피드백상 "상한 상향" 요구가 ≥ TBD건 누적 시 재논의 (정량 기준은 Day 3 스탠드업까지 TBD).
- **Follow-up**:
  - `lib/validators` 금액 상한 상수 업데이트.
  - PRD/서약서 관련 화면 카피 반영.

---

### D-006 — 서약서 최대 기간 3개월까지 확장

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 기존 최대 기간이 짧아 사용자가 중장기 목표(예: 분기 단위 운동 루틴)를 서약서로 설정하기 어려움.
  - 장기 목표 지원이 제품 차별점과 리텐션에 긍정적일 것으로 판단.
- **고려한 옵션 (Options considered)**:
  - A) 기존 단기 상한 유지 — 단순성·리스크 한정 / 중장기 사용 사례 커버 불가
  - B) 최대 3개월까지 확장 — 중장기 목표 지원 / 누적 금액·운영 복잡도 증가
- **결정 (Decision)**:
  - 우리는 **B) 최대 3개월** 을 선택한다.
- **근거 (Reasoning)**:
  - 분기 단위가 사용자 목표 설정의 자연스러운 주기.
  - 누적 금액 부담 문제는 D-007(최대 금액 10,000원 하향)로 동반 조정.
- **영향 범위 (Impact)**:
  - PRD (서약서 기간 정책), `lib/validators` 기간 상한 검증, Supabase 스키마(서약서 기간 필드 제약), UI(기간 선택 컴포넌트)
  - D-007과 강한 결합 (금액 정책 동반 조정)
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 3개월 기간 설정자의 중도 이탈율이 단기 설정자 대비 과도하게 높을 경우(예: 30일 리텐션 격차 ≥ TBD%) 상한 축소 재논의.
  - 또는 장기 서약서 이용률이 총 서약서 중 < TBD% 로 유의미하게 낮을 경우, 기능 대비 복잡도 재평가.
- **Follow-up**:
  - `lib/validators` 기간 상한 상수/검증 로직 업데이트.
  - 기간 선택 UX(슬라이더/프리셋) 범위 조정.
  - Supabase 마이그레이션 필요 여부 확인.

---

### D-005 — "각서" → "서약서" 명칭 변경

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 기존 "각서" 표현이 강압적/법적 어조로 읽혀 일반 사용자에게 거리감을 유발.
  - 제품 톤앤매너(친숙·가벼운 동기부여)와 상충.
- **고려한 옵션 (Options considered)**:
  - A) "각서" 유지 — 강제성 인상 ↑ / 진입 심리적 허들 ↑, 제품 톤 불일치
  - B) "서약서"로 변경 — 친숙·자발적 뉘앙스 / 강제성 인상 약화 가능
  - C) 완전 신조어/브랜드 용어 — 차별화 / 의미 전달 불명확
- **결정 (Decision)**:
  - 우리는 **B) "서약서"** 로 통일한다.
- **근거 (Reasoning)**:
  - "서약"은 자발적 약속의 뉘앙스가 강해 제품 톤과 부합.
  - 의미 전달력(=약속 문서)은 유지하면서 심리적 허들을 낮춤.
- **영향 범위 (Impact)**:
  - 전 UI 카피, PRD, 디자인 시안, 랜딩/온보딩 문구, 푸시/알림 템플릿, `lib` 도메인 네이밍(코드 식별자는 영문 기준이라 영향 최소, 주석·문구만 조정)
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 사용자 테스트에서 "서약서" 표현이 모호하거나 "약속/다짐" 등 다른 표현 선호가 유의미하게 높을 경우(≥ TBD%) 재명명 검토.
- **Follow-up**:
  - 기존 문서·드래프트의 "각서" 전수 치환(PRD, KICKOFF 등).
  - 디자인 시안 및 카피 가이드에 반영.

---

### D-004 — 사진 기반 운동 인증 기능은 POC 범위에서 제외(옵셔널로 보류)

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 사용자가 찍은 사진이 실제 운동 관련인지 자동 판별하는 "사진 인증" 아이디어 제기.
  - AI 비전 모델 호출 비용이 호출당 누적되며 POC 예산에 부담.
- **고려한 옵션 (Options considered)**:
  - A) POC에 포함 — 인증 신뢰도 ↑, 차별점 / AI 비용 증가, 거짓양성/거짓음성 UX 비용
  - B) POC에서 제외(옵셔널 백로그) — 비용·스코프 통제 / 인증 신뢰도는 별도 설계 필요
  - C) 수동 인증(텍스트 기반)만으로 대체 — 비용 0 / 자동화 미흡
- **결정 (Decision)**:
  - 우리는 **B) POC에서 제외, 옵셔널 백로그로 보류** 를 선택한다.
- **근거 (Reasoning)**:
  - POC 핵심 가설(서약서 기반 행동 변화)에서 사진 인증은 필수 경로가 아님.
  - AI 비용은 D-001 이후 관리 대상이며, 비필수 기능으로의 비용 유입을 먼저 차단.
- **영향 범위 (Impact)**:
  - PRD 기능 범위(인증 플로우), `lib/ai` 사용량/비용 추정, 디자인 범위(인증 화면)
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 내부/외부 테스트에서 "인증 신뢰도 부족"으로 인한 이슈가 ≥ TBD건 관측될 경우 재논의.
  - 또는 월 AI 예산 여유가 확보되고, 사진 인증 단가가 호출당 TBD원 이하로 내려갈 경우 재평가.
- **Follow-up**:
  - 옵셔널 백로그 문서에 "사진 기반 운동 관련성 인증" 항목 등록(간단 스펙 + 예상 비용 메모).
  - 대체 인증(수동/타임스탬프/위치 등) 방식 스코프 여부는 별도 결정(추후 D-NNN).

---

### D-003 — (안건명 미기록) 디자인 접근 추가 결정 — UX 플로우 차트 재확인

- **날짜**: 2026-04-24
- **상태**: ✅ Active ⚠️ D-002와 결정 내용 동일 — 안건명 미기록 상태로 KICKOFF §2.2에 별도 행으로 잡혀 임시 ID 부여. 다음 체크포인트에서 D-002로 통합 여부 결정.
- **참여자**: 쟁쟁, 샤쌤, 뚜뚜, 순진
- **맥락 (Context)**:
  - 킥오프에서 디자인 접근 안건이 두 번 다뤄짐. 두 번째는 안건명이 기록되지 않아 D-002와 별도로 식별됨.
  - 결과는 D-002와 동일하나, 추적 가능성을 위해 별도 엔트리로 남김.
- **고려한 옵션 (Options considered)**:
  - A) UX 플로우 차트 — 사용 흐름·의사결정 검증 우선 / 비주얼 산출물 부재
  - B) 제미나이(Gemini) GenAI 디자인 생성 — 빠른 시안 / 흐름 검증 부족
- **결정 (Decision)**:
  - 우리는 **A) UX 플로우 차트** 를 선택한다 (D-002 재확인).
- **근거 (Reasoning)**:
  - "디자인은 나중에 다루고 UX를 우선" 합의를 한 번 더 명시적으로 확정.
- **영향 범위 (Impact)**:
  - KICKOFF §2.1, §2.2, §2.7
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 킥오프 기록상 "뒤는 없다" — **본 로그 원칙상 되돌릴 조건은 필수**이므로 잠정 기준 제안:
    - Day 7 Demo에서 플로우 차트만으로 사용자/내부 합의가 어려운 정황 ≥2회 발생 시 재논의.
- **Follow-up**:
  - Day 3 스탠드업에서 D-002와의 통합 여부 정리 후 본 엔트리 supersede 검토.
  - KICKOFF §2.2 "추가 디자인 접근 결정"의 안건명 명시화.

---

### D-002 — 초기 디자인 산출물로 UX 플로우 차트 채택

- **날짜**: 2026-04-24
- **상태**: ✅ Active
- **참여자**: 쟁쟁, 샤쌤, 뚜뚜, 순진
- **맥락 (Context)**:
  - "정교한 디자인" 기준과 초기 디자인 접근을 정해야 Day 1 진입 가능.
  - 흐름 검증과 비주얼 산출물 중 무엇을 먼저 잡을지 결정 필요.
- **고려한 옵션 (Options considered)**:
  - A) UX 플로우 차트 — 사용 흐름·의사결정 검증에 강함 / 비주얼 산출물 부재
  - B) 제미나이(Gemini) GenAI 디자인 생성 — 빠른 시안·정교한 비주얼 / 흐름 검증 부족
- **결정 (Decision)**:
  - 우리는 **A) UX 플로우 차트** 를 선택한다.
- **근거 (Reasoning)**:
  - 디자인은 나중에 다루고 UX(흐름)를 우선한다.
  - 정교한 비주얼은 흐름이 잡힌 뒤에 붙여도 늦지 않음.
- **영향 범위 (Impact)**:
  - KICKOFF §2.1, §2.7, R&R(디자인=뜌)
  - 후속 디자인 산출물(와이어프레임/시안) 일정에 직접 영향
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 킥오프 기록상 "뒤는 없다" — **본 로그 원칙상 되돌릴 조건은 필수**이므로 잠정 기준 제안:
    - Day 7 Demo에서 플로우 차트만으로 외부 테스터/내부 합의 형성이 어려운 사례 ≥2회 발생 시 재논의.
    - 또는 Day 14 회고에서 "비주얼 부재가 핵심 리스크"로 식별 시 재논의.
- **Follow-up**:
  - UX 플로우 차트 초안 작성 (KICKOFF §4 Action Item).
  - Day 3 스탠드업에서 초안 점검.

---

### D-001 — 키워드 선택 방식으로 "키워드 검색" 채택

- **날짜**: 2026-04-24
- **상태**: ✅ Active ⚠️ 되돌릴 조건 보완 필요 (KICKOFF §3 #4, §4 Action Item)
- **참여자**: 쟁쟁, 샤쌤, 뚜뚜, 순진
- **맥락 (Context)**:
  - POC 범위(§4.3) 확정을 위해 키워드를 어떻게 노출/입력받을지 결정 필요.
  - 사용자 흐름의 첫 진입점이라 후속 UX·AI 프롬프트 입력 포맷에 영향이 큼.
- **고려한 옵션 (Options considered)**:
  - A) 키워드 리롤 — 우연성·재미 요소 / 검색 의도 미반영
  - B) 키워드 검색 — 검색 의도 직접 반영·시장 트렌드 부합 / 빈 결과 처리·키워드 풀 품질 의존
- **결정 (Decision)**:
  - 우리는 **B) 키워드 검색** 을 선택한다.
- **근거 (Reasoning)**:
  - 시장/제품 트렌드가 키워드 검색 쪽에 있다는 팀 판단.
  - 사용자가 원하는 키워드를 직접 찾는 패턴이 더 자연스럽다.
- **영향 범위 (Impact)**:
  - KICKOFF §2.1, §2.7
  - 키워드 풀 v1(R&R: 쟁뜌)
  - AI 일기 프롬프트 입력 포맷 (R&R: 쟁)
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - **킥오프 기록 미기재 — Action Item으로 보완 필요** (KICKOFF §3 #4, §4, §5).
  - 잠정 검토 기준 (Day 3 스탠드업까지 정량화):
    - 검색 → 키워드 선택 전환율 < TBD%
    - 빈 결과율 ≥ TBD%
    - 사용자가 "원하는 키워드가 없다"고 응답 ≥ TBD%
- **Follow-up**:
  - 되돌릴 조건 정량 기준 정의 (Day 3 스탠드업까지) — KICKOFF §4 Action Item.
  - 키워드 검색 기준과 검색 UX 초안 정리 — KICKOFF §4 Action Item.
  - 키워드 풀 v1 초안 (R: 쟁뜌) — KICKOFF §2.6.

---

## 📚 Supersession & Revert History

> 결정이 뒤집히면 여기에 한 줄씩 기록. 원본 엔트리는 상태만 바꾸고 본문 유지.

| Date | Decision | Change | 이유 |
|---|---|---|---|
| - | - | - | - |

---

> _이 파일은 `gbike-labs/.gitignore`에 의해 커밋되지 않는 개인 드래프트입니다._
