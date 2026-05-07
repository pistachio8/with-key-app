# 에이전트 오케스트레이션

이 파일은 Claude Code + everything-claude-code 전용 agent 어댑터입니다.
공통 품질 기준은 [`../../../docs/QUALITY_GATE.md`](../../../docs/QUALITY_GATE.md)를 따릅니다.

## 사용 가능한 에이전트

`everything-claude-code` 플러그인에서 제공되는 활성 에이전트:

| 에이전트 | 용도 | 사용 시점 |
|---------|------|----------|
| everything-claude-code:planner | 구현 계획 | 복잡한 기능, 리팩토링 |
| everything-claude-code:architect | 시스템 설계 | 아키텍처 의사결정 |
| everything-claude-code:tdd-guide | 테스트 주도 개발 | 새 기능, 버그 수정 |
| everything-claude-code:code-reviewer | 코드 리뷰 | 코드 작성 후 |
| everything-claude-code:security-reviewer | 보안 분석 | 커밋 전 |
| everything-claude-code:build-error-resolver | 빌드 에러 수정 | 빌드 실패 시 |
| everything-claude-code:e2e-runner | E2E 테스팅 | 핵심 사용자 흐름 |
| everything-claude-code:database-reviewer | 데이터베이스 스키마/쿼리 리뷰 | 스키마 설계, 쿼리 최적화 |
| everything-claude-code:go-reviewer | Go 코드 리뷰 | Go 코드 작성 또는 수정 후 |
| everything-claude-code:go-build-resolver | Go 빌드 에러 수정 | `go build` 또는 `go vet` 실패 시 |
| everything-claude-code:refactor-cleaner | 사용하지 않는 코드 정리 | 코드 유지보수 |
| everything-claude-code:doc-updater | 문서 관리 | 문서 업데이트 |

## 즉시 에이전트 사용

사용자 프롬프트 불필요:
1. 복잡한 기능 요청 - **everything-claude-code:planner** 에이전트 사용
2. 코드 작성/수정 직후 - **everything-claude-code:code-reviewer** 에이전트 사용
3. 버그 수정 또는 새 기능 - **everything-claude-code:tdd-guide** 에이전트 사용
4. 아키텍처 의사결정 - **everything-claude-code:architect** 에이전트 사용

## 병렬 Task 실행

독립적인 작업에는 항상 병렬 Task 실행 사용:

```markdown
# 좋음: 병렬 실행
3개 에이전트를 병렬로 실행:
1. 에이전트 1: 인증 모듈 보안 분석
2. 에이전트 2: 캐시 시스템 성능 리뷰
3. 에이전트 3: 유틸리티 타입 검사

# 나쁨: 불필요하게 순차 실행
먼저 에이전트 1, 그다음 에이전트 2, 그다음 에이전트 3
```

## 다중 관점 분석

복잡한 문제에는 역할 분리 서브에이전트 사용:
- 사실 검증 리뷰어
- 시니어 엔지니어
- 보안 전문가
- 일관성 검토자
- 중복 검사자
