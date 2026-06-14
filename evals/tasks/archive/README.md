# evals/tasks/archive/

하네스 SoT 에서 제외된 task 보관소. `loadMigrationTasks` 는 `evals/tasks/` 최상위만 읽으므로(비재귀) 이 디렉토리는 harness:check · drift · goal 의 대상이 아니다.

## 0001~0003 — PWA 시절 pending baseline (archived 2026-06-11)

- **사유**: 셋 다 PWA 기준 기능(kudos Server Action · AI diary fallback · RLS migration) 대상인데 baseline run 이 한 번도 실행되지 않았고, RN 전환 진행으로 PWA 기준 baseline 의 효용이 소멸. 인용 경로(`src/lib/validators/*`)도 모노레포 전환(apps/web + packages/domain) 이후 stale.
- **복원 조건**: PWA 코드 기준 보존 eval 이 다시 필요해지면 경로·frontmatter 를 현 스키마(AGENT_TASK_TEMPLATE)로 재작성해 `evals/tasks/` 에 새 번호로 발급한다 — 이 파일들을 제자리로 되돌리지 않는다(스펙 수정 금지 원칙).
- `agent-results.json` `tasks[]` 의 해당 항목은 `status: archived` 로 갱신됨 (append-only 계약은 `runs[]` 에만 적용).
