# PM Plugin Adapter

PM 산출물을 하네스 표준 포맷으로 들여오는 어댑터. 두 모드(Plugin / Native)가 있고,
**Normalized PRD 이후 backlog pipeline은 두 모드가 동일**하다(원칙 4·D8).

## 핵심 계약 (하드 의존 — 도구가 아니라 아티팩트 모양에 의존)

- PRD: 각 Feature에 `AC-<feature>-<n>` (측정 가능한 수용 기준)
- Job Story: situation / motivation / outcome
- Test Scenario: Given / When / Then + expected
- Acceptance Criteria: pass/fail 판정 가능
- Risks / Assumptions: 각 항목에 영향·완화

## Plugin Mode

pm-execution / pm-skills-ko 등으로 만든 raw 산출물을 normalize.

입력(raw) → `.agents/pm/raw/`에 그대로 저장:

- raw PRD / raw Job Stories / raw Test Scenarios / raw Acceptance Criteria / raw Risks·Assumptions

normalize 규칙:

1. 각 raw 파일에 표준 헤더 부여 — `Source: <tool> <date>`, AC에 `AC-<feature>-<n>` ID.
2. spine 인용 슬롯 — Job/TS가 어느 PRD AC에서 나왔는지 `Parent: PRD-AC-<id>`.
3. 트랙 슬롯 — 각 Feature에 `Track: port|greenfield`(미정이면 `TBD`, create-agent-tasks에서 확정).
4. 도구 메타·민감정보 제거.

출력(normalized) — spine 노드(job stories)는 D10 spine 홈에, 나머지 PM 번들은 `docs/pm/`에(ADR-0031 §1: 인스턴스→`docs/`. 머시너리 `.agents/pm`엔 templates·raw만):

- `docs/stories/<date>-<feature>-job-stories.md` — **job-stories spine 홈**(05 §2 D10: Job Story↔Eng Story 대칭). `create-job-stories` 워크플로 출력처와 일치. **왜**: D10 가 Job Story 홈을 `docs/stories/`로 못박았고, PM-INSTANCE-HOME 방향 A 가 새 `docs/` 홈을 정의한 대상은 test-scenarios·AC·risks 뿐(job-stories·prd 는 기존 홈 보유) — job-stories 를 `docs/pm/` 에 두던 건 방향 A 의 과잉적용 편차였다(DECISION_NEEDED 2026-06-05 정정).
- `docs/pm/prd.md` — AC id 인덱스(본문 SoT 는 `docs/migration/01`, port 트랙은 생략)
- `docs/pm/test-scenarios.md`
- `docs/pm/acceptance-criteria.md`
- `docs/pm/risks-assumptions.md`

## 플러그인 출처 · 설치 (부재 시)

Plugin Mode가 쓰는 PM 플러그인은 **선택적 외부 도구**라 설치돼 있지 않을 수 있다. 에이전트가 Plugin Mode를 쓰려는데 `/pm-execution:*` 스킬이 안 보이면 — **임의로 설치하지 말고 사용자에게 설치 여부를 먼저 묻는다.** 미승인이면 Native Mode로 폴백한다. **왜**: 외부 플러그인은 스킬·커맨드에 도구 권한을 부여하므로(되돌리기·신뢰 비용) 설치는 사용자 결정이다.

- **출처**: 마켓플레이스 `pm-skills` ([github.com/lucas-flatwhite/pm-skills-ko](https://github.com/lucas-flatwhite/pm-skills-ko) — Paweł Huryn · productcompass.pm, MIT). 어댑터가 실제로 쓰는 건 그중 **`pm-execution`** 플러그인(`create-prd` · `job-stories` · `test-scenarios` · `pre-mortem` · `prioritization-frameworks` 스킬).
- **설치** (사용자 승인 후 — 명령 한 줄씩):

```bash
claude plugin marketplace add lucas-flatwhite/pm-skills-ko
claude plugin install pm-execution@pm-skills
```

- **scope = `user` 권장**(설치 기본값). **왜**: 이 플러그인은 optional·교체가능·부재허용이라, repo `.claude/settings.json`(project scope)에 커밋하면 강제 의존처럼 보인다(아래 §절대 금지 D8과 상충).
- **세션 재시작 필요**. **왜**: 플러그인 스킬·커맨드는 다음 세션부터 로드된다(설치 직후 현재 세션엔 안 보임).

## Native Mode (플러그인 없음)

`.agents/pm/templates/*`를 직접 채워 같은 5개 출력을 만든다(`pnpm new prd|job-story|...`).
port 트랙은 POC PRD(`docs/PRD.md`·`docs/migration/01`)가 이미 있어 **PRD 생성 자체가 불필요** —
기존 PRD를 normalized 입력으로 인용만 한다.

## 두 모드 공통 이후 (backlog pipeline)

normalized PRD → create-test-scenarios → create-job-stories → create-engineering-stories
→ split-work-packages → create-agent-tasks. 여기서부터 플러그인 사용 여부와 무관.

## 절대 금지

CI/headless에서 pm-skills를 *필수 런타임 스텝*으로 호출(D8). 부재 시 Native Mode fallback.

## 읽는 workflow / 업데이트 시점

read: create-prd · create-test-scenarios · create-job-stories.
update: PM 도구 도입/교체, 아티팩트 계약 변경(Level 2).
