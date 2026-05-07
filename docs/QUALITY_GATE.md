# QUALITY_GATE.md

이 문서는 with-key에서 AI 에이전트와 사람이 공유하는 코딩 품질 기준입니다.
Claude Code, Codex, Cursor 같은 도구별 래퍼는 이 문서를 실행하는 어댑터입니다.

## 목적

품질 기준을 특정 AI 에이전트의 성향이나 명령어에 묶지 않습니다.
모든 구현 작업은 같은 성공 조건, 같은 금지 사항, 같은 검증 기준으로 판단합니다.

## 적용 범위

- 제품 코드: `src/**`
- Supabase: `supabase/migrations/**`, RLS 정책, RPC
- 테스트: `tests/**`, `*.spec.ts`, `*.spec.tsx`
- 설정: Next.js, TypeScript, ESLint, Tailwind, Vercel, 환경 변수
- 문서: 공유 문서와 에이전트 운영 문서

## 공통 성공 기준

작업은 아래 조건을 만족해야 완료로 봅니다.

1. 사용자 목표 또는 PRD AC를 만족한다.
2. 변경 범위가 요청과 직접 연결되어 있다.
3. 기존 아키텍처 가드레일을 어기지 않는다.
4. 실패 경로가 사용자와 개발자 모두에게 이해 가능하다.
5. 변경 위험에 맞는 테스트 또는 수동 검증이 수행됐다.
6. 실행한 검증 명령과 결과가 보고됐다.

## 구현 전 기준

사소하지 않은 작업은 코드 변경 전에 아래를 확인합니다.

1. 관련 PRD AC 또는 사용자 목표
2. 변경 가능성이 높은 경로
3. 데이터/RLS 영향 여부
4. 재사용할 기존 패턴
5. 완료를 증명할 검증 명령

## AI 에이전트 비용과 컨텍스트 운영

품질 기준을 낮추지 않는 범위에서 모델 비용과 컨텍스트 사용량을 줄입니다.

- 기본 코딩 모델은 Sonnet급 모델로 둡니다.
- Opus급 모델은 Plan, 복잡한 리팩터, 보안/RLS/아키텍처 의사결정, 광범위한 장애 분석처럼 실패 비용이 큰 작업에만 사용합니다.
- 단순 요약, 분류, 짧은 문서 정리, 반복적인 경량 작업은 가능하면 더 저렴한 모델을 사용합니다.
- 탐색은 Grep/Glob/`rg`로 범위를 좁힌 뒤 필요한 파일만 읽습니다.
- 큰 파일, 긴 로그, 대량 검색 결과를 한 번에 컨텍스트에 넣지 않습니다.
- `/compact` 같은 컨텍스트 압축은 작업 배치 완료 후, 주제 전환 전, 긴 문서/로그 요약 후, 또는 `/context`가 약 70-80% 이상일 때 수행합니다.
- 토큰 수 200k 같은 고정 임계값만으로 압축 여부를 결정하지 않습니다. 모델별 컨텍스트 크기와 현재 작업 연속성을 함께 봅니다.
- 이미지 업로드 후에는 먼저 필요한 관찰 사실, 결정 사항, 남은 의문을 텍스트로 정리한 뒤 압축합니다.
- 이미지 원본의 세부 시각 정보가 아직 판단 근거라면 압축을 미룹니다.
- Prompt caching 환경 변수는 현재 도구가 실제 지원하는 이름만 문서화하거나 설정합니다. 근거가 확인되지 않은 `ANTHROPIC_CACHE_TTL` 같은 값은 추가하지 않습니다.

## 아키텍처 가드레일

- Feature 컴포넌트와 Server Action은 route 아래에 colocate합니다.
- 클라이언트에서 서버 쓰기는 `_actions.ts`의 Server Action으로 통일합니다.
- Route Handler(`src/app/api/*`)는 외부 콜백 전용입니다.
- RSC와 server fetch를 기본으로 사용합니다.
- `useEffect` + `fetch` 쓰기 경로, SWR, React Query는 도입하지 않습니다.
- `src/features/`는 만들지 않습니다. 화면 30개 초과 시 별도 결정으로 다룹니다.

## 타입과 데이터 계약

