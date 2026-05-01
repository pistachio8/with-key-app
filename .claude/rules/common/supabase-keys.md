# Supabase 키 네이밍 (프로젝트 기준점)

> 이 프로젝트는 Supabase의 **신규 키 체계**(2024 말 도입)를 기준으로 사용합니다. 다른 skill·문서·튜토리얼이 레거시 이름을 사용하더라도 이 규칙이 우선입니다.

## 표준 env 변수

| 용도 | 변수 이름 | 키 접두 | 노출 범위 |
|------|----------|---------|----------|
| 클라이언트 공개 키 | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_*` | 클라이언트 번들 포함 가능 |
| 서버 전용 비밀 키 | `SUPABASE_SECRET_KEY` | `sb_secret_*` | 서버만 — `NEXT_PUBLIC_` 접두 **금지** |
| 프로젝트 URL | `NEXT_PUBLIC_SUPABASE_URL` | — | 공개 |

## 금지 (레거시 명칭)

다음 이름은 이 프로젝트에서 **사용하지 않습니다**:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`로 대체
- `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY`로 대체

Supabase 공식 문서·shadcn registry·블로그 예시 중 일부는 아직 레거시 이름을 사용하므로, 외부 코드를 옮겨올 때는 **반드시 본 규칙의 이름으로 치환**합니다.

## 정합성을 유지할 파일

- [`src/lib/supabase/client.ts`](../../../src/lib/supabase/client.ts)
- [`src/lib/supabase/server.ts`](../../../src/lib/supabase/server.ts)
- [`src/lib/supabase/middleware.ts`](../../../src/lib/supabase/middleware.ts)
- [`scripts/check-env.ts`](../../../scripts/check-env.ts)
- [`.env.example`](../../../.env.example)

위 파일은 항상 본 규칙에 정렬되어야 합니다. skill이나 외부 템플릿이 `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`를 생성하면 즉시 `PUBLISHABLE_KEY`로 치환하세요.

## skill 정책

전역 `supabase` skill은 레거시 네이밍(`ANON_KEY`)을 사용할 수 있습니다. 이 프로젝트에서는 **skill 텍스트보다 본 규칙이 우선**합니다. skill을 강제로 교체·업데이트할 필요는 없고, 생성된 결과물에서 이름만 치환하면 됩니다.
