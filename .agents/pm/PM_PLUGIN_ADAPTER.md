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

출력(normalized):
- `.agents/pm/prd.md`
- `.agents/pm/job-stories.md`
- `.agents/pm/test-scenarios.md`
- `.agents/pm/acceptance-criteria.md`
- `.agents/pm/risks-assumptions.md`

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
