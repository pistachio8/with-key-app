<!-- BEGIN:nextjs-agent-rules -->

# 이건 당신이 알던 Next.js가 아닙니다

이 버전에는 breaking change가 포함되어 있습니다 — API, 컨벤션, 파일 구조 모두 학습 데이터와 다를 수 있습니다. 코드를 작성하기 전에 반드시 `node_modules/next/dist/docs/`의 관련 가이드를 먼저 읽으세요. deprecation 안내에도 주의하세요.

<!-- END:nextjs-agent-rules -->

---

# with-key 에이전트 운영 규칙

이 문서는 with-key 저장소에서 작업하는 모든 AI 코딩 에이전트(Claude Code · Codex · Cursor 등)의 1차 진입점입니다. Codex CLI는 본 파일을 자동 로드하고, Claude Code는 `CLAUDE.md`의 `@import`를 통해 동일한 내용을 봅니다. 그래서 **with-key의 모든 핵심 가드레일·작업 프로토콜은 이 파일 안에 있어야** 도구 무관 일관성이 유지됩니다.

공통 코딩 품질 기준의 원본은 [`docs/QUALITY_GATE.md`](docs/QUALITY_GATE.md)이며, 본 파일은 그 기준의 운영 어댑터입니다.

## 1. 프로젝트 요약

- **with-key**: 그룹 운동 각서 앱 — 모바일 웹 PWA(Progressive Web App) POC
- **스택**: Next.js 16 App Router · React 19 · TypeScript · pnpm 10+ · Node 20 LTS
- **인프라**: Vercel(배포) · Supabase(DB · Auth · Storage) · OpenAI `gpt-4o-mini`(AI 일기) · Web Push(VAPID 알림)
- **기간**: POC 2주 (Week 1 빌드 / Week 2 dogfood · GO/NO-GO)
- **구조 원칙**: Next.js 공식 route colocation(`app/(app)/<route>/_components` · `_actions.ts`) + 얇은 공용 `src/lib/*` + shadcn primitive `src/components/ui/*`. `src/features/` 신설 금지

## 1.5 하네스 라우팅 (PWA→RN 전환)

PWA→RN 전환 작업은 AI 하네스를 따른다. 머시너리(템플릿·워크플로·정책)는 tool-agnostic [`.agents/`](.agents/README.md)에, 인스턴스(PRD·Story·Agent Task)는 `docs/`·`evals/`에 있다(ADR-0031).

- 진입점: [`.agents/README.md`](.agents/README.md) — 작업 종류 → workflow 매핑
- 검증: `pnpm harness:check` · `pnpm harness:drift` · `pnpm harness:verify`
- Codex도 동일: `AGENTS.md → .agents/README.md → workflows/*.md` 평문 markdown 직접 실행
- 세부 결정: [ADR-0031](docs/adr/0031-harness-structure-agents-home.md) · [05-rn-harness-decisions](docs/migration/05-rn-harness-decisions.md)

## 2. 작업 시작 프로토콜

사소하지 않은(non-trivial) 요청에 대해 코드를 변경하기 전에, 다음 형식의 짧은 사실 기반 브리프를 한국어로 보고하세요.

1. **Fact 요약** — 사용자 요청, 진행 중인 계획, 저장소 파일, 이전 커밋에서 이미 알려진 사실. 사실과 가정을 분리해서 기술
2. **작업 범위** — 변경될 가능성이 높은 정확한 경로
3. **브랜치** — `develop`/`main` 위에서 사소하지 않은 변경(feat/fix/refactor)을 시작하려면 **먼저 `feat/<scope>-<desc>` · `fix/<scope>-<desc>` · `chore/<desc>` 브랜치를 끊는다**. PR 베이스는 `develop`. `develop` 직접 커밋은 트리비얼 docs/chore(오타 · 룰 인덱스 · 의존 버전 bump)에 한함. 정책 전문은 [`docs/ONBOARDING.md §8`](docs/ONBOARDING.md)
4. **데이터/RLS 영향** — Supabase 테이블, RLS 정책, 마이그레이션, 또는 "없음"
5. **검증 계획** — 작업이 완료되었음을 증명할 커맨드/테스트

"git status 보여줘"나 "이거 커밋해" 같은 사소한 요청은 전체 브리프를 생략하고 바로 실행합니다.

