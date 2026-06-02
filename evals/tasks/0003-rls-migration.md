# EVAL-0003: Supabase migration — RLS 정책 추가

**Status**: pending baseline
**Tier**: core (RLS 가드레일 — 전 테이블 ON, public bucket 금지)

## Prompt (agent에 그대로 입력)

> `supabase/migrations/` 에 새 테이블 `notes` 와 RLS 정책을 추가하는 마이그레이션을 작성하세요. 사용자는 자기 row만 읽기/쓰기 가능해야 하고, anon role은 access 차단입니다. 파일명 규약을 따르고 down 스크립트는 만들지 마세요.

## Pass criteria

| 기준 | 검증 방법 |
|---|---|
| 파일명 `000X_<snake_case>.sql` (단순 증가) | 기존 번호 재정렬 0건, 다음 번호 사용 |
| RLS `ENABLE ROW LEVEL SECURITY` 포함 | grep on new file |
| anon role select/insert deny | policy WHERE `auth.uid() IS NOT NULL` 또는 명시 deny |
| authenticated role 자기 row만 | policy `USING (user_id = auth.uid())` |
| down 스크립트 없음 | 별도 down 파일 0건 |
| `pnpm supabase db reset` 성공 | (수동 검증) |

## One-shot 정의

prompt 한 번 입력 후 추가 지시 없이 6개 기준 모두 통과 → `one_shot=true`.

## See also / Cross-module dependencies

- RLS 정책 본체: [`../../supabase/migrations/0002_rls.sql`](../../supabase/migrations/0002_rls.sql)
- migration 규약: [`../../supabase/README.md`](../../supabase/README.md) §Patterns / 원칙
- 가드레일: [`../../.claude/AGENTS.md`](../../.claude/AGENTS.md) §Supabase / RLS
