# QUALITY_GATE.md

with-key의 AI 에이전트와 사람이 공유하는 코딩 품질 기준. Claude Code · Codex · Cursor 같은 도구별 래퍼는 이 문서를 실행하는 어댑터다. 성공 조건, 금지 사항, 검증 순서는 도구와 무관하게 통일.

적용 범위: `src/**` · `supabase/migrations/**` · 테스트(`tests/**`, `*.spec.ts(x)`) · 설정(Next.js, TS, ESLint, Tailwind, Vercel, env) · 공유 문서.

## 공통 성공 기준

작업 완료 조건:

1. 사용자 목표 또는 PRD AC 충족
2. 변경 범위가 요청과 직접 연결
3. 아키텍처 가드레일 미위반
4. 실패 경로가 사용자/개발자 모두에게 이해 가능
5. 변경 위험에 맞는 테스트 또는 수동 검증 수행
6. 실행한 검증 명령과 결과가 보고됨

## 구현 전 기준

사소하지 않은 작업은 코드 변경 전에 확인:

1. 관련 PRD AC 또는 사용자 목표
2. 변경 가능성이 높은 경로
3. 데이터/RLS 영향
4. 재사용할 기존 패턴
5. 완료를 증명할 검증 명령

## AI 에이전트 비용·컨텍스트 운영

품질을 낮추지 않는 범위에서 비용·컨텍스트 사용량을 줄인다.

- 기본 코딩 모델은 Sonnet급. Opus급은 Plan · 복잡한 리팩터 · 보안/RLS/아키텍처 의사결정 · 광범위한 장애 분석 등 실패 비용이 큰 작업에만.
- 단순 요약·분류·반복 작업은 더 저렴한 모델.
- 탐색은 Grep/Glob/`rg`로 범위 좁힌 뒤 필요한 파일만 읽기. 큰 파일/긴 로그/대량 결과를 통째로 컨텍스트에 넣지 않기.
- `/compact`는 작업 배치 완료 · 주제 전환 · 긴 문서 요약 후 또는 `/context` 70~80% 이상에서. 토큰 수 단일 임계값으로 결정하지 않기.
- 이미지: 관찰 사실/결정/의문을 텍스트로 정리한 뒤 압축. 원본 시각 정보가 아직 판단 근거면 압축 보류.
- Prompt caching env 변수는 도구가 실제 지원하는 이름만. 근거 미확인 변수(`ANTHROPIC_CACHE_TTL` 등) 추가 금지.

## 아키텍처 가드레일

- Feature 컴포넌트와 Server Action은 route 아래 colocate.
- 클라이언트→서버 쓰기는 `_actions.ts` Server Action으로 통일.
- Route Handler(`src/app/api/*`)는 외부 콜백 + RN BFF(Bearer 인증) 전용(ADR-0036). PWA 클라이언트의 BFF endpoint 호출 금지.
- RSC + server fetch 기본. `useEffect` + `fetch` 쓰기 경로 · SWR · React Query 도입 금지.
- `src/features/` 신설 금지. 화면 30개 초과 시 별도 결정.

## 타입과 데이터 계약

- `packages/domain/src/validators/*`(`@withkey/domain`) zod 스키마가 타입 Source of Truth. 도메인 타입은 `z.infer<>`로 도출.
- `any` 금지. 불가피하면 `unknown`으로 받고 좁히기.
- `src/types/supabase.ts` 등 자동 생성 DB 타입 직접 수정 금지.
- `src/lib/analytics/track.ts` 이벤트 유니온은 PRD §9.1과 1:1.

## Supabase와 RLS

- 모든 테이블 RLS ON.
- 스키마 변경은 migration으로만. 파일명 `000X_<snake_case>.sql` 형식. 기존 번호 재정렬·삭제 금지.
- Storage 사진은 private bucket + signed URL. Public bucket 금지.
- RLS 변경은 anon/authenticated 역할별 접근을 검증.

## 보안 기준

- 서버 전용 키에 `NEXT_PUBLIC_` 접두 금지. `SUPABASE_SERVICE_ROLE_KEY` · `OPENAI_API_KEY` · `VAPID_PRIVATE_KEY`는 서버 전용.
- 새 env 변수는 `.env.example`에 설명 추가.
- 사용자 입력 · 외부 API 응답 · 파일 내용은 신뢰하지 않음.
- 인증/권한/DB query/파일/암호화/결제성 기능은 보안 리뷰 대상.
- 프롬프트와 AI 응답 본문은 로그 금지.

## 테스트와 검증

기본 순서: `pnpm typecheck` → `pnpm lint` → `pnpm test`.

추가 검증이 필요한 변경:

| 변경 유형                                          | 추가 검증                                                |
| -------------------------------------------------- | -------------------------------------------------------- |
| Next.js 설정 · middleware/proxy · env · build 설정 | `pnpm build`                                             |
| Supabase migration/RLS/RPC                         | migration 재적용 또는 원격 적용 확인, 역할별 접근 테스트 |
| 핵심 사용자 플로우                                 | 모바일 viewport 수동 확인 또는 E2E smoke                 |
| Server Action                                      | 성공/실패 응답 shape 테스트, 권한 실패 경로 확인         |
| AI 일기                                            | timeout · fallback · keyword coverage 테스트             |
| Analytics 이벤트                                   | Zod schema와 TS union parity 테스트                      |

테스트 생략 시 이유와 남은 리스크 보고.

## 리뷰 기준

버그와 회귀 위험을 먼저:

- 보안 취약점 또는 데이터 손실 가능성
- RLS 우회 또는 service role 남용
- Server Action/RSC 경계 위반
- zod Source of Truth 이탈
- `any` · 과한 타입 단언 · non-null 단언 남용
- 누락된 에러 처리
- 사용자 플로우를 깨는 로딩/빈/오류 상태
- 요청 범위를 벗어난 리팩토링

## 명령 래퍼

`.claude/commands/*.md` 등 도구별 래퍼는 이 문서를 실행하는 어댑터. agent 이름·hook·slash 문법·보고 템플릿 표현만 도구별로 달라질 수 있고, 성공 기준·금지 사항·검증 순서는 본 문서와 동일해야 한다.

## 용어집

- **AC**: Acceptance Criteria, 인수 기준
- **Adapter**: 공통 기준을 특정 도구에서 실행하기 위한 얇은 연결 문서/명령
- **RLS**: Row Level Security, Supabase/Postgres 행 단위 접근 제어
- **RSC**: React Server Component
- **RPC**: Remote Procedure Call (Supabase Postgres 함수 호출)
- **Server Action**: Next.js의 서버 측 폼/쓰기 처리 함수
- **Source of Truth**: 중복 정의 없이 기준으로 삼는 단일 원본
- **zod**: 런타임 검증 + TS 타입 도출 스키마 라이브러리
