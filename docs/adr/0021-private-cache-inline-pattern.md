# ADR-0021: `'use cache: private'` 는 inline directive 패턴으로 사용한다 (ADR-0019 일부 supersede)

**Date**: 2026-05-26
**Status**: accepted
**Deciders**: pistachio8
**Supersedes (in part)**: [ADR-0019](0019-cache-components-and-service-role-policy.md) — `viewerCached` wrapper 결정 부분만 폐기. 서비스 롤 캐시 금지 · `cacheComponents` 단독 PR 정책은 유효.

## Context

ADR-0019 Phase 1a 는 viewer-specific private cached read 의 컨벤션을 한 곳에 모으기 위해 `src/lib/cache/private.ts` 에 `viewerCached(read, { tag, life })` wrapper 를 신설했다. wrapper 의 본문은 아래 형태였다.

```ts
// src/lib/cache/private.ts (지금은 삭제됨)
export function viewerCached(read, options) {
  return async function readWithPrivateCache(...args) {
    "use cache: private";
    const tags = typeof options.tag === "function" ? options.tag(...args) : options.tag;
    cacheTag(...tags);
    cacheLife(options.life);
    return read(...args);
  };
}
```

Phase 3 에서 `getViewerKudosForLog = viewerCached(fetchViewerKudosForLog, { tag: (logId, viewerId) => ..., life: "minutes" })` 호출이 추가되자 `/challenge/[id]/dashboard` 의 정적 페이지 생성 단계에서 다음 에러로 빌드가 실패했다.

```
Error: Functions cannot be passed directly to Client Components unless you
  explicitly expose it by marking it with "use server".
  {tag: function tag, life: "minutes"}
        ^^^^^^^^^^^^
    at src/lib/cache/private.ts:33:3
    at src/lib/db/reads/kudos-viewer.ts:30:37
    at src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx:4:1
```

Next.js 16 공식 문서 (`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`) §Cache key 및 §Serialization 가 원인을 설명한다.

> When a cached function references variables from outer scopes, those variables are **automatically captured and bound as arguments**, making them part of the cache key.
>
> Unsupported types: **Functions (except as pass-through)**.

즉 `'use cache: private'` 본문에서 outer scope 의 `options`(특히 `options.tag` 함수)와 `read` 함수를 클로저로 참조하는 순간, 컴파일러가 이들을 cache key 직렬화 대상으로 묶는다. 함수는 직렬화 불가 → 빌드 시점에 폭발한다. 이 제약은 `'use cache: private'` 의 본질적 동작이라 wrapper API 를 어떻게 다듬어도 우회할 수 없다 (caller 가 직접 인자로 string tag 를 넘기는 경로로 재설계하면 wrapper 의 존재 이유 자체가 사라진다).

ADR-0019 §Alternatives Considered 의 "Call `cacheTag()` and `cacheLife()` directly in every read function" 대안이 사실상 강제 채택안이 된 셈이다.

## Decision

viewer-specific private cached read 는 **각 read 함수 본문 첫 줄에 `"use cache: private"` directive 를 직접 선언**하고, 같은 함수 안에서 `cacheTag(...)` · `cacheLife(...)` 를 호출한다. wrapper 함수를 거치지 않는다.

```ts
// src/lib/db/reads/kudos-viewer.ts
export async function getViewerKudosForLog(actionLogId: string, viewerId: string) {
  "use cache: private";
  cacheTag(`user-${viewerId}-kudos-${actionLogId}`);
  cacheLife("minutes");

  const supabase = await createClient();
  // ... actual read
}
```

규칙:

- viewer-keyed tag 컨벤션 `user-${viewerId}-${domain}-${key}` 는 ADR-0019 그대로 유지.
- `cacheLife` 인자는 string preset (`"minutes"` · `"hours"` · `"max"` ...) 또는 plain object 만 사용 — closure 변수 참조 금지.
- closure 로 캡처되는 값은 **primitive(string · number · boolean · null · undefined) · plain object · array** 만 허용. 함수 · 클래스 인스턴스 · `URL`/`Map`/`Set` 등은 금지.
- service-role / `adminClient` 결과는 user-facing private cache 에 저장하지 않는다 — ADR-0019 §Decision 4번 그대로 유효.
- `cacheComponents: true` 단독 PR 정책 (ADR-0019) 도 그대로 유효.

