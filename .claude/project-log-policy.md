# Project Log Policy

> **개인용 문서**: 이 파일은 `.gitignore`에 의해 커밋되지 않습니다.

`./PROJECT_LOG.md`는 with-key 프로젝트에서 작업 중 발생한 **고가치 의사결정·성능·리스크·지식 자산**을 누적 기록하는 개인 문서다. 이 문서의 갱신 규칙을 정의한다.

## 필수 업데이트 (반드시 기록)

아래에 해당하면 반드시 `./PROJECT_LOG.md`에 기록한다.

- 사용자/운영자 영향이 있는 기능 변경
- 성능/신뢰성/보안 개선
- 아키텍처 결정 또는 트레이드오프
- 포트폴리오 가치가 높은 문제 해결
- 반복된 규칙 이탈이 관찰되어 정책이 바뀐 경우
- 배포 파이프라인(Vercel) / Supabase migration 구조 변경

## 선택 업데이트 (생략 가능)

- 오타 수정, 스타일 정리, rename-only 같은 경미한 수정
- 단일 화면/라우트 내부에 한정된 UI 조정

## 기록 카테고리 (최소 1개에 기록)

1. **Decisions & Trade-offs**
   - 아키텍처/구조/정책 결정과 그 근거
2. **Performance & Reliability**
   - 빌드/런타임 성능, RSC/Server Action 안정성, AI 호출 지연·폴백률
3. **Security & Risk**
   - 보안 이슈(RLS, env 유출), 배포 리스크
4. **Interview Q&A**
   - 주요 문제 해결을 Q&A 형태로 정리 (회고/온보딩/면접 대비)

## 필수 규칙

1. 대화/작업에서 포트폴리오 가치 포인트를 추출한다.
2. 위 4개 카테고리 중 **최소 1개**에 기록한다.
3. 근거가 부족하면 `측정 전(예상/가설)`로 표시한다.
4. 형식: `YYYY-MM-DD` + bullet + `문제: … / 결정: … / 효과: …` 를 권장한다.
5. 결과 응답 끝에 `이번에 추가된 항목 3줄 요약`을 작성한다.

## 기록 우선순위 힌트

- `src/lib/` 공용 모듈(validators · analytics · supabase) 인터페이스 변경: Decisions & Trade-offs + Security & Risk 동시 기록 권장
- Supabase migration 추가/수정 · RLS 정책 변경: Security & Risk 필수 (RLS는 "전 테이블 ON" 원칙 이탈 여부 명시)
- `lib/keywords/pool.ts` 변경: Decisions & Trade-offs 필수 (POC 중 변경 금지 원칙 — PRD §4.6 — 을 깨는 의사결정이므로 근거 필수)
- `lib/ai/prompts.ts` `PROMPT_VERSION` bump: Decisions & Trade-offs + Performance & Reliability (latency · keywordCoverage 재측정)
- PRD §9.1 이벤트 스키마 추가·수정: Decisions & Trade-offs 필수 (`lib/analytics/track.ts` 유니온과 동기화)
- 성능 개선(번들 크기/LCP/INP · AI 호출 지연): Performance & Reliability 필수
- 라이브러리 메이저 업그레이드(Next.js · React · Supabase · Tailwind): 4개 카테고리 모두 관련 가능

## 작성 템플릿 예시

```md
## Decisions & Trade-offs

- YYYY-MM-DD 문제: POC 2주 · 겸임 2인 환경에서 FSD/bulletproof-react의 feature 폴더 규약이 학습/경계 논쟁 비용을 유발할 우려.
  결정: Next.js 공식 route colocation 채택 (`app/(app)/<route>/_components`, `_actions.ts`). 공용은 `src/lib/{supabase,ai,keywords,push,analytics,validators}` + `src/components/ui` (shadcn)만 유지. 화면 30개를 넘으면 `src/features/`로 점진 승격.
  효과: 부트스트랩 당일 9개 화면 스켈레톤 + 빌드 체인(typecheck/lint/build/test) 전 통과.
  영향 범위: `src/app/(app)/**`, `src/lib/**` · 연관 문서: `./drafts/TEAM_SHARE_ENG_ONBOARDING.md` §2 · `./plans/role-recursive-waffle.md`

## Performance & Reliability

- YYYY-MM-DD 측정 전(예상/가설): `lib/ai/diary.ts` 타임아웃을 4.5s로 고정해 PRD §5.3 AC-4의 P95 5s 버퍼 0.5s 확보. 초과 시 키워드 보존 템플릿 폴백 → 사용자 체감상 성공으로 노출.
  검증 계획: Week 2 dogfood 중 `ai_generated` 이벤트의 `latencyMs` P95와 `fallback` 비율 집계.

## Security & Risk

- YYYY-MM-DD 리스크: `SUPABASE_SERVICE_ROLE_KEY` / `OPENAI_API_KEY` / `VAPID_PRIVATE_KEY`를 `NEXT_PUBLIC_` 접두와 혼동해 번들에 유출할 가능성.
  완화: `.env.example`에 서버 전용 키마다 주석 명시. `ONBOARDING §7.1`에 "NEXT_PUBLIC_ 접두 시 번들 포함" 경고 유지. RLS는 `supabase/migrations/0002_rls.sql`로 전 테이블 ON 강제.

## Interview Q&A

- YYYY-MM-DD Q: AI 호출이 실패하거나 키워드를 빠뜨렸을 때 사용자 경험을 어떻게 보장했나요?
  A: PRD §5.3 AC-3/4/8을 구조로 박았습니다 — (1) `AbortController` + 4.5s 타임아웃으로 실패 경로를 명확히 분리하고, (2) 응답에 선택 키워드가 모두 포함됐는지 `keywordCoverage`로 검증, (3) 실패 시 `templateFallback()`이 동일한 키워드를 재사용한 한 줄 인사 문구로 대체합니다. 사용자 화면에는 실패 여부가 드러나지 않고, 서버는 `ai_generated` 이벤트의 `fallback`/`keywordCoverage` 메타만 기록해 프롬프트/타임아웃 튜닝 근거로 쓸 수 있게 했습니다.
```

## 정합성 체크리스트

- [ ] 기록한 날짜가 작업일과 일치한다.
- [ ] 최소 1개 카테고리에 기록되었다.
- [ ] 영향받은 PRD §, 화면 번호, 테이블 이름이 기재되었다(해당 시).
- [ ] 근거 미확정 항목은 `측정 전(예상/가설)`로 표기되었다.
- [ ] `../docs/CLAUDE.md`(행동 규칙) · `./drafts/TEAM_SHARE_PRD_POC.md`(스펙)와 모순되는 서술이 없다.
- [ ] 응답 끝에 `이번에 추가된 항목 3줄 요약`이 포함되었다.

## 문서 상호 참조

- 아키텍처 결정은 `./drafts/TEAM_SHARE_ENG_ONBOARDING.md` §2·§5와 동기화 필요 여부를 확인한다.
- 스펙(유저 스토리 · AC · 이벤트 · 데이터 모델) 변경은 `./drafts/TEAM_SHARE_PRD_POC.md` (§3~§9)에 반영한다.
- 디자인 규약 변경은 `./drafts/TEAM_SHARE_DESIGN_BRIEF.md` §5 컴포넌트 계약과 교차 확인한다.
- 킥오프 확정 사항(`./drafts/KICKOFF.md`)은 D0 스냅샷 — 수정 금지 · 원문 유지 + 취소선 + DECISIONS.md 링크 원칙.

> 단, 이 문서는 개인용(gitignore 대상)이므로, 공식 문서 업데이트는 별도 커밋으로 수행한다.
