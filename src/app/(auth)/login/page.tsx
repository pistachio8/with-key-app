"use client";

import { Suspense, useState, useTransition } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestMagicLink } from "./_actions";
import { OnboardingSlides } from "./_components/onboarding-slides";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";

const messageFor = makeUserMessage({
  upstream_error: "로그인 링크를 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
});

export default function LoginPage() {
  return (
    // useSearchParams 는 Suspense 경계 안에서 호출돼야 한다 (Next.js 16).
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const sp = useSearchParams();
  const onboard = sp.get("onboard") === "1";
  if (onboard) return <OnboardingSlides />;
  const next = sp.get("next");
  return <LoginForm next={next} />;
}

function LoginForm({ next }: { next: string | null }) {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const hasInvite = Boolean(next);

  function submit() {
    startTransition(async () => {
      try {
        // invite 진입에서 받은 next 를 매직링크에 묶어 보낸다 — 클릭 후 callback 의 ?next= 분기가 살아난다.
        const res = await requestMagicLink(email, next ?? undefined);
        if (!res.ok) {
          toast.error(messageFor(res.error));
          return;
        }
        setSentEmail(email);
      } catch (e) {
        console.error(e);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col justify-between px-6 py-10">
      {hasInvite && (
        <section
          aria-label="초대받은 챌린지 안내"
          // 모킹업 §1-B (line 409) invite-banner 톤. 안내 텍스트는 token 미해석이라
          // 구체 챌린지 제목을 못 보여줌 — 로그인 후 /invite/[token] 에서 정식 미리보기.
          className="border-border/60 bg-card/80 flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur"
        >
          <span
            aria-hidden="true"
            className="bg-primary/10 text-primary grid size-9 place-items-center rounded-full"
          >
            <Mail className="size-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-foreground text-sm font-semibold">초대받은 챌린지</span>
            <span className="text-muted-foreground text-xs">로그인 후 바로 서약서로 이동해요</span>
          </div>
        </section>
      )}

      <section
        aria-labelledby="brand-heading"
        className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
      >
        <h1 id="brand-heading" className="flex justify-center">
          <Image
            src="/logo-from-with.svg"
            alt="from.with"
            width={287}
            height={56}
            priority
            unoptimized
            className="h-14 w-auto"
          />
        </h1>
        <p className="text-muted-foreground break-keep">
          {hasInvite
            ? "가입하면 바로 챌린지 서약서로 이동돼요"
            : "친구들과 함께 운동 내기 시작하기"}
        </p>
      </section>

      <section aria-label="로그인 방법 선택" className="flex flex-col gap-3">
        {sentEmail ? (
          <div
            role="status"
            aria-live="polite"
            className="bg-primary/5 border-primary/20 flex flex-col gap-1 rounded-2xl border px-4 py-4 text-center text-sm"
          >
            <span className="text-foreground font-semibold">
              {sentEmail} 으로 로그인 링크를 보냈어요
            </span>
            <span className="text-muted-foreground text-xs">
              메일함을 확인하고 링크를 눌러 주세요
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {/* DIAG (iOS WebKit input 회귀) — base-ui InputPrimitive 가 원인인지 분리하기 위해 native input 으로 교체. 진단 후 되돌릴 것. */}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                placeholder="you@example.com"
                className="border-input bg-card focus:border-ring h-12 w-full rounded-lg border px-4 text-base outline-none"
                aria-label="이메일"
                autoComplete="email"
                inputMode="email"
              />
              {/* DIAG — email state 가 실제 갱신되는지 화면에 표시. 진단 후 제거. */}
              <p className="text-destructive break-all text-xs">
                DEBUG email={JSON.stringify(email)} len={email.length}
              </p>
              <Button
                size="lg"
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
          </>
        )}
      </section>
    </main>
  );
}