## Alternatives Considered

### 1. wrapper API 를 재설계해 tag 함수를 closure 가 아닌 인자로 전달

- **Pros**: "한 곳 강제" 원칙 유지.
- **Cons**: 결국 caller 가 tag 문자열을 직접 만들어 wrapper 에 인자로 넘기는 형태가 되는데, 그러면 wrapper 가 `cacheTag` 한 줄을 감싸는 trivial 함수로 축소된다. 직접 inline 호출과 비교해 추상화 이득이 없고 호출 경로만 한 단계 늘어난다.
- **Why not**: 잉여 추상화. inline 패턴이 같은 컨벤션을 강제하면서 더 단순.

### 2. PR template 또는 ESLint rule 로 inline 패턴을 강제

- **Pros**: 가드레일 갱신과 별개로 자동 검출 가능.
- **Cons**: `'use cache: private'` directive 와 인접 호출 패턴을 안전하게 매칭하는 lint rule 작성 비용 + 유지 비용.
- **Why not**: 사용처가 현재 4개 (`photo-signed-url` · `list-visible-action-log-ids` · `action-log-hydrate` · `kudos-viewer`) 로 적음. 가드레일 (`AGENTS.md §Cache Components`) 의 "왜" 1줄로 회귀 위험을 낮추는 게 비용 대비 효과적.

### 3. ADR-0019 본문을 in-place 수정

- **Pros**: 정보 한 곳에 모임.
- **Cons**: 머지된 ADR 은 의사결정 시점의 기록이므로 소급 수정하면 "그때 왜 이렇게 결정했나" 의 컨텍스트가 사라진다.
- **Why not**: ADR 운영 원칙 위반. 본 ADR-0021 로 supersede 표기.

## Consequences

### 긍정적

- 빌드가 복구되어 `/challenge/[id]/dashboard` 정적 페이지 생성이 다시 동작한다 (`pnpm build` 34/34 pass).
- inline 패턴은 Next.js 공식 문서 (`use-cache-private.md` 의 `getRecommendations` 예시) 와 정확히 일치 — 학습/이관 비용 최소.
- closure 캡처 함수로 인한 동일 회귀가 발생하면 단일 read 파일에서 끝나고, 전 영역으로 번지지 않는다.

### 부정적 / 비용

- 컨벤션 강제가 가드레일 문서와 리뷰에 의존하게 된다 (wrapper 가 사라졌으므로 코드 단에서의 단일 진입점이 없다).
- 4 개 read 모두 동일한 `cacheTag` 네이밍 컨벤션을 직접 따라야 한다 — 새 cached read 추가 시 가드레일 §Cache Components 확인 필수.

### 후속 영향

- `src/lib/cache/private.ts` 삭제 (이미 본 PR 에서 수행).
- `src/lib/db/reads/kudos-viewer.ts` 를 inline 패턴으로 재작성 (이미 본 PR 에서 수행).
- `AGENTS.md §Cache Components` 의 wrapper 강제 조항을 inline 강제 + 함수 closure 캡처 금지로 갱신 (이미 본 PR 에서 수행).
- 후속 read 추가 시 본 ADR 의 "closure 캡처 허용 타입" 규칙을 PR 리뷰 체크리스트로 사용.
- `docs/superpowers/plans/2026-05-26-sns-cache-strategy-blueprint.md` · `docs/superpowers/specs/2026-05-26-kudos-cache-tags.md` 의 `viewerCached` 언급은 사후 기록(이미 머지)이라 본문 수정하지 않고 본 ADR 링크로 보강한다 (별 PR 또는 후속 작업).
