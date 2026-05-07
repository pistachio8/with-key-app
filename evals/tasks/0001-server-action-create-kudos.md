# EVAL-0001: Server Action — kudos 생성

**Status**: pending baseline
**Tier**: core (Server Action 기본 패턴 검증)

## Prompt (agent에 그대로 입력)

> `src/app/(app)/challenge/[id]/_actions.ts` 에 `createKudos` Server Action을 추가하세요. 입력 zod schema는 `src/lib/validators/kudos.ts` 의 기존 스키마를 재사용하고, 인증되지 않은 호출은 `unauthorized` 에러로 응답해야 합니다. 성공 시 캐시 무효화도 포함하세요.

## Pass criteria

| 기준 | 검증 방법 |
|---|---|
| zod schema 재사용 (직접 정의 금지) | 코드 grep `z.object\(` in `_actions.ts` → 0건이어야 |
| 인증 가드 통과 | [`src/lib/auth/with-user.ts`](../../src/lib/auth/with-user.ts) 패턴 사용 |
| Server Action 마커 | `"use server"` directive 또는 파일 단위 일관 |
| 캐시 무효화 | `revalidatePath` 또는 `revalidateTag` 호출 |
| typecheck · lint · test 모두 pass | `pnpm typecheck && pnpm lint && pnpm test` |

## One-shot 정의

agent에게 위 prompt 한 번 입력 후, **추가 지시 없이** 모든 pass criteria 통과 → `one_shot=true`.

## See also / Cross-module dependencies

- 가드레일 본체: [`../../.claude/AGENTS.md`](../../.claude/AGENTS.md) §아키텍처
- zod SoT 정책: [`../../docs/QUALITY_GATE.md`](../../docs/QUALITY_GATE.md) §타입과 데이터 계약
- validator (depends on): [`../../src/lib/validators/kudos.ts`](../../src/lib/validators/kudos.ts)
