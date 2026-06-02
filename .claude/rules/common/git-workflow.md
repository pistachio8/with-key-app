# Git 워크플로우

## 커밋 메시지 형식

```
<type>: <description>

<선택적 본문>
```

타입: feat, fix, refactor, docs, test, chore, perf, ci

참고: 어트리뷰션 비활성화 여부는 각자의 `~/.claude/settings.json` 로컬 설정에 따라 달라질 수 있습니다.

## Pull Request 워크플로우

PR을 만들 때:

1. 전체 커밋 히스토리를 분석 (최신 커밋만이 아닌)
2. `git diff [base-branch]...HEAD`로 모든 변경사항 확인
3. 포괄적인 PR 요약 작성
4. TODO가 포함된 테스트 계획 포함
5. 새 브랜치인 경우 `-u` 플래그와 함께 push

### PR 본문 · 커밋 메시지 언어

PR description body와 **커밋 메시지 주제(subject)**는 **한국어**로 작성합니다 (2026-05-21 합의).

- 섹션 헤더(`## Summary`, `## Test plan` 등)는 영어 유지 허용
- 본문(문장, bullet, 설명)은 한국어
- 코드 블록, 파일 경로, 커맨드는 원본 그대로
- **기술 용어 · 코드 식별자 · 라이브러리/API 이름은 원문(영어) 유지** — 무리하게 번역하지 않는다
  - 예 OK: `feat(ui): Textarea + Select primitives 추가 (h-11 SoT)`
  - 예 OK: `refactor(lib/ai): AbortController 타임아웃 4.5s 적용`
  - 예 지양: `refactor(sheets): adopt Textarea/Select + unify Button h-11` (주제 전체가 영어)
- conventional commits `타입(스코프):` 접두는 영문 유지(`feat`, `fix`, `refactor` 등)
- 이미 머지됐거나 오픈된 PR · 기존 커밋은 소급 재작성하지 않음

> git 작업 전 전체 개발 프로세스(계획, TDD, 코드 리뷰)는
> [development-workflow.md](./development-workflow.md)를 참고하세요.
