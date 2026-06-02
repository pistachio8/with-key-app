# ADR-0001: Supabase 신규 키 체계(publishable / secret) 채택

**Date**: 2026-05-07
**Status**: accepted
**Deciders**: 프로젝트 owner (pistachio8)

## Context

Supabase는 2024년 후반에 새 API key 체계를 도입했다 — `sb_publishable_*`(클라이언트 공개)와 `sb_secret_*`(서버 비밀). 기존 anon key + service_role key 와 한동안 병존한다.

문제는 **외부 코드 유입 경로**의 비대칭성이다. shadcn registry, Supabase 공식 문서 일부, 외부 블로그·튜토리얼·skill 결과물은 여전히 레거시 명칭(`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)을 생성한다. 두 체계가 한 코드베이스에 섞이면 어느 키가 어디로 흘러가는지 추적이 어렵고, 무엇보다 `service_role` 같은 위험한 이름이 서버 외부로 새는 사고가 일어나기 쉽다.

## Decision

with-key 전 코드베이스에서 **신규 체계만 사용**한다.

| 용도 | 환경변수 이름 | 키 prefix | 노출 |
|---|---|---|---|
| 클라이언트 공개 | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_*` | 클라이언트 번들 포함 가능 |
| 서버 비밀 | `SUPABASE_SECRET_KEY` | `sb_secret_*` | 서버만 — `NEXT_PUBLIC_` 접두 **금지** |
| 프로젝트 URL | `NEXT_PUBLIC_SUPABASE_URL` | — | 공개 |

레거시 명칭(`*_ANON_KEY`, `*_SERVICE_ROLE_KEY`)은 정합성을 유지할 모든 surface에서 **금지**.

## Alternatives Considered

### 1. 레거시 anon + service_role 그대로 사용
- **Pros**: 외부 튜토리얼·skill 결과물과 즉시 호환. 학습 자료가 압도적으로 많음.
- **Cons**: 키 의도가 이름만 보고 안 드러남. JWT 그대로 노출 (publishable처럼 prefix가 의도를 명시하지 않음).
- **Why not**: Supabase 공식 권장 방향이 신규 체계이고, 보안 표면 가독성이 명확히 떨어진다. 외부 코드 유입은 어차피 발생하므로 "치환 룰 1개"가 "병존 검증 N개"보다 단순.

### 2. 두 체계 병존 (마이그레이션 점진 진행)
- **Pros**: 외부 코드 그대로 paste 가능, 단계적 이주 부담 분산.
- **Cons**: 코드/문서/CI에서 동시 검증 필요, `scripts/check-env.ts` 같은 게이트가 4개 변수를 동시에 체크해야 함, 휴먼 에러 폭 증가.
- **Why not**: POC 단계에서 변수 4개를 동시에 관리할 가치 대비 사고 위험이 큼.

## Consequences

### Positive
- 키 의도가 prefix(`sb_publishable_` vs `sb_secret_`)로 첫눈에 드러남.
- 외부 코드를 옮길 때 **단일 치환 룰**(`ANON_KEY → PUBLISHABLE_KEY`, `SERVICE_ROLE_KEY → SECRET_KEY`)만 적용하면 됨.
- `.claude/rules/common/supabase-keys.md` 가 프로젝트-tier 강제 룰로 정착, agent 결과물에 자동 적용.

### Negative
- 외부 skill·registry 결과물에서 레거시 명칭이 만들어지면 매번 치환 필요 (자동화 미적용).
- Supabase 공식 문서 자체가 일부 surface에서 여전히 레거시 사용 — 신규 컨트리뷰터가 혼동할 가능성.

### Risks
- Supabase가 키 체계를 또 변경할 가능성 (낮음 — 신규 prefix 방식이 보안적으로 명확).
- 빌드 surface 어딘가에 레거시 변수가 잠복하면 검출이 늦을 수 있음 → `scripts/check-env.ts`와 `pnpm validate:docs` 가 1차 방어, CI 환경 변수 누락 검증이 2차 방어.

## References

- 룰: [`/.claude/rules/common/supabase-keys.md`](../../.claude/rules/common/supabase-keys.md)
- 환경변수 검증 게이트: [`/scripts/check-env.ts`](../../scripts/check-env.ts)
- 클라이언트 사용 지점: [`/src/lib/supabase/client.ts`](../../src/lib/supabase/client.ts) · [`server.ts`](../../src/lib/supabase/server.ts) · [`middleware.ts`](../../src/lib/supabase/middleware.ts)
- 운영 안내: [`/docs/DEPLOY.md`](../DEPLOY.md) · [`/docs/ONBOARDING.md`](../ONBOARDING.md)
