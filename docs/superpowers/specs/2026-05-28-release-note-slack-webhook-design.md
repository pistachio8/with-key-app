---
spec: 2026-05-28-release-note-slack-webhook
title: 릴리즈 노트 Slack 웹훅 발송 (수동 트리거 + catch-up)
author: pistachio8
date: 2026-05-28
status: draft
---

## Summary

`/release-note` 커맨드가 생성·커밋한 사용자 공지를, 같은 실행 흐름의 마지막 단계에서 **Slack 특정 채널로 발송**하도록 확장한다. 발송은 의존성 0짜리 Node 스크립트(`scripts/post-release-note.mjs`)가 담당하며, 커맨드는 확인 게이트를 거쳐 이 스크립트를 호출한다.

스케줄 자동화(cron)는 **이번 범위에서 제외**한다 — 매일 자동으로 AI 번역을 돌리면 추가 요금이 발생하기 때문이다. 대신 사람이 `/release-note`를 수동으로 돌리는 흐름을 유지하고, "마지막 노트 이후 머지분"을 윈도로 삼는 catch-up 동작으로 "전날 발송이 빠진 경우 다음날 함께 포함"을 비용 0으로 달성한다.

Slack 웹훅 발송 자체는 단순 HTTP POST라 AI·요금이 필요 없다. Supabase 스키마·RLS·AnalyticsEvent 변경은 없다.

## Why

- `/release-note`가 공지 문서를 만들어도, 지금은 사람이 본문을 복사해 Slack에 붙여넣어야 한다 — 한 단계를 자동화해 마찰을 줄인다.
- 스케줄러로 AI 번역을 매일 자동 실행하면 비용이 누적된다. POC 단계에서는 수동 실행으로 충분하고, 비용이 0이다.
- catch-up(전날 누락분 다음날 포함)은 별도 상태 저장소 없이, 커밋된 `docs/release-notes/` 파일을 "마지막 발송 지점"으로 읽어 해결할 수 있다 — 윈도가 달력 하루가 아니라 "마지막 노트의 마지막 PR 이후"라 며칠 걸러 돌려도 빠지지 않는다.
- 발송 로직을 작은 스크립트로 분리하면 `--dry-run`으로 실제 채널을 건드리지 않고 검증할 수 있고, 발송 실패 시 단독 재실행으로 재발송할 수 있다.
- 사용자 공지(청중=일반 사용자)는 기존 `SLACK_DEVELOP_WEBHOOK_URL`(청중=개발자, "develop push 알림")과 채널·청중이 달라 전용 시크릿으로 분리한다.

## Impact Scope

### 변경 경로

- 신규:
  - `scripts/post-release-note.mjs` — Slack 발송 엔진(본문 추출 + mrkdwn 변환 + POST + dry-run)
  - `scripts/post-release-note.spec.mjs` — 순수 함수(`extractAnnouncement`·`toSlackMrkdwn`) 단위 테스트 (vitest가 `scripts/`를 픽업하지 못하면 보류)
- 수정:
  - `.claude/commands/release-note.md` — 절차에 "Slack 발송(확인 게이트 + 중복 마커)" 단계 추가
  - `.env.example` — `SLACK_RELEASE_WEBHOOK_URL` 1줄 + 주석 추가
  - `package.json` — `release:notify` 스크립트 alias 추가
  - `docs/release-notes/TEMPLATE.md` — 발송 후 중복 방지 마커(`<!-- slack-sent: ... -->`) 위치를 주석으로 안내(구조 변경 아님)

### src/ 영향

없음 — 앱 런타임(`src/**`) 코드는 건드리지 않는다. 도구/문서 레이어(`scripts/`·`.claude/`·`docs/`)만 변경.

### Supabase / RLS / migration 영향

없음.

### 외부 서비스

Slack Incoming Webhook(신규 의존). OpenAI·Web Push·Supabase에는 영향 없음.

## Design

### 컴포넌트 분해

**C1. `post-release-note.mjs` (Node 스크립트) — `scripts/post-release-note.mjs`**

호출:

```bash
node scripts/post-release-note.mjs <path-to-md> [--dry-run]
# package.json alias
pnpm release:notify <path-to-md> [--dry-run]
```

