---
description: 결정이 완료된 plan을 단계별로 실행 (in-turn 매크로)
disable-model-invocation: true
---

> **역할**: `docs/superpowers/plans/` 의 plan 파일을 단계별로 실행하는 in-turn 매크로. SpecKit `/speckit.implement` 의 with-key 대체.
> **전제**: `with-key` 저장소 루트. AGENTS.md · [`../../docs/QUALITY_GATE.md`](../../docs/QUALITY_GATE.md) 가드레일 우선.
> **정체성**: 본 슬래시는 **결정이 완료된 plan을 실행만 한다**. 결정 문서(ADR · spec · PRD · BE_SCHEMA)가 부재하면 멈추고 워크플로우를 안내한다. 결정 자체를 만들지 않는다. plan 본문은 수정하지 않는다.

권장 워크플로우: `brainstorm/grill-me → pnpm new adr/spec → PRD·BE_SCHEMA 갱신 → pnpm new plan → /implement-plan <slug>`

## 절차

1. **입력 해석** — `$ARGUMENTS` 가 경로(`.md`·`/` 포함)면 그대로, 슬러그면 `docs/superpowers/plans/*<slug>*.md` glob, 없으면 `git branch --show-current` 에서 `feat/`·`fix/`·`chore/` 제거한 슬러그 사용. 매칭 0개·다수면 후보 표시 후 선택 요청.

2. **preflight** — (a) 현재 브랜치가 `develop`/`main` 이면 plan 단계 1(브랜치 끊기) 자동 실행, (b) 작업 트리 dirty면 경고만 + 진행, (c) plan §영향 범위에서 spec-required 7경로(§가드레일 1번) 매치 → 같은 슬러그의 spec/ADR 부재면 멈춤 + `pnpm new spec <slug>` 안내, (d) 같은 슬러그의 spec/ADR + PRD § · BE_SCHEMA § 링크를 in-memory 인덱스로 보관.

3. **시작 안내 (1회)** — 선택 plan / 단계 수 / 영향 경로 / spec-required 건수 / 브랜치 / 작업 트리 상태. confirm 받지 않음.

4. **단계 실행** — TodoWrite로 단계 목록 등록, `in_progress` / `completed` 토글. 단계 시작 시 `[N/Total] <요약>` 1줄, 검증 결과 `→ pnpm typecheck ✓` 1줄.

## 단계 자동 분류

| 분류                     | 패턴                                                                                                                | 동작                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **자동 실행**            | 파일 편집 · `pnpm typecheck/lint/test/build/validate:docs` · `pnpm new` · `git checkout -b` (develop/main 위)       | 진행 + 검증                                               |
| **SKIP + 인계**          | `git commit` · `git push` · `gh pr create/merge` · `supabase db push/reset` · "production 적용" · `.env*` 직접 수정 | 본문을 "다음 액션"에 인용 + `/commit` · `/pr` 슬래시 안내 |
| **수동 확인**            | "dev 시각" · "viewport" · "수동 확인" · "PO 확인" · 체크리스트 `[ ]`                                                | "수동 확인" 섹션에 인용                                   |
| **자기참조 / 이미 완료** | "본 plan" · "본 문서" · "자기 참조" · plan에 ADR/spec 작성 단계가 있는데 파일이 이미 존재                           | SKIP                                                      |
| 분류 모호                | 위 어느 패턴도 안 맞음                                                                                              | 자동 실행 시도 (검증 실패 멈춤이 안전망)                  |

## 검증 실패

`check.md` 패턴 따름. 자동 수정 가능 항목(`lint --fix`, `prettier`)은 자동 적용 후 재검증. type/test/build/docs 실패는 **단계당 1회**만 수정 시도, 그래도 실패면 plan 진행 중단 + 단계 번호 + 에러 요약(10줄 이하) 보고. 무한 retry 금지.

## 모호함 처리

같은 슬러그 spec/ADR에 답이 있으면 자동 진행(`spec §X.Y 기준` 1줄 보고). 참조 문서 부재면 1줄 질문. 가드레일 트리거(env · RLS · server-only key · AnalyticsEvent 확장 · `KEYWORD_POOL_VERSION` 변경) 와 plan "선택/또는" 표현은 **추측 금지 — 무조건 질문**. plan §비범위 항목은 **절대 건드리지 않음**.

## 가드레일 멈춤 트리거

다음 중 하나라도 위반 정황이면 단계 진행 중단:

1. spec-required 7경로 변경인데 spec/ADR 부재 — `supabase/migrations/**` · `src/lib/supabase/**` · `middleware.ts` · `src/lib/keywords/pool.ts` · `src/lib/validators/**` · `src/lib/analytics/track.ts` · `src/lib/ai/**` (출처: `scripts/check-spec-required.mjs`)
2. server-only key 에 `NEXT_PUBLIC_` 접두 시도 — `SUPABASE_SECRET_KEY` · `OPENAI_API_KEY` · `VAPID_PRIVATE_KEY` (신규 키 체계 — `SERVICE_ROLE_KEY` 아님)
3. `AnalyticsEvent` 유니온 임의 확장 (PRD §9.1 과 1:1, PO 승인 필요)
4. `KEYWORD_POOL` freeze 위반 — `src/lib/keywords/pool.ts` 의 `KEYWORD_POOL_VERSION = "v1.1-meal-2026-05-22"` 이후 추가 변경 금지
5. migration append-only 위반 — 기존 파일 수정 · 번호 재정렬 · 삭제
6. 금지 패턴 — `useEffect` + `fetch` 쓰기 · SWR · React Query 도입 · `src/features/` 신설
7. plan 본문 · §비범위 건드림

## 출력 형식 (turn 끝)

```markdown
## 실행 결과

- 완료: <N>/<Total>
- SKIP: 단계 X(이유), 단계 Y(이유) ...
- 멈춤: <단계 번호 + 사유, 없으면 "없음">

## 변경 파일

- <경로>
- ...

## 다음 액션 (사용자 수행)

### git commit (단계 X)

<plan 본문 인용>
권장: /commit 슬래시

### push + PR (단계 Y)

<plan 본문 인용>
권장: /pr 슬래시

### migration production 적용 (해당 시)

<plan 본문 인용>
권장: PR 머지 시점에 별도 작업

## 수동 확인

- [ ] <plan 체크리스트 인용>

## 미해결

<plan §리스크 그대로 인용. 슬래시가 항목을 추가하지 않음>
```

## 금지

- AGENTS.md · [`../../docs/QUALITY_GATE.md`](../../docs/QUALITY_GATE.md) 의 금지 사항 우선.
- plan 본문 수정 금지 — slash 는 실행만.
- §비범위 항목을 "친절히" 처리하지 않음.
- `git commit` · `git push` · `gh pr create/merge` · `supabase db push/reset` 자동 실행 금지.
- 단계당 재시도 1회 초과 금지.
- 가드레일 멈춤 트리거 무시 후 다음 단계 진행 금지.
