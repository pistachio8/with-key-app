# docs/adr/

with-key의 **풀 포맷 ADR(Nygard)** 디렉터리. 한 결정당 한 파일.

## Purpose

이 프로젝트의 결정 기록은 두 층으로 나뉩니다 — 어디에 쓸지 빠르게 판단하세요.

| 위치 | 형식 | 적용 대상 |
|---|---|---|
| [`../TEAM_SHARE_DECISIONS.md`](../TEAM_SHARE_DECISIONS.md) | ADR-lite (D-NNN, 본문 ≤30줄) | 일상적 결정 — 매주 추가되는 것들 (feat 결정 · 정산 수단 · UI 미세 결정 등) |
| `docs/adr/NNNN-*.md` (이 폴더) | Nygard 풀 포맷 | **되돌리기 비용이 큰** 결정 — 깊은 Context · 거부된 대안 · 결과적 risk 까지 적어야 의미 있는 것 |
| [`../DECISIONS.md`](../DECISIONS.md) | (skill-managed 인덱스) | `architecture-decision-records` 스킬이 세션 중 자동 append. 위 두 채널과 별도 |

## When to use Nygard ADR (이 폴더)

다음 중 **2개 이상** 해당될 때 ADR-lite 대신 풀 ADR 작성:

- 되돌릴 때 코드 / 데이터 / 외부 의존성 동시 변경 필요
- "왜 안 했는가"가 "왜 했는가"만큼 중요 (거부된 대안에 시간 들어감)
- 결정의 영향이 1년 이상 누적될 가능성
- 6개월 후 누군가 같은 함정에 빠질 위험

## Naming

- `NNNN-<short-kebab-title>.md` — 4-digit zero-padded, 단순 증가
- 번호는 한 번 부여하면 재사용 금지 (deprecated 처리)

## Template

[`../DECISIONS.md`](../DECISIONS.md) 의 Nygard 템플릿을 그대로 사용. 섹션은:

1. Context — 무엇이 문제·강제·제약인가 (2~5 문장)
2. Decision — 채택한 변경 (1~3 문장)
3. Alternatives Considered — 거부된 대안과 그 이유 (**필수**)
4. Consequences — Positive · Negative · Risks

## See also

- 일상적 결정 로그: [`../TEAM_SHARE_DECISIONS.md`](../TEAM_SHARE_DECISIONS.md)
- 품질 게이트 (검증 의무): [`../QUALITY_GATE.md`](../QUALITY_GATE.md)
- 절대 원칙 (가드레일): [`../../.claude/AGENTS.md`](../../.claude/AGENTS.md)
