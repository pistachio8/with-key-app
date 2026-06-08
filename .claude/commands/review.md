---
description: 단일 파일 코드 리뷰 (with-key 관점)
---

> **역할**: 이 파일은 [`../../docs/QUALITY_GATE.md`](../../docs/QUALITY_GATE.md)의 리뷰 기준을 Claude Code에서 실행하는 어댑터다.
> 브랜치 전체 변경을 한 번에 자가 리뷰하려면 `withkey-review` 스킬을 사용한다.

`$ARGUMENTS` 파일을 리뷰해줘. 파일 인자가 없으면 현재 열려있는 파일을 대상으로 한다.

## 체크 항목 (우선순위 순)

1. **아키텍처 가드레일**
   - Route colocation 준수 여부: feature성 컴포넌트/액션이 `app/<route>/_components/`, `app/<route>/_actions.ts` 에 위치하는지 (`src/features/` 금지)
   - 쓰기 경로가 Server Action인지: `useEffect` + `fetch`로 쓰기 수행하지 않는지, `app/api/*`는 외부 콜백(예: Web Push) 전용인지
   - 데이터 패칭이 RSC + `fetch` / Server Action 기반인지 (SWR·React Query 도입 금지)
   - zod 타입 SoT 준수: 도메인 타입을 `src/lib/validators/` 의 `z.infer`로 도출하는지, 중복 수동 타입 선언이 있는지
2. **Supabase / 보안**
   - 서버 전용 키(`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `VAPID_PRIVATE_KEY`)가 클라이언트 컴포넌트에 유입되지 않는지
   - `@supabase/ssr` client 구분: 브라우저는 `lib/supabase/client.ts`, 서버는 `lib/supabase/server.ts` — 혼용 여부
   - RLS 전제 위반이 없는지 (service role로 우회하는 쿼리가 남용되지 않는지)
   - Storage 접근이 Pre-signed URL을 쓰는지 (Public 버킷 금지)
3. **타입 안전성**
   - `any`, 불필요한 타입 단언(`as`), `!` non-null 단언
   - zod 스키마로 검증 없이 외부 입력을 그대로 사용하는 경로
4. **Server Action / RSC 규칙**
   - `'use server'` / `'use client'` 경계가 명확한지
   - Server Action 인자/반환값이 직렬화 가능한지
   - `revalidatePath` / `redirect` 사용 위치가 적절한지
5. **AI 호출 (`src/lib/ai/`)**
   - 4.5초 타임아웃(`AbortController`), 키워드 커버리지 < 1 시 `templateFallback()` 폴백 유지 여부
   - 프롬프트/응답 본문 로깅 금지 (메타데이터만)
6. **이벤트 로깅**
   - `track()` 호출이 `AnalyticsEvent` 유니온에 정의된 이벤트만 쓰는지 (임의 이벤트 추가 금지)
7. **UI / 접근성**
   - shadcn primitive(`src/components/ui/*`) 재사용 여부, 중복 구현 없는지
   - 모바일(PWA) 대상이므로 터치 영역, 로딩/빈/에러 상태 처리
8. **기존 유틸 재사용**
   - `src/lib/utils.ts`(`cn`), `src/lib/keywords/*`, `src/lib/push/*` 등에 이미 있는 기능 중복 여부

## 출력 형식

- 요약 1~2줄
- 이슈 목록 (심각도: Blocker / Major / Minor, 근거 코드 라인 포함)
- 개선 제안 (우선순위 순, 구체적 diff 제안)
- Supabase migration / RLS / env 영향 여부 (예/아니오 + 이유)
