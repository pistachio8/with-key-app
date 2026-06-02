import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";

// Next.js 16 cacheComponents: 셸은 sync — dynamic auth 호출은 RootRedirect 자식에서.
// root 는 인증 상태에 따라 /home 또는 /login 으로 즉시 redirect — fallback 노출 시간은 거의 없음.
export default function RootPage() {
  return (
    <Suspense fallback={null}>
      <RootRedirect />
    </Suspense>
  );
}

async function RootRedirect(): Promise<null> {
  // requireUser 가 미인증 시 /login 으로 자체 redirect. 인증된 경우만 아래 line 실행.
  await requireUser();
  redirect("/home");
  // unreachable — redirect() 는 never 반환. 명시 return 으로 JSX component type 만족.
}