## 3. with-key 가드레일 (절대 원칙)

위반 가능성이 있으면 멈추고 확인하세요. 각 항목에 **왜 1줄**을 동반합니다.

### §아키텍처

- 클라이언트→서버 쓰기는 `_actions.ts`(Server Action)로 일원화. **왜**: 인증/검증/로깅 단일 경로 보장
- `src/app/api/*` Route Handler는 외부 콜백 전용(예: Web Push 콜백). **왜**: 일반 쓰기 경로와 책임 분리
- `useEffect` + `fetch` 쓰기 경로 금지. SWR · React Query 도입 금지. **왜**: POC 범위 초과, RSC(React Server Component) + server fetch가 기본
- route colocation 유지 — feature 컴포넌트·액션은 해당 route `_components/`·`_actions.ts`에 둔다. `src/features/` 신설 금지. **왜**: 화면 30개 이하 POC 단계에서 추상화 추가는 미숙

### §타입 & 검증

- `packages/domain/src/validators/*`(`@withkey/domain`) zod 스키마가 **타입 SoT(Single Source of Truth)**. 도메인 타입은 `z.infer<>`로 도출. **왜**: 런타임 검증과 컴파일 타입을 한 곳에서 동기
- `any` 금지. 불가피하면 `unknown` + 좁히기. **왜**: 타입 안전성 우회 누적은 디버깅 비용 ↑
- DB 타입은 `pnpm db:types` 자동 생성본(`apps/web/src/types/supabase.ts`) — 직접 수정 금지. **왜**: 다음 generate가 변경분을 덮어씀

### §Supabase / RLS

- RLS(Row Level Security)는 **전 테이블 ON**. `supabase/migrations/0002_rls.sql`에서 강제. **왜**: 클라이언트가 anon key로 직접 접근하므로 DB-level 권한이 유일한 방어선
- Storage 사진은 Pre-signed URL만. Public 버킷 금지. **왜**: 사진 URL 노출 → 외부 인덱싱·스크래핑 위험
- migration 파일명: `000X_<snake_case>.sql`. 번호 맨 뒤에만 추가, 재정렬 금지. down 스크립트 없음(POC 단방향). **왜**: 머지된 migration은 production에서 이미 적용됨, 재정렬은 데이터 무결성 깨짐
- Supabase Studio에서 DDL 직접 수정 금지. 모든 스키마 변경은 migration 파일로. **왜**: 재현 가능성

### §키워드 풀 (`packages/domain/src/keywords/pool.ts`)

- **버전 정책**: v1.0 freeze (POC 시작) · v1.1 release 2026-05-22 (meal 추가, [ADR-0015](docs/adr/0015-meal-activity-type.md)) · **이후 추가 변경 금지**. 변경 시 PO 승인 + [`docs/VALIDATION.md`](docs/VALIDATION.md) 재논의 필요. **왜**: PRD §4.6 — 분석 편향 방지(데이터 일관성 보존)
- `KEYWORD_POOL_VERSION` 상수를 `keywords_shown` · `action_logged` 이벤트에 명시 inject — 분석 분기점 marker. **왜**: 릴리스 timestamp 가 deploy 지연·cache·환경차로 부정확하므로 명시 marker 가 robust
- 변경 시 [`docs/adr/`](docs/adr/)에 ADR 추가 + 본 가드레일 갱신

### §AI 일기 (`src/lib/ai/`)

- OpenAI 호출은 `AbortController` + **4.5s 타임아웃** 고정. **왜**: PRD §5.3 AC-4 — P95 5s 목표에 0.5s 버퍼
- 응답 검증: 선택 키워드 커버리지 < 1 이면 `templateFallback()` 폴백. **왜**: 사용자가 빈 응답을 보지 않게
- 프롬프트/응답 **본문을 로그에 남기지 않는다**. 메타만: `latencyMs` · `fallback` · `keywordCoverage` · `promptVersion`. **왜**: 일기 내용은 사용자 사생활

### §Cache Components (`src/lib/db/reads/`)

