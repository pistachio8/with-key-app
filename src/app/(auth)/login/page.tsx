"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestMagicLink } from "./_actions";
import { makeUserMessage, FALLBACK_ERROR_MESSAGE } from "@/lib/actions/error-messages";

const messageFor = makeUserMessage({
  upstream_error: "로그인 링크를 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
});

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        const res = await requestMagicLink(email);
        if (!res.ok) {
          toast.error(messageFor(res.error));
          return;
        }
        toast.success("로그인 링크를 이메일로 보냈어요. 메일함을 확인해 주세요.");
      } catch (e) {
        console.error(e);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

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
          disabled
          aria-describedby="consent-note"
          className="h-12 w-full bg-[#FEE500] text-[#191919] hover:bg-[#FEE500]/90"
        >
          <MessageCircle aria-hidden="true" />
          카카오로 시작하기 (v1)
        </Button>

        <div className="flex flex-col gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-12"
            aria-label="이메일"
            autoComplete="email"
          />
          <Button
            size="lg"
            variant="outline"
            aria-describedby="consent-note"
            className="h-12 w-full"
            onClick={submit}
            disabled={pending || email.length === 0}
          >
            {pending ? "링크 보내는 중..." : "이메일로 로그인 링크 받기"}
          </Button>
        </div>

        <p id="consent-note" className="text-muted-foreground text-center text-xs">
          계속하면 이용약관 및 개인정보 수집·이용에 동의한 것으로 간주돼요.
        </p>
      </section>
    </main>
  );
}
