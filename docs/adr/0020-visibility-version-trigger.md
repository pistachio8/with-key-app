# ADR-0020 — visibility_version trigger

- **Status**: Accepted
- **Date**: 2026-05-26
- **Phase**: SNS Cache Strategy Blueprint v4 — Phase 2

## Context

SNS cache plan v4 §Layer 1 (Visibility Decision) 의 캐시 키에는 "어떤 멤버 집합이 이 챌린지의 피드를 볼 수 있는가" 를 식별하는 단조 counter 가 필요하다. 캐시 tag 예시:

```
user-${uid}-feed-${challengeId}-v${visibility_version}
```

멤버십이 바뀌면 (`challenge_participants` INSERT/DELETE) 모든 viewer 의 캐시가 자동 무효화되도록 counter 가 자동 증분되어야 한다.

대안:

- **A. App layer counter**: Server Action 에서 직접 증분. 모든 mutate 경로가 빠짐없이 호출해야 — 누락 시 영구 stale.
- **B. DB trigger (채택)**: `challenge_participants` 의 INSERT/DELETE 에 AFTER trigger. App layer 의 어느 경로든 단 한 곳만 — accept_invite RPC, join, leave, kick, signpledge 동시 INSERT — 트리거가 항상 보장.
- **C. Realtime + version stream**: 과도하다 (POC 범위 초과).

## Decision

**B 채택**. `0036_visibility_version.sql`:

1. `challenges.visibility_version BIGINT NOT NULL DEFAULT 0` 컬럼 추가.
2. `public.bump_challenge_visibility()` 함수 — `security definer` + `search_path = public` 으로 schema hijack 방어.
3. `trg_bump_challenge_visibility` trigger — `AFTER INSERT OR DELETE ON challenge_participants`. UPDATE 는 visibility 영향 없어 의도적으로 제외(signed 같은 컬럼 변경).

read 함수: `src/lib/db/reads/visibility-version.ts` — `React.cache` 로 wrap, request scope dedup.

## Consequences

### 안전

- security definer + search_path 고정으로 schema hijack 방어.
- trigger 의 동작 범위는 단 한 컬럼 +1 UPDATE — RLS 우회 surface 최소.
- counter 단조 증가 — overflow 시 BIGINT 가 사실상 무한.

### 성능

- 멤버십 mutate 빈도 매우 낮음 (가입/탈퇴/킥). row 당 1개 추가 UPDATE.
- 캐시 키의 한 segment 로 사용되어 멤버십 변경 시 viewer 별 캐시 모두 자동 무효 (Phase 4 의 list-visible-action-log-ids 무효화 트리거).

### 운영

- forward-only migration (down 없음). 컬럼 drop 필요 시 새 migration.
- 본 PR 만으로는 사용처 없음 — Phase 4 머지까지 dead column (default 0 으로 동작 무변경).

## Links

- plan: [`docs/superpowers/plans/2026-05-26-sns-cache-strategy-blueprint.md`](../superpowers/plans/2026-05-26-sns-cache-strategy-blueprint.md)
- ADR-0019: [`./0019-cache-components-and-service-role-policy.md`](./0019-cache-components-and-service-role-policy.md) — Cache Components 도입 + service-role cache 금지 룰