- 입력 인자: 발송할 릴리즈 노트 파일 경로(필수), `--dry-run`(선택).
- 웹훅 URL: `process.env.SLACK_RELEASE_WEBHOOK_URL`. 없으면 stderr 안내 후 exit 1. **왜**: 로컬 수동 발송은 `.env.local`에, 미래 CI는 GitHub secret에 둔다. 필수 env 검증(`scripts/check-env.ts`)에는 넣지 않는다 — 발송할 때만 필요한 선택값이라 매 빌드 강제는 과하다.
- 처리 순서:
  1. 파일 읽기 → `extractAnnouncement()`로 **공지 본문만** 추출.
  2. `toSlackMrkdwn()`로 마크다운 → Slack mrkdwn 최소 변환.
  3. `buildPayload()`로 페이로드 구성.
  4. `--dry-run`이면 페이로드 JSON + 마스킹된 대상 URL을 stdout 출력 후 exit 0. 아니면 `fetch` POST.
  5. `res.ok` 아니면 상태코드 + 응답 본문(앞 200자)과 함께 exit 2.

순수 함수(부수효과 없음 → 단위 테스트 대상):

```js
// scripts/post-release-note.mjs (발췌)
// '---' 단독 줄 기준으로 자르고, 그 아래(사용자 공지 본문)만 trim 해서 반환
export function extractAnnouncement(md) { /* split on /^---$/m, take tail */ }

// Slack mrkdwn 차이 흡수: **굵게** → *굵게* (불릿 '- '·이모지는 그대로)
export function toSlackMrkdwn(s) { /* s.replace(/\*\*(.+?)\*\*/g, "*$1*") */ }

// 3000자 초과 시 빈 줄 기준 여러 section 으로 분할
export function buildPayload(text) {
  return { text, blocks: [{ type: "section", text: { type: "mrkdwn", text } }] };
}
```

**C2. `/release-note` 커맨드 발송 단계 — `.claude/commands/release-note.md`**

기존 절차(범위 확정 → 본문 조회 → 번역 → 분류 → 템플릿 채우기 → 저장/커밋) 뒤에 단계 추가:

1. **중복 확인**: 대상 파일에 `<!-- slack-sent: ... -->` 마커가 있으면 "이미 발송됨 — 재발송할까요?"로 한 번 더 확인.
2. **미리보기**: `pnpm release:notify <파일> --dry-run` 실행 → 페이로드를 사용자에게 보여줌.
3. **확인 게이트**: "#채널로 발송할까요?" 사용자 승인 대기. **왜**: 공유 채널·사용자 대상 발송은 되돌리기 어려운 가시적 행동이라 명시 확인이 필요(전역 행동 원칙).
4. **발송**: 승인 시 `pnpm release:notify <파일>` 실행. 성공하면 파일 메타 영역(`---` 위)에 `<!-- slack-sent: <ISO8601> -->` 1줄 추가 후 그 변경을 커밋.
5. **스킵 경로**: `SLACK_RELEASE_WEBHOOK_URL` 미설정이면 발송만 스킵하고 "`.env.local`에 SLACK_RELEASE_WEBHOOK_URL 설정 필요"를 보고(문서는 이미 생성·커밋됨).

### 데이터 흐름 (catch-up 포함)

1. `/release-note`(인자 없음) → `docs/release-notes/`의 최신 파일(`TEMPLATE.md` 제외)에서 "대상 PR" 마지막 번호 파싱.
2. 그 번호 이후 머지된 PR 수집 → 0건이면 "발송할 신규 머지 없음" 보고 후 종료(**빈 발송 안 함**).
3. 1건+ → Claude가 사용자 공지 본문 생성 → `docs/release-notes/<머지일>.md` 작성 + 커밋(기존 동작).
4. 발송 단계(C2) 실행 → 성공 시 `slack-sent` 마커 커밋.

> **catch-up 정의**: 윈도는 "마지막 노트의 마지막 PR **이후**"다. 달력 하루가 아니라 PR 연속선이라, 어제 발송을 건너뛰었어도 오늘 실행하면 그 사이 머지분이 모두 한 번에 포함된다. 별도 상태 파일 없이 커밋된 노트 파일이 곧 상태다.

### 메시지 포맷

- 발송 본문 = 문서의 `---` **아래 전체**("📢 with-key 업데이트 …" ~ "#qa 채널로 …"). `---` 위 개발자 메타(대상 PR 등)는 **제외**. **왜**: 사용자에게는 내부 PR 번호·내부 변경 건수가 의미 없고 노출 위험.
- 단일 mrkdwn section 블록 + `text` 폴백. 사용자가 보여준 텍스트 포맷 그대로 렌더(불릿·이모지 유지). **왜**: 헤더/버튼 있는 Block Kit은 이 용도에 과하고, 보여준 원문 그대로가 의도.

### 보안 / 시크릿

