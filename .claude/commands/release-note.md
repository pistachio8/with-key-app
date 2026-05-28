---
description: 머지된 PR 범위를 사용자 친화 한국어 업데이트 공지로 정리해 docs/release-notes/ 에 작성
---

> **역할**: 머지된 PR들을 dogfood 사용자용 "업데이트 공지" 메시지로 변환하는 어댑터.
> **전제**: `with-key` 저장소 루트에서 실행. `gh` 인증됨(계정 `pistachio8`).
> **출력**: `docs/release-notes/<머지일>.md` (템플릿: [`../../docs/release-notes/TEMPLATE.md`](../../docs/release-notes/TEMPLATE.md))
> **예시 산출물**: [`../../docs/release-notes/2026-05-28.md`](../../docs/release-notes/2026-05-28.md)

## 입력 (`$ARGUMENTS`)

- `/release-note 132` → #132 부터 가장 최근 머지 PR 까지
- `/release-note 132-140` → #132~#140
- 인자 없음 → `docs/release-notes/` 의 가장 최근 파일 "대상 PR" 마지막 번호 **다음**부터 최신까지 자동 탐색

## 절차

1. **범위 확정** — `gh pr list --state merged --base develop --json number,title,mergedAt` 로 대상 PR 번호·제목·머지일 수집. 머지일이 여러 날이면 가장 늦은 날을 파일명으로.
2. **본문 조회** — 각 PR `gh pr view <n> --json title,body`. PR 본문 `## Summary` 의 사용자 영향 위주로 읽는다.
3. **사용자 관점 번역** — 기술 용어(RSC · FAB · `potTotal` · RLS · 함수명 등)를 제거하고 "사용자가 화면에서 보거나 할 수 있게 된 것"으로 다시 쓴다.
4. **분류** — `✨ 새 기능` / `🐛 버그 수정` / `🔧 소소한 개선`. 사용자에게 의미 없는 PR(리팩토링·CI·테스트·문서)은 공지 본문에서 빼고 상단 주석에 "내부 변경 N건" 으로만 적는다.
5. **템플릿 채우기** — `TEMPLATE.md` 를 복사해 placeholder 치환. 주석 블록과 `{{...}}` 는 전부 제거.
6. **저장** — `docs/release-notes/<머지일>.md`. 같은 날 파일이 이미 있으면 덮어쓰기 전에 사용자에게 "합칠지/새로 쓸지" 확인.
7. **Slack 발송** — 생성·커밋 후:
   1. 대상 파일에 `<!-- slack-sent: ... -->` 마커가 있으면 "이미 발송됨 — 재발송할까요?"로 한 번 더 확인.
   2. `pnpm release:notify <파일> --dry-run` 으로 페이로드 미리보기를 사용자에게 보여준다.
   3. "#채널로 발송할까요?" 확인 게이트 — 승인 시에만 진행. **왜**: 공유 채널·사용자 대상 발송은 되돌리기 어려운 가시적 행동.
   4. 승인 시 `pnpm release:notify <파일>` 실행. 성공하면 파일 상단 메타(`---` 위)에 `<!-- slack-sent: <ISO8601> -->` 한 줄을 추가하고 그 변경을 커밋한다.
   5. `SLACK_RELEASE_WEBHOOK_URL` 미설정이면 발송만 스킵하고 "`.env.local` 에 SLACK_RELEASE_WEBHOOK_URL 설정 필요"를 보고(문서는 이미 생성·커밋됨).

## 작성 규칙

- 한 항목 = 한 줄. "무엇이 바뀌었나 — 사용자 이득" 순서.
- 내부 식별자·파일 경로·PR 번호는 **공지 본문에 노출 금지**. 개발자용 메타(대상 PR 등)는 `---` 위 주석 영역에만.
- "오늘 N건" 의 N = **공지에 실제 노출된 항목 수**(PR 개수 아님).
- 톤: 친근한 존대("~했어요 / ~해주세요"), 이모지 섹션 헤더 유지, 끝맺음 "#qa 채널로 편하게 남겨주세요 🙏".
- 약어는 풀어쓰는 게 아니라 **애초에 쓰지 않는다**(사용자 공지이므로). 자세한 톤 기준은 [`../../.claude/rules/common/doc-readability.md`](../../.claude/rules/common/doc-readability.md).

## 금지

- 보안·내부 구현 세부(RLS · migration · 토큰 · service role) 노출.
- PRD §9.1 등 내부 문서 번호·코드 식별자를 공지 본문에 인용.
- 머지되지 않은(open/draft) PR 포함 — `--state merged` 만.
- 확인 게이트 없이 자동 발송 금지.
- `---` 위 개발자 메타를 발송 본문에 포함 금지(스크립트가 자동 제외하지만, 커맨드도 본문만 다룬다).

## 보고 형식

- 포함한 PR 번호와 각 PR → 공지 항목 매핑(1줄)
- 생략한 내부 변경 건수
- 생성/수정한 파일 경로
- Slack 발송 결과(전송 / 스킵 / 실패)와 `slack-sent` 마커 추가 여부