- viewer-specific cached read 는 각 read 함수 본문에서 `"use cache: private"` directive 와 `cacheTag(...)` · `cacheLife(...)` 를 **inline 으로 직접 선언**한다 (`photo-signed-url.ts` · `list-visible-action-log-ids.ts` · `kudos-viewer.ts` 패턴 참조). user-keyed tag 는 `user-${viewerId}-...` 컨벤션 유지. **왜**: Next.js 16 의 `'use cache'` 컴파일러는 outer-scope 변수를 자동으로 인자로 bind 하는데 **함수는 직렬화 불가** — wrapper(예: 폐기된 `viewerCached`)로 `options.tag(fn)` 같은 함수를 closure 캡처하면 빌드 시점에 `Functions cannot be passed directly to Client Components` 로 실패한다 (`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md §Serialization`)
- `cacheComponents: true` 는 단독 PR(Phase 1b)에서만 켜고 Vercel Preview route smoke 후 머지한다. **왜**: App Router prerendering · React `<Activity>` navigation state 보존이 앱 전체에 영향을 준다
- service-role / `adminClient` 결과는 user-facing cache 에 저장하지 않는다(공개 데이터 cron/worker 예외는 별도 ADR 필요). **왜**: RLS 를 우회한 결과를 캐시하면 viewer boundary 오염 위험이 커진다
- **예외 — hydrate 단계 admin cache ([ADR-0024](docs/adr/0024-admin-cache-after-layer1-visibility.md))**: Layer 1(`listVisibleActionLogIds` 같은 RLS visibility decision) 통과 후 호출되는 hydrate read(`photo-signed-url` · `action-log-hydrate` · `kudos-counts` · `kudos-viewer`)는 `adminClient()` + public `"use cache"` 를 쓸 수 있다. viewer-agnostic read 는 cached inner 함수가 `viewerId` 를 인자로 받지 않아 cross-viewer 로 entry 를 공유하고, viewer-specific read(`kudos-viewer`)는 `viewerId` 를 cached function argument · `cacheTag` · `.eq('user_id', viewerId)` SQL filter 세 곳 모두에 포함한다. **admin hydrate read 는 authorization gate 가 아니며 production callsite 는 `challenge-feed.ts`(Layer 1 이후)로 제한한다** — 임의 RSC 직접 import 는 RLS leak 이므로 ADR 위반으로 다룬다. **왜**: private cache + cookie 의존이 매 요청 token endpoint 폭발(429)을 일으켰고, admin 전환으로 cookies 의존·token 호출을 제거하되 접근 제어는 Layer 1 경계 + SQL filter 로 분리 보존
- `next` · `eslint-config-next` 는 현재 minor line(`16.2.x`) 으로 pin 한다. **왜**: patch 는 수용하되 private cache API 가 바뀔 수 있는 minor 자동 상승은 막는다
- Next.js minor bump 전 `node_modules/next/dist/docs/` 의 `use-cache-private` · `cacheTag` · `cacheLife` · `cacheComponents` 문서와 changelog 를 확인한다. **왜**: private cache 는 v16 에서도 experimental 이라 API/동작 변경 가능성이 있다

### §AnalyticsEvent (`apps/web/src/lib/analytics/track.ts`)

- `AnalyticsEvent` 유니온은 **PRD §9.1 이벤트 표와 1:1**. 임의 이벤트 추가 금지 — PO 승인 필요. **왜**: 분석 파이프라인의 SoT는 PRD, 코드는 그 미러
- 스키마 변경 시 spec(`docs/superpowers/specs/`)에 결정 근거 기록

### §환경 변수 · 시크릿

- 서버 전용 키(`SUPABASE_SECRET_KEY` · `OPENAI_API_KEY` · `VAPID_PRIVATE_KEY`)에 `NEXT_PUBLIC_` 접두 금지. **왜**: 클라이언트 번들에 포함되어 유출
- Supabase 키는 **신규 체계**(`sb_publishable_*` / `sb_secret_*`)만 사용 — 레거시 `*_ANON_KEY` / `*_SERVICE_ROLE_KEY` 금지. 상세 [ADR-0001](docs/adr/0001-supabase-publishable-secret-keys.md)
- production secret은 Vercel Environment Variables만. 메신저·커밋·로그에 붙여넣기 금지
- 새 env 추가 시 [`apps/web/.env.example`](apps/web/.env.example) 주석 동기화 필수

## 4. spec-required 경로 매핑

