// (flow) — wizard/task flow 라우트 그룹. (app) 와 달리 AppHeader 를 렌더하지 않아
// 작성 흐름에 집중할 수 있게 한다. 인증은 각 page.tsx 의 requireUser() 로 위임 —
// (app)/layout 의 supabase.auth.getUser() redirect 와 중복 방지.
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background mx-auto flex min-h-svh w-full max-w-screen-sm flex-col">
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
