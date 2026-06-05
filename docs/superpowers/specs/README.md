# docs/superpowers/specs/

with-key의 **설계 결정 spec** 디렉터리. 한 결정/설계당 한 파일.

## Purpose

`docs/superpowers/` 산하의 세 종류 문서 중, 본 디렉터리는 "**설계 결정 + 대안 비교 + 트레이드오프**"가 필요한 작업을 담습니다.

| 위치                                | 형식                    | 적용 대상                                                          |
| ----------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| [`../plans/`](../plans)             | YYYY-MM-DD-`<topic>`.md | 작업 단위 계획 — 의뢰서, 작업 단계, 검증                           |
| `docs/superpowers/specs/` (이 폴더) | YYYY-MM-DD-`<topic>`.md | 설계 결정 — 왜 이렇게 푸는가, 대안 비교, 트레이드오프              |
| [`../../adr/`](../../adr)           | NNNN-`<topic>`.md       | 되돌리기 비용이 큰 결정 — 깊은 Context · 거부된 대안 · 결과적 risk |

ADR과 spec의 차이는 **되돌리기 비용**입니다. spec은 가역적 설계 결정에, ADR은 한 번 결정하면 복구 비싼 결정에 씁니다. 작성자가 적절한 쪽을 골라 작성하고, 리뷰어가 적정성을 판단합니다.

## spec-required 경로 — spec 권장 3개

[`../../../AGENTS.md`](../../../AGENTS.md) §4 매핑상, 다음 3개 경로 변경은 spec 작성이 권장됩니다.

| 경로                                  | 이유                                                         |
| ------------------------------------- | ------------------------------------------------------------ |
| `src/lib/validators/**`               | 도메인 7개가 기능 진화 따라 빈번히 변경 — ADR이면 인플레이션 |
| `apps/web/src/lib/analytics/track.ts` | PRD §9.1과 1:1 동기화 — 이벤트 추가/변경 시 근거 보존        |
| `src/lib/ai/**` (PROMPT_VERSION bump) | 프롬프트 가역 · A/B 비교 가능 — promptVersion이 롤백 키      |

CI(`scripts/check-spec-required.mjs`)가 이 경로 변경에 spec(또는 ADR) 동반이 없으면 stderr 경고를 출력합니다(soft). 위 spec 권장 경로라도 작성자가 ADR로 격상해도 무방합니다(보수적 작성에 페널티 없음).

## Naming

`YYYY-MM-DD-<short-kebab-title>.md` — 날짜 prefix로 시간순 정렬. 같은 날짜·같은 topic이면 `pnpm new`가 `-2`, `-3` suffix를 자동 부여.

## Template

[`../templates/spec.md`](../templates/spec.md) — frontmatter(`spec` · `title` · `author` · `date` · `status`) + Summary / Why / Impact Scope / Design / Alternatives / Verification / Rollout / Out of scope 섹션.

새 spec 시작: `pnpm new spec <topic-kebab>` — 오늘 날짜 자동 부여.

## See also

- 절대 원칙 (가드레일): [`../../../AGENTS.md`](../../../AGENTS.md) §3
- 품질 게이트 (검증 의무): [`../../QUALITY_GATE.md`](../../QUALITY_GATE.md)
- ADR 운영: [`../../adr/README.md`](../../adr/README.md)
- 일상적 결정 로그: [`../../TEAM_SHARE_DECISIONS.md`](../../TEAM_SHARE_DECISIONS.md)