아래 7개 경로 변경 시 같은 PR에 **spec 또는 ADR**(Architecture Decision Record)을 함께 추가합니다. CI(`scripts/check-spec-required.mjs`)가 부재를 감지하면 stderr 경고를 출력합니다(soft — 차단 없음).

| 트리거 경로                            | 권장 산출물 | 이유                                               |
| -------------------------------------- | ----------- | -------------------------------------------------- |
| `supabase/migrations/**`               | **ADR**     | 단방향(POC 정책), 데이터 손실 가능                 |
| `src/lib/supabase/**`                  | **ADR**     | admin/client/server/middleware 전부 인증 백본      |
| `middleware.ts`                        | **ADR**     | Next.js 인증 진입점                                |
| `packages/domain/src/keywords/pool.ts` | **ADR**     | POC freeze 정책 — PO 승인 + VALIDATION 재논의 필요 |
| `packages/domain/src/validators/**`    | **spec**    | 도메인 7개가 기능 진화 따라 빈번히 변경            |
| `apps/web/src/lib/analytics/track.ts`  | **spec**    | PRD §9.1과 1:1 동기화                              |
| `src/lib/ai/**` (PROMPT_VERSION bump)  | **spec**    | 프롬프트 가역 · A/B 비교 가능                      |

ADR과 spec의 구분은 [`docs/adr/README.md`](docs/adr/README.md), [`docs/superpowers/specs/README.md`](docs/superpowers/specs/README.md)를 참조. 작성자가 권장과 다른 산출물을 골라도 무방하며, 리뷰어가 적정성을 판단합니다.

## 5. 새 문서 작성

세 종류의 문서를 운영하며 scaffolding 스크립트로 생성합니다.

```bash
pnpm new plan <topic-kebab>    # → docs/superpowers/plans/YYYY-MM-DD-<topic>.md  (작업 단위 계획)
pnpm new spec <topic-kebab>    # → docs/superpowers/specs/YYYY-MM-DD-<topic>.md  (설계 결정)
pnpm new adr  <topic-kebab>    # → docs/adr/NNNN-<topic>.md                    (되돌리기 비용 큰 결정)
```

스크립트는 `docs/superpowers/templates/{plan,spec,adr}.md`를 읽어 `{{date}}` · `{{title}}` · `{{author}}` · `{{topic}}`를 치환합니다. ADR 번호는 자동 부여(다음 번호).

## 6. 실행 스타일 · 작업 원칙

- 작은 배치 단위로 실행. 각 배치 이후 변경 내용과 검증 결과(통과/실패)를 요약
- 변경은 외과적(surgical)으로 유지. 무관한 코드·문서·포맷을 재작성하지 않음
- 기존 패턴(네이밍, 폴더 구조, zod 스키마 재사용)을 먼저 확인
- PRD/BE_SCHEMA/코드가 충돌하면 바로 구현하지 않고 차이를 먼저 정리
- 근거 없는 추정 대신 재현 가능한 검증 결과(실행 로그, 테스트 통과)를 남김
- `.claude/commands/*.md` · `.claude/skills/*.md`는 Claude 전용 어댑터. Codex 등 다른 도구는 본 파일과 [`docs/QUALITY_GATE.md`](docs/QUALITY_GATE.md)만 따르면 충분
- 컨텍스트·비용 운영: [`docs/QUALITY_GATE.md`](docs/QUALITY_GATE.md) "AI 에이전트 비용·컨텍스트 운영" 섹션. 큰 파일은 offset+limit, 명령 출력이 크면 background + 부분 추출

## 7. 검증