- `SLACK_RELEASE_WEBHOOK_URL`은 서버/로컬 전용 — `NEXT_PUBLIC_` 접두 **금지**(클라이언트 번들 유출 방지). 웹훅 URL은 그 자체가 발송 권한이라 시크릿로 취급.
- 기존 `SLACK_DEVELOP_WEBHOOK_URL`과 **분리** — 채널·청중이 다르고, 한쪽 노출 시 영향 격리.
- 발송 본문은 사용자 공지(이미 비민감)지만, 스크립트는 webhook URL을 로그에 그대로 찍지 않고 마스킹 출력한다.

## Alternatives Considered

- **커맨드 안 인라인 curl(B안)**: 스크립트 없이 매번 Bash heredoc + jq로 페이로드 조립. 멀티라인 한글·이모지의 JSON 이스케이프가 취약하고 테스트 불가, Claude가 매번 수동 조립해 회귀 위험 → 기각.
- **독립 `pnpm release:notify`만, 커맨드 비통합(C안)**: 관심사 분리는 깔끔하나 "한 커맨드로 끝" 요구와 어긋나 2스텝이 됨 → 기각(단, 스크립트는 단독 실행도 가능하게 두어 재발송을 지원).
- **스케줄 cron 자동 발송(AI)**: 매일 자동 AI 번역 → 요금 누적으로 보류. 미래에 필요하면 GitHub Actions cron + Claude API(또는 AI 없는 PR 제목 템플릿)로 별도 spec.
- **중복 방지 마커 생략**: 가장 단순하나 사용자 공지 중복 발송은 민망 → 한 줄 마커로 막는 가치가 더 큼 → 마커 채택.

## Verification

### 명령

```bash
pnpm release:notify docs/release-notes/2026-05-28.md --dry-run
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
```

### 시나리오

- `extractAnnouncement` 단위: `---` 위 메타 제거하고 본문만 반환 / `---` 여러 개여도 첫 구분선 기준 / 본문 앞뒤 공백 trim.
- `toSlackMrkdwn` 단위: `**굵게**` → `*굵게*`, 불릿·이모지 보존.
- `buildPayload` 단위: 3000자 이하 단일 section / 초과 시 빈 줄 기준 다중 section.
- 스크립트 통합:
  - `--dry-run` → POST 안 함, 페이로드 출력, exit 0
  - `SLACK_RELEASE_WEBHOOK_URL` 미설정 → exit 1 + 안내
  - 잘못된 URL/비2xx 응답 → exit 2 + 상태코드
- 1회 실제 발송: 테스트용 채널 웹훅으로 `2026-05-28.md` 발송 → Slack 렌더 육안 확인(이모지·불릿·줄바꿈).
- 커맨드 흐름: dry-run 미리보기 → 확인 → 발송 → `slack-sent` 마커 추가 확인 → 재실행 시 "이미 발송됨" 경고.

## Rollout

- 단일 PR로 도입(베이스 `develop`). 머지 후 `/release-note`로 다음 공지부터 발송 단계 사용.
- 도입 직후: 실제 사용자 채널 발송 전, 테스트 채널 웹훅으로 한 번 dry-run 아닌 실발송을 해 렌더를 확인한다.
- 운영 후 재검토: 수동 발송이 번거로워지면(머지 빈도 증가 등) 무료 스케줄(AI 없는 PR 제목 기반) 또는 유료 AI 스케줄을 별도 spec으로 검토.

### 롤백

기능 추가형. PR 1건 revert로 원복(커맨드 발송 단계·스크립트·env 항목 제거). 앱 런타임·데이터·스키마 변경이 없어 데이터 롤백 불필요. 이미 Slack에 발송된 메시지는 코드 롤백과 무관(필요 시 채널에서 수동 삭제).

## Out of scope

- 스케줄 자동 발송(cron / `/schedule` 루틴 / Claude API in CI).
- AI 없이 PR 제목만으로 기계 생성하는 발송 경로.
- Slack 외 채널(메일·LINE·Discord 등) 발송.
- 발송 결과의 영구 로그/대시보드, 분석 이벤트화.
- Block Kit 고급 레이아웃(헤더·버튼·필드).

## 용어집

- **catch-up**: 발송을 건너뛴 날의 업데이트를, 다음 실행 때 함께 포함해 빠뜨리지 않는 동작. 여기서는 윈도를 "마지막 노트의 마지막 PR 이후"로 잡아 달성.
- **dry-run**: 실제 발송(POST) 없이 보낼 페이로드만 출력해 검증하는 모드.
- **Incoming Webhook**: 채널로 메시지를 보낼 수 있는 Slack 발급 URL. URL 자체가 발송 권한이라 시크릿로 취급.
- **mrkdwn**: Slack의 마크다운 변형. 굵게는 `*한쌍*`(별 1개), 표준 마크다운의 `**두쌍**`과 다름.
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어(본 변경 영향 없음).
