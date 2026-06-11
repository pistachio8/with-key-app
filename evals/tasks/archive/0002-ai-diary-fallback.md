# EVAL-0002: AI 일기 — 타임아웃 폴백 동작

**Status**: pending baseline
**Tier**: core (AI 일기 신뢰성 — PRD §5.3 AC-4)

## Prompt (agent에 그대로 입력)

> `src/lib/ai/` 에 OpenAI 호출 + 키워드 커버리지 검증 + 폴백 로직을 점검하는 단위 테스트를 추가하세요. 4.5초 타임아웃 시뮬레이션, 키워드 커버리지 < 1 시 `templateFallback()` 폴백, 프롬프트/응답 본문이 로그에 남지 않는지 검증해야 합니다.

## Pass criteria

| 기준                                                                   | 검증 방법                                   |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| 타임아웃 4.5s 시 폴백 호출                                             | `vi.useFakeTimers` + `AbortController` mock |
| 키워드 커버리지 < 1 → 폴백                                             | mock 응답에 키워드 누락 케이스              |
| 프롬프트/응답 본문 미로그                                              | `console.*` spy → 본문 문자열 매칭 0건      |
| 메타만 로그 (`latencyMs · fallback · keywordCoverage · promptVersion`) | spy 인자 검증                               |
| `pnpm test` pass                                                       | (자동)                                      |

## One-shot 정의

prompt 한 번 입력 후 추가 지시 없이 4개 기준 모두 통과 → `one_shot=true`.

## See also / Cross-module dependencies

- AI 일기 가드레일: [`../../.claude/AGENTS.md`](../../.claude/AGENTS.md) §AI 일기
- 키워드 풀 (depends on, POC 동결): [`../../src/lib/keywords/pool.ts`](../../src/lib/keywords/pool.ts)
- 본체 (depends on): [`../../src/lib/ai/`](../../src/lib/ai/)
