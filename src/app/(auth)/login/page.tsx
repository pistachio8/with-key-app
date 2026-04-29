import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// PRD §3.3 AC-3 · Design Brief 화면 1
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col justify-between px-6 py-10">
      <section
        aria-labelledby="brand-heading"
        className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
      >
        <h1 id="brand-heading" className="text-4xl font-black tracking-tight">
          윗키
        </h1>
        <p className="text-muted-foreground break-keep">친구와 함께하는 운동 서약서</p>
      </section>

      <section aria-label="로그인 방법 선택" className="flex flex-col gap-3">
        <Button
          size="lg"
          aria-describedby="consent-note"
          className="h-12 w-full bg-[#FEE500] text-[#191919] hover:bg-[#FEE500]/90"
        >
          <MessageCircle aria-hidden="true" />
          카카오로 시작하기
        </Button>
        <Button size="lg" variant="outline" aria-describedby="consent-note" className="h-12 w-full">
          이메일로 계속하기
        </Button>
        <p id="consent-note" className="text-muted-foreground text-center text-xs">
          계속하면 이용약관 및 개인정보 수집·이용에 동의한 것으로 간주돼요.
        </p>
      </section>
    </main>
  );
}
