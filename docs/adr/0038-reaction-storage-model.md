# ADR-0038: 🟨 익명 피어 반려 reaction 저장 모델 (kudos 분리 · 별도 테이블)

**Date**: 2026-06-14
**Status**: accepted <!-- accepted / superseded / deprecated -->
**Deciders**: pistachio8 (PO) + BE
**관련**: [EVAL-0025 task](../../evals/tasks/0025-verify-peer-reject-owner-replace.md) · [ADR-0032 정산·자동검증 데이터 모델](./0032-settlement-verification-data-model.md)(§게이트·범위 경계 — 본 결정을 미룸) · [ADR-0024 admin cache 경계](./0024-admin-cache-after-layer1-visibility.md) · [eng-story photo-verification](../eng-stories/2026-06-05-photo-verification.md) WP5 · [RN MVP PRD §5.B](../migration/01-rn-mvp-prd.md) · [PRD §9.1 AnalyticsEvent](../pm/prd.md)

## Context

EVAL-0025(🟨 익명 피어 반려)는 그룹장 단독 판정을 **그룹의 익명 다수결**로 대체한다. θ(세타) 자동검증이 못 잡는 맥락적 사기(예: 매번 같은 장소·무관한 사진)를 멤버들이 익명으로 거르고, 그룹장 단독 판정의 이해상충을 없애는 것이 목적이다([PRD §5.B](../migration/01-rn-mvp-prd.md), `AC-peer-reject-1~4`).

[ADR-0032](./0032-settlement-verification-data-model.md) §게이트·범위 경계는 "익명 반려(🟨) reaction 저장 모델(kudos union 변경)은 PO 승인 + 별도 spec/ADR로 미뤘다"고 명시했다. **본 ADR이 그 미뤄진 결정이다.**

해결해야 할 제약:

1. **익명성이 기능의 신뢰 핵심이다.** 누가 반려했는지 작성자·다른 멤버·그룹장 누구도 알면 안 된다(`AC-peer-reject-1`, 카운트만 노출). 그래야 보복·눈치 없이 솔직하게 거를 수 있다. 하지만 시스템은 **본인 반려 불가·토글·중복 방지·과반 계산**을 위해 voter(반려자) 신원을 저장은 해야 한다 → "저장하되 노출하지 않는다"는 경계 설계가 필요하다.
2. **반려는 표현(kudos)이 아니라 판정 입력이다.** 본인 제외 과반(> (N−1)/2) 도달 시 `action_logs.auto_verify_status`를 `peer_rejected`로 전이시키고 `doneCount`에서 제외한다. 단순 이모지 reaction과 의미·경로가 다르다. (`peer_rejected` enum 값은 0045(EVAL-0020)에서 이미 추가됨.)
3. **현 kudos는 비익명이다.** `kudos` 테이블(`action_log_id` · `user_id` · `emoji` ∈ 🔥💪👏)은 viewer가 `user_id`로 누가 눌렀는지 read 한다([kudos-viewer.ts](../../apps/web/src/lib/db/reads/kudos-viewer.ts)). `KUDOS_EMOJIS`는 [PRD §7.3](../pm/prd.md)·AnalyticsEvent와 1:1이라, 여기에 🟨를 끼우면 kudos 이벤트 union이 바뀌어 **PRD §9.1 1:1 동기화가 깨진다**.
4. **RN은 Server Action을 못 쓴다.** 쓰기 경로가 RPC(Remote Procedure Call, Postgres 함수) 직접 호출 또는 BFF(Backend-for-Frontend)로 승격되므로([ADR-0032](./0032-settlement-verification-data-model.md)·[ADR-0036](./0036-rn-admin-hydrate-bff-contract.md)), 과반 판정·토글·익명 집계·시간창은 **DB 안(SECURITY DEFINER RPC)에서 닫혀야** 클라이언트 토큰이 RLS(Row Level Security, 행 단위 접근 제어)만으로 익명성·정합을 깨지 못한다.

## Decision

