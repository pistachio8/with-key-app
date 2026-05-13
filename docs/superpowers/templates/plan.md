---
plan: {{date}}-{{topic}}
title: {{title}}
author: {{author}}
date: {{date}}
status: draft
---

## 목표

<!-- 이 작업으로 무엇을 달성하는가. PRD AC 번호가 있으면 함께 명시. 1~3줄. -->

## 영향 범위

- 변경 경로: <!-- 예: src/app/(app)/<route>/**, src/lib/<...>/** -->
- 데이터/RLS 영향: <!-- Supabase 테이블/RLS/migration 또는 "없음" -->
- 외부 서비스: <!-- OpenAI, Web Push, Supabase Auth 등 또는 "없음" -->
- 재사용 후보: <!-- src/lib/validators/*, src/components/ui/* 등 -->

## 작업 단계

<!-- 작은 배치 단위로. 각 단계는 검증이 가능해야 함. -->

1. <!-- 단계 1 — 검증: <명령/방법> -->
2. <!-- 단계 2 — 검증: <명령/방법> -->
3. <!-- 단계 3 — 검증: <명령/방법> -->

## 검증

```bash
# 예: pnpm typecheck && pnpm lint && pnpm test
```

수동 확인 항목(해당 시):

- [ ] 모바일 viewport 주요 플로우
- [ ] 인증 플로우(`middleware.ts` 변경 시)
- [ ] migration 재적용(`pnpm supabase db reset`)

## 리스크 / 미해결

<!-- 알려진 리스크, 가정, 후속 액션. 없으면 "없음" -->