- `src/lib/validators/*`의 zod 스키마가 타입 Source of Truth입니다.
- 도메인 타입은 `z.infer<>`로 도출합니다.
- `any`는 금지합니다. 불가피하면 `unknown`으로 받은 뒤 좁힙니다.
- `src/types/supabase.ts` 같은 자동 생성 DB 타입은 직접 수정하지 않습니다.
- `src/lib/analytics/track.ts`의 이벤트 유니온은 PRD §9.1과 1:1로 유지합니다.

## Supabase와 RLS

- 모든 테이블은 RLS를 켭니다.
- 스키마 변경은 migration으로만 수행합니다.
- migration 파일명은 `000X_<snake_case>.sql` 형식을 따릅니다.
- 기존 migration 번호를 재정렬하거나 삭제하지 않습니다.
- Storage 사진은 private bucket과 signed URL만 사용합니다.
- Public bucket은 만들지 않습니다.
- RLS 변경은 anon/authenticated 역할별 접근을 검증합니다.

## 보안 기준

- 서버 전용 키에는 `NEXT_PUBLIC_` 접두를 붙이지 않습니다.
- `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `VAPID_PRIVATE_KEY`는 서버에서만 사용합니다.
- 새 환경 변수는 `.env.example`에 설명을 추가합니다.
- 사용자 입력, 외부 API 응답, 파일 내용은 신뢰하지 않습니다.
- 인증, 권한, DB query, 파일, 암호화, 결제성 기능은 보안 리뷰 대상입니다.
- 프롬프트와 AI 응답 본문은 로그에 남기지 않습니다.

## 테스트와 검증

기본 검증은 아래 순서입니다.

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`

아래 변경은 추가 검증이 필요합니다.

| 변경 유형 | 추가 검증 |
|---|---|
| Next.js 설정, middleware/proxy, env, build 설정 | `pnpm build` |
| Supabase migration/RLS/RPC | migration 재적용 또는 원격 적용 결과 확인, 역할별 접근 테스트 |
| 핵심 사용자 플로우 | 모바일 viewport 수동 확인 또는 E2E smoke |
| Server Action | 성공/실패 응답 shape 테스트, 권한 실패 경로 확인 |
| AI 일기 | timeout, fallback, keyword coverage 테스트 |
| Analytics 이벤트 | Zod schema와 TypeScript union parity 테스트 |

테스트를 생략했다면 이유와 남은 리스크를 보고합니다.

## 리뷰 기준

코드 리뷰는 버그와 회귀 위험을 먼저 봅니다.

- 보안 취약점 또는 데이터 손실 가능성
- RLS 우회 또는 service role 남용
- Server Action/RSC 경계 위반
- zod Source of Truth 이탈
- `any`, 과한 타입 단언, non-null 단언 남용
- 누락된 에러 처리
- 사용자 플로우를 깨는 로딩/빈/오류 상태
- 요청 범위를 벗어난 리팩토링

## 명령 래퍼 기준

`.claude/commands/*.md` 같은 도구별 명령은 이 문서를 실행하는 어댑터입니다.
명령 래퍼는 다음만 도구별로 달라도 됩니다.

- 사용할 agent 이름
- hook 또는 permission 설정
- slash command 문법
- 보고 템플릿의 표현

성공 기준, 금지 사항, 검증 순서는 이 문서와 다르게 만들지 않습니다.

## 작업 종료 보고

구현 작업은 아래를 포함해 보고합니다.

1. 명세 요약
2. 구현 내역
3. 변경 파일
4. 영향 범위
5. 검증 결과
6. 커밋 여부
7. 미해결 리스크 또는 후속 액션

## 용어집

- **AC**: Acceptance Criteria, 인수 기준. 기능이 완료됐는지 판단하는 조건입니다.
- **Adapter**: 공통 기준을 특정 도구에서 실행하기 위한 얇은 연결 문서나 명령입니다.
- **RLS**: Row Level Security, Supabase/Postgres의 행 단위 접근 제어입니다.
- **RSC**: React Server Component. 서버에서 렌더링되는 React 컴포넌트입니다.
- **RPC**: Remote Procedure Call. Supabase에서 Postgres 함수를 호출하는 방식입니다.
- **Server Action**: Next.js에서 서버에서 실행되는 폼/쓰기 처리 함수입니다.
- **Source of Truth**: 여러 곳에서 중복 정의하지 않고 기준으로 삼는 단일 원본입니다.
- **zod**: 런타임 검증과 TypeScript 타입 도출에 사용하는 스키마 라이브러리입니다.