**🟨 익명 피어 반려는 `kudos` union을 건드리지 않고 신규 `peer_rejections` 테이블에 voter 신원과 함께 append 하되, 익명성은 "read 경계에서 카운트만 노출(voter_id 비노출)"로 강제하고, 과반 판정·토글·본인 반려 거부·status 전이·48h 시간창은 `SECURITY DEFINER` RPC 한 경로로 닫는다.** 기존 패턴(`kudos` 테이블 형태 · `is_group_member()` RLS · 0045 `auto_verify_status` · [ADR-0024](./0024-admin-cache-after-layer1-visibility.md) admin hydrate 경계)을 재사용하고 새 패턴을 만들지 않는다.

세부 — DDL(Data Definition Language, 테이블 정의)은 후속 migration이 본 ADR을 SoT(Single Source of Truth)로 구현한다. 컬럼 타입·제약 컨벤션은 기존 테이블과 동일.

### 1. `peer_rejections` — 익명 반려 저장 (kudos와 분리)

```sql
-- 00NN_peer_rejections.sql (구현 스케치 — 정확본은 migration)
create table public.peer_rejections (
  id            uuid primary key default gen_random_uuid(),
  action_log_id uuid not null references public.action_logs(id),
  voter_id      uuid not null references public.users(id),
  created_at    timestamptz not null default now(),
  unique (action_log_id, voter_id)   -- 1인 1표 + 토글 멱등의 키
);
create index idx_peer_rejections_action_log on public.peer_rejections(action_log_id);  -- 카운트 집계용. voter-scoped 조회(토글·viewer read)는 unique(action_log_id, voter_id) 가 커버.
```

- `kudos`와 **동형이되 `emoji` 없음**(반려는 단일 의미). `UNIQUE(action_log_id, voter_id)`가 1인 1표·토글·중복 방지를 스키마 레벨에서 보장.
- **voter_id는 저장하지만 어떤 read도 반환하지 않는다.** 저장 이유는 본인 반려 거부·토글·과반 계산뿐. 노출은 카운트(`peer_reject_count`)와 viewer 본인 여부(`viewerHasRejected`)로 한정.

### 2. 익명성 경계 — "저장 ≠ 노출"

- **RLS SELECT는 본인 행만**(`voter_id = auth.uid()`). 멤버가 raw 행을 읽어도 타인의 `voter_id`를 못 본다 → 역추적 불가. INSERT/UPDATE/DELETE 정책 **없음**(클라 deny) → write는 RPC만.
- **카운트는 admin hydrate read로 집계 노출**([kudos-counts.ts](../../apps/web/src/lib/db/reads/kudos-counts.ts) 동형, [ADR-0024](./0024-admin-cache-after-layer1-visibility.md) Layer 1 visibility 이후). **익명성의 실질 메커니즘은 카운트 read의 SQL `select`에 `voter_id`를 아예 포함하지 않는 것이다**(kudos-counts가 `emoji`만 select하듯) — admin client는 RLS를 우회하므로 select 컬럼 통제가 유일한 방어선이다. RLS는 raw 행 직접 조회(클라)만 막는다.
- **본인 반려 여부는 viewer-specific read**([kudos-viewer.ts](../../apps/web/src/lib/db/reads/kudos-viewer.ts) 동형, `.eq('voter_id', viewerId)`). viewerId가 cache argument·cacheTag·SQL filter 세 곳에 모두 남는 ADR-0024 규칙을 그대로 따른다.

### 3. 판정·토글·시간창 RPC (`SECURITY DEFINER`)

`toggle_peer_rejection(p_action_log_id)` 한 함수가 다음을 한 트랜잭션으로 닫는다:

