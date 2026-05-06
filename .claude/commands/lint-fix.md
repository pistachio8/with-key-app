---
description: ESLint 자동 수정 (with-key)
agent: build
---

> **전제**: `with-key` 저장소 루트에서 실행한다.

아래 명령을 실행하고 남는 오류를 모두 수정해줘.

```
pnpm lint --fix
```

- `eslint.config.mjs`(Next flat config) 외의 임의 설정 추가/플러그인 설치는 하지 않는다. 실행 자체가 실패하면 원인만 보고한다.
- `--fix`로 해결되지 않는 오류는 수동으로 수정하되, 아래 가드레일은 건드리지 않는다.
  - `src/lib/validators/` 의 zod 스키마 시그니처 (타입 SoT)
  - `src/lib/analytics/track.ts` 의 `AnalyticsEvent` 유니온
  - `middleware.ts` 의 auth 가드 로직 / matcher
  - `supabase/migrations/*.sql`
- 타입 추론 수정이 필요하면 단정(`as unknown as T`)보다 **zod 스키마/타입 정의 개선**을 우선한다.
- 포맷 관련 경고는 `pnpm format`으로 일괄 정리할 수 있다.

## 보고 형식

- 자동 수정 건수 / 수동 수정 건수
- 남은 경고/에러 목록
- 변경된 파일 목록
