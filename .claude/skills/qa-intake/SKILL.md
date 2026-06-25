---
name: qa-intake
description: >-
  Use this in the with-key repo to turn dogfood QA feedback into tracked work. Trigger whenever the
  user wants to **collect, triage, or track bug reports / feature requests / 건의** that arrive from
  in-app 건의하기 (the Supabase `feedback` table, mirrored to Slack #qa) — phrasings like "QA 글
  트래킹", "버그 제보 정리해줘", "slack 버그 제보 task 로 만들어줘", "건의 모아서 정리", "feedback 분류해줘",
  "#qa triage", "새 버그 리포트 있어?", "dogfood 피드백 task 화", "어떤 건의 들어왔어", triage the QA
  inbox, file feedback as tasks. It reads the `feedback` table directly (service_role, RLS-bypass),
  separates real signal from noise/jokes/positive-confirmations, dedups against the existing backlog
  (evals/tasks + QA_TRIAGE.md), drafts QA_TRIAGE.md entries with ready-to-route prompts, and stops at
  a human gate — it never auto-creates evals/tasks or pushes. Prefer this over reading Slack #qa by
  hand or over withkey-todo (which prioritizes the existing backlog, not raw feedback intake). Don't
  use it to implement a chosen fix (→ implement-agent-task) or to review a diff (→ withkey-review).
---

# qa-intake

dogfood 사용자 건의(인앱 "건의하기" → Supabase `feedback` 테이블, Slack `#qa` 미러)를 **추적 가능한 작업으로
바꾸는** 스킬. 수집 → triage → 중복제거 → 초안 → 리포트까지 무인으로 가고, **task 승격은 사람 게이트**에서 멈춘다.

이 스킬이 존재하는 이유(=어려운 부분): **사용자 self-label(`category`)을 믿으면 안 된다.** 인앱 폼은
`bug/feature/other` 중 하나를 받지만, 실제로는 대부분 'bug' 로 들어오고 그 안에 진짜 버그·잡담("사랑해요")·
긍정 확인("정상동작합니다!")·테스트 입력("ㅁㅇㄴㄹ")이 섞여 있다. 그래서 가치는 수집이 아니라 **노이즈에서 신호를
가르고, 이미 추적 중인 것과 중복을 잡아내는 판단**에 있다. (inaugural run: 13건 중 actionable 4건, 그중 2건은
이미 EVAL task 로 추적 중 → 실제 신규 후보는 2건.)

이 스킬은 **제안**한다. 구현·커밋·task 파일 생성·push 는 하지 않는다 — 후보 목록을 내고, 승격은 사용자가 고른다.

## 데이터 사실 (먼저 알아야 할 것)

- **출처 = `feedback` 테이블**(`supabase/migrations/0047_feedback.sql`, [ADR-0035](../../../docs/adr/0035-feedback-table-storage.md)).
  컬럼: `id` · `user_id` · `category('bug'|'feature'|'other')` · `body(1~1000자)` · `photo_path(nullable)` · `created_at`.
  Slack `#qa` 는 같은 데이터의 webhook 미러일 뿐 — SoT 는 DB.
- **INSERT-only RLS** — SELECT 정책이 없어 publishable 키로는 못 읽는다. `SUPABASE_SECRET_KEY`(service_role 등가,
  RLS 우회)로만 읽힌다. 그래서 읽기는 번들 스크립트가 `--env-file=.env.local` 로 secret 키를 써서 수행한다.
  **secret 키 값을 로그·출력에 남기지 않는다.**
- **사진**: `photo_path` 는 버킷 경로(URL 아님). triage 는 텍스트 본문 기준이 기본이고, 사진은 "미열람"으로 표기한다
  (애매한 항목만 필요 시 signed URL 발급 — v1 범위 밖).
- **state(중복추적)**: `docs/QA_TRIAGE.intake.json`(로컬 전용, `.gitignore`). 처리한 `feedback.id` 집합이
  dedup 의 권위. 본문이 담기므로 `QA_TRIAGE.md` 와 같은 프라이버시 스탠스(커밋 금지).

## 파이프라인

```
[수집] qa-fetch.mjs → state 에 없는 feedback 행만 JSON
   ↓
[Triage] 각 행 verdict 판정 → 노이즈/긍정확인 버리고 신호만
   ↓
[중복제거] evals/tasks + QA_TRIAGE.md + git log 대조 → 이미 아는 건 dup 표기
   ↓
[초안] QA_TRIAGE.md 에 B/I/F 항목 + "해결 프롬프트"(라우팅 가능한 요청문) append
   ↓
[기록] qa-mark.mjs 로 처리한 id 를 state 에 기록(멱등성)
   ↓
[리포트] 분포 + 승격 후보 표
   ↓
─────── 🚧 사람 게이트 (D6) ───────
   ↓
[승격] 사용자가 고른 것만 → pnpm harness:intake "<해결 프롬프트>" → create-agent-tasks → evals/tasks/NNNN
```

## Step 1 — 수집

state 에 아직 없는 feedback 행만 가져온다(읽기 전용):

```bash
node --env-file=.env.local .claude/skills/qa-intake/scripts/qa-fetch.mjs
```

출력 JSON: `newCount` · `byCategory` · `items[]`(`id`·`category`·`body`·`hasPhoto`·`createdAt`).
`newCount: 0` 이면 신규 없음 → 여기서 종료 보고. `--all` 로 전체 재조회(재분류·디버그).

## Step 2 — Triage (핵심)

각 item 을 아래 verdict 중 하나로 판정한다. **category 는 힌트일 뿐 근거로 쓰지 않는다.**

| verdict                  | 의미                             | 예                        |
| ------------------------ | -------------------------------- | ------------------------- |
| `actionable-bug`         | 재현 가능한 동작 오류            | "영상일 때 레이아웃 깨짐" |
| `actionable-feature`     | 새 기능 요청                     | "식단 시간대별 AI 코멘트" |
| `actionable-improvement` | 기존 UX 개선                     | "업로드마다 팝업 → 1회로" |
| `positive-confirmation`  | 잘 된다는 확인 (버그 아님)       | "정상동작합니다!"         |
| `duplicate`              | 기존 task/항목과 **확인된** 중복 | (Step 3 에서 확정 시)     |
| `already-fixed`          | 이미 수정 머지됨이 **확인됨**    | (코드/PR 대조 후)         |
| `noise`                  | 잡담·인사·테스트입력·비실행      | "사랑해요"·"ㅁㅇㄴㄹ"     |

판정 가이드:

- **노이즈 적극 제거**: 인사·애정표현·이모지·키보드 난타·개발자 테스트 건의(예: "EVAL-00xx 검증용")는 `noise`.
- **막연한 불만**은 `noise`로 두되 본문에 "약신호"로 1줄 기록(누적되면 신호). 예: "ai 똑바로 안하니".
- **positive-confirmation 주의**: 'bug' 로 와도 "정상동작/잘 돼요"는 버그가 아니다.
- `duplicate`·`already-fixed` 는 **확인된 경우에만** 쓴다. 의심 단계면 `actionable-*` 로 두고 dedup 노트에 "중복 후보 —
  확인 필요"로 표기한다(실행하지 않은 검증을 했다고 적지 않는다).

## Step 3 — 중복제거 (대조)

actionable 항목마다 기존 백로그와 대조해 dup 여부를 **근거와 함께** 표기한다. 절대 추정으로 단정하지 않는다.

```bash
# 주제 키워드로 기존 task / 최근 머지 대조 (예: 영상·반려·팝업)
grep -ilE "<키워드>" evals/tasks/*.md
git log --oneline -25 | grep -iE "<키워드>"
grep -nE "<키워드>" docs/QA_TRIAGE.md   # 기존 B/I/F/S 항목과도 대조
```

결과는 "관련: EVAL-00xx … — 회귀/누락/범위포함 여부 확인 필요"처럼 **검증 액션**으로 남긴다.

## Step 4 — 초안 + 기록

`docs/QA_TRIAGE.md` 끝에 **날짜 섹션**을 추가하고(기존 B/I/F/S 번호 이어서 — 재정렬 금지), 각 actionable 항목에:
출처(`feedback id`·날짜·사진 유무) · 문제 · dedup · **해결 프롬프트**(그대로 `harness:intake` 에 넣을 요청문)를 적는다.
positive/noise 는 한 줄씩 묶어 기록만 한다.

그 다음 처리한 id 전부를 state 에 기록한다(초안을 적은 **뒤에** — 도중 중단 시 미기록 행은 다음 fetch 에 다시 뜸):

```bash
echo '[{"id":"<uuid>","verdict":"actionable-bug","triageId":"B10"}, ...]' \
  | node .claude/skills/qa-intake/scripts/qa-mark.mjs
```

## Step 5 — 리포트

분포 표(actionable / dup 후보 / 신규 / positive / noise)와 **승격 후보 목록**을 보고한다. 여기서 멈춘다.

## Step 6 — 승격 (사람 게이트, D6)

**자동 금지.** 사용자가 승격할 항목을 고르면, 그 "해결 프롬프트"로 기존 하네스에 넣는다:

```bash
pnpm harness:route  "<해결 프롬프트>"   # 분류 확인 (ambiguous 면 사용자에게 재확인)
pnpm harness:intake "<해결 프롬프트>"   # run 기록 + 다음 명령 안내 → create-agent-tasks → evals/tasks/NNNN
```

dup 후보(B10·B11 류)는 승격 전에 Step 3 의 "확인 필요"를 먼저 해소한다.

## 가드레일

- **evals/tasks/ 자동 생성 금지.** intake 는 후보까지만. 노이즈가 많아 백로그 오염 위험이 크다(append-only).
- **push / PR / merge 금지** (D6 사람 게이트).
- feedback 본문은 로컬에만(`QA_TRIAGE.md`·`.intake.json` 둘 다 `.gitignore`). 커밋·외부 전송 금지.
- secret 키 값을 출력·로그에 남기지 않는다.
- 이 스킬은 harness-improvement 가 아니다(테스트 완화·reviewer 제거·게이트 제거 없음). 새 역량을 더할 뿐.

## 자동화 업그레이드 (cron)

읽기 경로가 MCP 가 아니라 `SUPABASE_SECRET_KEY` + 번들 스크립트라, 무인 환경에 같은 env 만 주면 그대로 돈다.
일 1회 cron 으로 올리려면: 예약 에이전트가 Step 1~5 를 돌려 `QA_TRIAGE.md` 초안 + 요약을 만들고 **거기서 멈추게**
한다(승격은 계속 사람 게이트). cron 은 대화형 인증 MCP(Slack)에 접근 못 할 수 있으나, 이 스킬은 DB 소스라 무관하다.
요약을 #qa 스레드로 회신하려면 webhook(`SLACK_FEEDBACK_WEBHOOK_URL` 패턴) 별도 배선.

## 용어집

- **dogfood**: 팀이 자사 앱을 실사용하며 QA 하는 것.
- **feedback 테이블**: 인앱 "건의하기"가 저장하는 Supabase 테이블(ADR-0035). 이 스킬의 SoT.
- **RLS (Row Level Security)**: Postgres 행 단위 접근 제어. feedback 은 INSERT-only 라 읽기는 service_role 필요.
- **triage**: 들어온 제보를 신호/노이즈·타입·우선순위로 분류하는 것.
- **verdict**: 한 feedback 행에 대한 triage 판정값(위 표).
- **해결 프롬프트**: 그대로 `harness:intake` 에 넣어 task 로 만들 수 있는 자연어 요청문.
- **D6 (사람 게이트)**: push·PR·merge·task 승격처럼 저장소 밖/백로그로 나가는 행위는 사람 승인 후에만.
- **SoT (Source of Truth)**: 중복 없이 기준으로 삼는 단일 원본.