- **본인 반려 거부**: 인증 로그 작성자(`action_logs.user_id`) == 호출자면 거부.
- **토글**: 행 있으면 delete, 없으면 insert(`UNIQUE` 충돌은 멱등 처리).
- **과반 전이**: 매 토글 후 카운트 재계산 → 작성자 제외 과반 도달 시 `action_logs.auto_verify_status = 'peer_rejected'`, 미달 복귀 시 `passed`로 되돌림. status UPDATE는 service_role(RPC) 전용([ADR-0032](./0032-settlement-verification-data-model.md) §4 immutability 예외).
- **48h 시간창**: 챌린지 종료 + 48h 이후 토글 무효(`AC-peer-reject-3`).
- **그룹장 1표**: 그룹장도 일반 voter와 동일하게 1표. `manual_review`·전용 권한 없음(`AC-peer-reject-4`·`AC-owner-load-1·2`).
- **RPC 가드**: `set search_path = public` 고정(search-path 하이재킹 방어) + `revoke execute from public, anon` · `grant execute to authenticated, service_role` 을 기존 DEFINER RPC(`0006`·`0021`)와 동일하게 둔다. 함수 소유자는 **비-(anon/authenticated)** 여야 0045/0046 dual-guard 의 서버 분기(`current_user not in (anon, authenticated)`)를 통과한다.
- **doneCount 정합**: `peer_rejected`는 `countsTowardDone=false`([judge.ts](../../apps/web/src/lib/verify/judge.ts) 기존 분기와 일치). ⚠️ **단 이 함수는 현재 doneCount read 경로에 미배선이다** — `current-challenges.ts`·`active-challenge.ts`·RN `challenge-reads.ts` 가 `auto_verify_status` 를 select하지 않아, RPC만 배포하면 `peer_rejected` 로그가 doneCount에서 빠지지 않는다(EVAL-0022 가 "enforce flip 후속 배선"으로 인정한 gap). **이 read 배선은 EVAL-0025 구현의 선행 조건이다**(§후속 영향).

세 구현 파라미터는 기존 구조에 정합하도록 **본 ADR이 확정한다**(과거 "open"이던 항목 — §Consequences 참조).

#### 3a. 과반 분모 N = 서약 완료 챌린지 참가자

- **N = 해당 챌린지의 `challenge_participants` 중 `signed_at IS NOT NULL` 인 수.** 그룹 멤버 전체가 아니다 — 그 챌린지에 서약하지 않은 그룹원은 목표·기간 맥락을 공유하지 않아 평가 자격이 없다. ⚠️ **기존 doneCount/정산 분모(`current-challenges.ts`)는 `signed_at` 필터 없이 전체 참가자를 쓴다** — active 챌린지는 전원 서약이라 실무 차이는 작지만, RPC 구현 시 두 분모 기준(signed 필터 유무)을 통일해야 한다(PO 판단 ①).
- 작성자 제외 (N−1)명이 투표 표본, **과반 = `peer_reject_count > (N−1)/2`**(`AC-peer-reject-2`). `challenge_participants`에 탈퇴/활성 컬럼이 없으므로(0001, `signed_at`·`joined_at`만) N은 **토글 시점에 재계산**한다 — 중도 합류분 반영.

#### 3b. 48h 기준 시각 = ADR-0030 종료 cutoff 재사용

- 48h 윈도우 기준 시각은 [ADR-0030](./0030-early-close-settlement-cutoff.md)이 정한 **챌린지 종료 시각**을 그대로 쓴다: `challenges.closed_at`(조기 종료) SoT, `NULL`이면 자연 종료(`duration_days`)로 폴백. **새 시각 컬럼·SoT를 만들지 않는다.**
- "정산 전 48h"(`AC-peer-reject-3`)의 정산은 챌린지 종료 후이므로, peer-reject 유효 구간 = 종료 시각 + 48h. RPC가 이 시각 이후 토글을 거부.

#### 3c. 전이 대상 = `passed` 로그 한정 (passed ↔ peer_rejected 단일 쌍)

