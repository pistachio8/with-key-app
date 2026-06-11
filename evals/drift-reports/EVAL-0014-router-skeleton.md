# Drift Report — EVAL-0014 Expo Router skeleton + auth gate

- Task: **EVAL-0014** (Track: port · Kind: migration)
- Branch: `feat/rn-router-skeleton`
- Date: 2026-06-11
- Trigger: `apps/mobile/src/app` route tree 재구성(G5) — flat(`index`·`login`·`auth/callback`) → 04 §3 IA group 구조((auth)/(app)/(tabs)/(flow)/challenge/[id]) + auth gate + legacy alias.

## Harness Impact Questions — 답변

1. **New folder structure? YES** — `apps/mobile/src/app/` 이 04 §3 IA 그대로 group 트리가 됐다: `(auth)/{login,invite/[token]}` · `(app)/_layout`(auth gate) · `(app)/(tabs)/{home,me}` · `(app)/challenge/[id]/{_layout,index,action,pledge,recap}` · `(app)/(flow)/challenge/new`(modal) · `+not-found`. 공용 placeholder 는 `src/shared/components/placeholder-screen.tsx`(04 §5.1 shared leaf). `navigation/` 미신설 — `app/` 이 네비게이션 SoT.
2. **New naming convention? YES** — mobile route group/param 네이밍이 00 §10 map 과 1:1 로 고정됐다: group 은 `(auth)`/`(app)`/`(tabs)`/`(flow)`, dynamic param 은 `[id]`(challenge uuid)·`[token]`(invite). param 검증은 route 경계 `_layout`/screen 에서 `@withkey/domain` zod 재사용(`challengeSchema.shape.id` · `inviteTokenSchema`) — domain 패키지 무변경.
3. **New dependency? YES (devDependency 1개)** — `@testing-library/react-native@^13.2.0`. `expo-router/testing-library`(renderRouter 로 실제 route tree 를 렌더하는 router/gate 테스트)의 optional peer 라 테스트 전용으로 추가. 런타임 dependency 는 EVAL-0011 범위에서 추가 없음(AT 예상 "No beyond EVAL-0011"에서의 유일한 이탈).
4. **Verification commands changed? NO** — `pnpm --filter @withkey/mobile test -- router` 가 AT 에 이미 명시돼 있었고 `src/router-skeleton.spec.tsx` 가 그 패턴에 매칭된다. 신규 스크립트/게이트 없음.
5. **Harness outdated? NO** — route map coverage 결정론 체크는 별도 harness check 대신 mobile jest spec(`G5 route map coverage` describe — G5 route file 존재 + `navigation/` 부재를 fs 로 검증)으로 흡수했다. `.agents/` 체크 추가 불요.
6. **`.agents/` update? NO(불요)** — `.agents/` 경로/워크플로 변경 없음.

## 구현 무결성

- auth gate 는 `(app)/_layout` 한 곳: SecureStore 복원 중(isLoading) 스피너로 판정 보류(flash 금지, EVAL-0012 계약 유지) → 미인증 `Redirect /login`. 인증→login 우회는 `(auth)/login` 의 `Redirect /home`. invite preview 는 (auth) group 에 두어 미인증도 도달 가능(00 §1.1 — 로그인/수락 CTA 화면, accept orchestration 은 EVAL-0013).
- 00 §1.2 legacy alias: `/action`·`/feed`·`/pledge`·`/recap` 은 (app) 내 alias route 로 유지하되 `/home` 고정 redirect(active challenge resolution 은 read 계약 EVAL-0016/0017 이후). `/group/new`·`/settings` 는 "RN에서는 제거" 그대로 미생성 — `+not-found` 가 `/` 로 회수. primary route 중복 없음.
- data fetching 은 placeholder guard 만 — Supabase read/mutation 호출 0건(EVAL-0016/0017/0018/0019 경계 봉인).
- PWA(`apps/web`) 무변경.

## 관찰된 별개 항목

- 작업 중 working tree 에서 발견된 harness 정비 편집 2건(`implement-agent-task.md` step 6 신설 — AC green 시 AT Status `done` 갱신을 같은 WP 브랜치에 커밋, `0012` Status `done` 정리)을 같은 브랜치의 별도 chore 커밋으로 반영했다. 본 task(0014)의 Status `done` 전환은 그 step 6 을 따른 것.