기본 검증 순서 — 변경 유형별 추가 검증은 [`docs/QUALITY_GATE.md`](docs/QUALITY_GATE.md) "테스트와 검증"을 우선합니다.

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # ESLint
pnpm test           # Vitest (unit)
pnpm validate:docs  # 문서 내부 링크 깨짐
```

추가 검증이 필요한 경우:

- Supabase migration / RLS / RPC 변경 → `pnpm supabase db reset` + 역할별(anon · authenticated) 접근 실측
- 핵심 사용자 플로우 → 모바일 viewport(DevTools 또는 실기) 수동 확인 또는 E2E smoke
- 인증 플로우(`middleware.ts` · `apps/web/src/lib/supabase/middleware.ts`) → 로그인 → 보호 라우트 → 로그아웃 수동 재현
- 설정 변경(`next.config.*`, env, build) → `pnpm build`

## 8. PR · 커밋 · pre-commit hook

### PR

- **PR 본문 · 커밋 메시지 주제는 한국어**(2026-05-21 합의). 섹션 헤더(`## Summary` 등)는 영어 유지 가능. 기술 용어 · 코드 식별자 · 라이브러리/API 이름은 원문(영어) 유지(예: `feat(ui): Textarea + Select primitives 추가`). conventional commits `타입(스코프):` 접두는 영문. 상세는 [`.claude/rules/common/git-workflow.md`](.claude/rules/common/git-workflow.md) §PR 본문 · 커밋 메시지 언어
- [`.github/pull_request_template.md`](.github/pull_request_template.md)가 PR 본문에 자동 prefill — Summary / Spec or ADR / 가드레일 4 체크박스 / Verification / Rollback 골격 제공
- PR 베이스는 `develop`. main 직접 PR은 release 시점에만
- PR 생성 후에는 CI/checks 상태를 성공 또는 실패 결론까지 모니터링하고 결과를 보고한다. 실패 시 원인 로그를 확인해 가능한 범위에서 수정·재푸시 후 다시 모니터링한다.
- `git` 계정은 `pistachio8` 고정. 자동 커밋·푸시는 사용자 확인 후에만

### pre-commit hook (저마찰)

`pnpm install` 시 husky가 `.husky/pre-commit`을 활성화. **동작**: `lint-staged`가 staged 파일에만 `prettier --write` 자동 적용. 차단 거의 없음. **ESLint · typecheck · test · spec-check은 CI 책임이라 hook에 두지 않는다** — ESLint는 모노레포 전환(EVAL-0010) 후 루트 eslint config 부재로 pre-commit에서 제외하고 CI `pnpm -r lint`로 일원화했다.

**우회 채널** (급할 때 또는 hook 자체가 버그일 때):

```bash
WITHKEY_HOOKS=skip git commit ...   # with-key 합의된 우회 신호 (의도 명시적)
git commit --no-verify ...          # 표준 Git 우회
```

Hook이 commit을 차단하거나 1초 이상 느려지면 그 자체가 버그 — issue로 보고. CI가 최종 게이트.

## 9. 작업 종료 보고

구현 작업은 다음 한국어 형식으로 마무리합니다.

1. **명세 요약** — plan/spec 링크, PRD/BE_SCHEMA 참조, 또는 사용자 목표
2. **구현 내역** — 파일명 나열이 아니라 변경된 동작을 기술
3. **변경 파일** — 마크다운 링크
4. **영향 범위** — 앱 경로 · Supabase 테이블/RLS/migration · 외부 서비스
5. **검증 결과** — 실제 실행한 커맨드와 pass/fail/skip
6. **커밋** — 해시와 메시지(생성된 경우)
7. **미해결 / 후속 액션** — 실제로 남아 있는 리스크만

## Technical Scribe 호환성

상세 정책은 개인 파일([`.claude/AGENTS.md`](.claude/AGENTS.md) "항상 실행 규칙")을 참조 — Claude Code 세션 전용으로 가시성을 유지하기 위해 본 파일에서는 인라인하지 않습니다.

## 용어집

- **ADR**: Architecture Decision Record — 되돌리기 비용이 큰 결정을 보존하는 짧은 기록. `docs/adr/`에 ADR-lite 운영
- **PRD §9.1**: PRD(Product Requirements Document) 9.1 — AnalyticsEvent 이벤트 표
- **PWA**: Progressive Web App — 브라우저로 설치 가능한 웹 앱
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어, Supabase에서 활성화
- **RSC**: React Server Component — 서버에서 렌더되는 React 컴포넌트, 클라이언트 번들 미포함
- **scaffolding**: 새 파일을 템플릿으로 자동 생성하는 행위(`pnpm new` 등)
- **SoT**: Single Source of Truth — 중복 정의 없이 한 곳을 기준으로 삼는 원본
- **spec-required 경로**: 변경 시 `docs/superpowers/specs/` 또는 `docs/adr/` 문서를 함께 추가해야 하는 7개 경로(§4)
- **VAPID**: Voluntary Application Server Identification — Web Push의 서버 인증 키 쌍