- peer-reject status 전이는 **`auto_verify_status='passed'` 로그에만** 적용한다. peer-reject의 목적은 "기계 θ가 못 잡고 **통과(passed)** 시킨 맥락적 사기"를 사람이 뒤집는 것이다([judge.ts](../../apps/web/src/lib/verify/judge.ts) "기본 passed 친구 신뢰").
- 그래서 전이는 **passed → peer_rejected, 복원은 peer_rejected → passed** 단일 쌍이다. 직전 judge status가 항상 `passed`로 고정이라 **복원값이 자명** — 직전값 보존 컬럼이 불필요하다(미결정이던 "복원 허용 범위" 해소).
- `failed`(enforce 시 이미 제외, 중복) · `pending`(판정 전) · `manual_review`(복원 시 직전값 보존 필요)는 1차 범위 밖. **manual_review 포함은 후속**(보존 메커니즘 동반 시).
- **경합 없음**: judge는 인증 작성 직후 1회만 status를 write하고 재실행하지 않는다([judge.ts](../../apps/web/src/lib/verify/judge.ts)). peer-reject는 그 이후라 같은 컬럼이라도 시간 분리 — judge가 `peer_rejected`를 덮는 일이 없다.

### 범위 경계

- **본 ADR 범위 밖**(별도 산출물): 반려율·운영 알림 AnalyticsEvent(EVAL-0026 + PRD §9.1 별도 spec) / 48h 정산 마감 트리거(EVAL-0008, 역방향 의존) / 자동검증 신호·θ 판정(EVAL-0021·0022) / 🟨 1탭 UI 배선(migration·구현 task).
- **게이트**: 익명 반려는 **금전성이 아니고 θ와 무관**하므로 G2(법무) 게이트와 무관하다. 본 ADR accepted + PO 승인만으로 EVAL-0025의 `[adr:0038][po:reaction-storage]` 차단이 풀린다.

## Alternatives Considered

### 1. `kudos` union 확장 (🟨를 `KUDOS_EMOJIS`에 추가, `kudos` 테이블 재사용)

- **Pros**: 테이블 0개 추가. `toggleKudos`·`kudos-viewer`·`kudos-counts` 인프라를 그대로 사용.
- **Cons**: `kudos`는 비익명(viewer가 `user_id` read) — 익명성과 정면 충돌, kudos read만 특수 분기시켜야 해 경계가 오염된다. `KUDOS_EMOJIS`가 바뀌면 PRD §9.1 analytics 1:1이 깨진다. 표현(kudos)과 판정 입력(반려)의 의미가 한 테이블에 섞인다.
- **Why not**: 익명성·analytics 1:1·의미 분리 셋을 모두 위반. ADR-0032가 명시적으로 "별도 spec"을 요구한 이유가 이것이다.

### 2. `action_logs` 카운트 컬럼만 (voter 신원 미저장, `peer_reject_count integer`만 서버 UPDATE)

- **Pros**: 테이블 0개. read가 컬럼 하나.
- **Cons**: voter 신원이 없어 토글(중복 방지)·본인 반려 거부·"이미 반려했나" 판정이 불가능하다. 누적 카운트는 증가만 가능해 토글 복원(과반 미달 → `passed`)을 못 한다.
- **Why not**: `AC-peer-reject-2·3`(본인 반려 거부·토글·복원)을 충족할 수 없다.

### 3. `peer_rejections`에 voter_id 저장하되 SELECT를 그룹 멤버 전체에 개방

- **Pros**: 카운트 read가 단순 `count(*)` — admin hydrate 불필요.
- **Cons**: 멤버가 raw 행을 읽으면 `voter_id`가 노출돼 "누가 반려했는지" 역추적이 가능하다.
- **Why not**: `AC-peer-reject-1`(익명) 정면 위반. 익명성은 이 기능의 신뢰 전제(그룹장 이해상충 제거)라 양보 불가.

## Consequences

### 긍정적

- 익명성이 **"저장은 voter_id, 노출은 카운트만"**의 경계로 강제된다 — RLS SELECT 본인 행 한정 + admin hydrate 집계라 `voter_id`가 어떤 클라 응답에도 실리지 않는다.
- kudos 인프라(테이블 형태 · viewer/counts read · [ADR-0024](./0024-admin-cache-after-layer1-visibility.md) hydrate)를 **형태만 복제** — 새 패턴 없음, 리뷰·학습 비용 최소.
- 판정·과반·토글·시간창이 `SECURITY DEFINER` RPC 한 경로 — RN 직접 RPC/BFF에서도 정합·익명·권한이 DB 안에서 닫힌다.
- analytics 1:1 보존(kudos union 무변경) — PRD §9.1 깨짐 없음. 반려 이벤트는 EVAL-0026에서 별도 정의.

