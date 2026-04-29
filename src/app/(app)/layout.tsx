import { redirect } from "next/navigation";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { createClient } from "@/lib/supabase/server";

// 로컬 수동 확인 전용 — `.env.local` 에 DEV_BYPASS_AUTH=1 설정 시 auth guard 우회.
// production 빌드 (NODE_ENV=production) 에서는 env 값 무시 — 실수로 배포돼도 차단됨.
const DEV_BYPASS_AUTH =
  process.env.NODE_ENV !== "production" && process.env.DEV_BYPASS_AUTH === "1";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (DEV_BYPASS_AUTH) {
    console.warn("[DEV] AppLayout auth guard bypassed — DEV_BYPASS_AUTH=1");
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col">
      <main id="main" className="flex-1">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
