# supabase/

로컬 Supabase 개발 환경. Docker Desktop 필요.

```bash
pnpm supabase start           # 로컬 스택 기동 (Postgres, Auth, Studio 등)
pnpm supabase db reset        # migrations + seed 재적용
pnpm supabase migration new <name>   # 새 마이그레이션 파일 생성
pnpm supabase db diff         # 로컬 변경사항 SQL 추출
```

## 원칙

- 모든 DDL은 마이그레이션 파일로만. Studio 직접 수정 금지.
- 파일명은 `000X_<snake_case>.sql` — 번호는 **맨 뒤에 추가**, 기존 번호 재정렬 금지.
- RLS는 `0002_rls.sql` 하나에 모아 관리. 전 테이블 ON.
- 되돌리기는 "앞으로 가는 마이그레이션"으로만. down 스크립트 금지 (POC 단방향).