### 부정적 / 비용

- 테이블 1개 + RPC 1개 추가. 카운트가 admin hydrate 경유라 `kudos-counts` 동형 read를 새로 작성해야 한다.
- **`manual_review` 로그는 1차 peer-reject 대상이 아니다**(§3c) — 기계가 확신 못 한 인증을 피어가 반려하려면 직전값 보존 메커니즘이 필요해 후속으로 분리했다. 그동안 manual_review는 카운트 인정 상태로 남는다.
- forward-only migration(POC 정책, down 없음) — `peer_rejected` 전이 후 되돌리기는 RPC 복원 경로(`peer_rejected → passed`)로만.

### 후속 영향

- **migration**(`supabase/migrations/00NN_peer_rejections.sql`): 테이블 + RLS(SELECT 본인 행, write 없음) + `toggle_peer_rejection` RPC + doneCount 정합. 본 ADR을 근거로 인용(spec-required 경로).
- **BE_SCHEMA.md 갱신**: `peer_rejections` 테이블 + RLS predicate + `auto_verify_status='peer_rejected'` 전이 규칙을 SoT 문서에 반영.
- **read 추가 + doneCount 배선(선행 조건, M2)**: `kudos-counts`/`kudos-viewer` 동형 hydrate read([ADR-0024](./0024-admin-cache-after-layer1-visibility.md) Layer 1 경계 이후) 추가 + doneCount read 3경로(`current-challenges.ts`·`active-challenge.ts`·RN `challenge-reads.ts`)에 `auto_verify_status` select + `countsTowardDone` 적용을 **배선**한다. 이 배선 없이 RPC만 배포하면 `peer_rejected` 가 doneCount에서 안 빠진다 — EVAL-0025 AC에 doneCount 제외 실측을 추가 권고.
- **EVAL-0025 차단 해제**: 본 ADR accepted + PO 승인 시 `[adr:0038][po:reaction-storage]` 토큰 해소(선행 task EVAL-0020은 done). G2와 무관.
- **PO 확인이 필요한 정책 판단**(본 ADR이 기존 구조 정합으로 _제안_ 확정, 수락 시 fix): ① 분모 N = 서약 완료 챌린지 참가자(그룹 멤버 아님, §3a) ② 48h 기준 = ADR-0030 종료 cutoff 재사용(§3b) ③ 전이 대상 passed 한정·manual_review 후속(§3c).

## 용어집

- **peer rejection(피어 반려)**: 멤버가 다른 사람의 인증 사진을 익명으로 "이건 아니다"라고 표시하는 행위. 과반이면 해당 인증을 `peer_rejected`로 떨군다.
- **익명 집계**: 누가 눌렀는지는 숨기고 합계(카운트)만 노출하는 방식. 저장은 voter 신원을 하되 read에서 가린다.
- **kudos**: 응원 이모지(🔥💪👏) reaction. 표현 목적이라 비익명이고 판정에 쓰이지 않는다.
- **doneCount**: 챌린지에서 "완료로 인정되는 인증" 수. `peer_rejected`는 여기서 제외된다.
- **RLS(Row Level Security)**: Postgres 행 단위 접근 제어. 여기선 "본인 반려 행만 SELECT"로 익명성을 지킨다.
- **SECURITY DEFINER RPC**: 함수 정의자 권한으로 도는 Postgres 함수. RLS를 통과해 service_role 작업(과반 판정·status 전이)을 한 트랜잭션으로 닫는다.
- **admin hydrate**: ADR-0024 — Layer 1 visibility 판정 이후 admin client로 보조 데이터(카운트 등)를 채우는 read 단계. voter_id 같은 민감 컬럼은 집계로만 노출.
- **G2 게이트**: ⓑ적립 포인트 법무 검토 선행 게이트. 익명 반려는 금전성이 아니라 G2와 무관.
