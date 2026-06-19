"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InAppBrowserGuard } from "@/components/auth/in-app-browser-guard";
import type { InAppBrowserKind } from "@/lib/auth/in-app-browser";
import { createClient } from "@/lib/supabase/client";
import { requestMagicLink } from "../_actions";
import { OnboardingSlides } from "./onboarding-slides";
import { DevLoginMenu } from "./dev-login-menu";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";

// ADR-0008 — 매직링크 UI 노출 토글. 카카오 OAuth 가 1차 경로, 매직링크는 코드만 남기고
// UI 진입점만 숨김. Vercel Env 토글로 즉시 fallback 복구.
const MAGIC_LINK_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MAGIC_LINK === "true";

// dev-login 숨긴 메뉴 게이트 (spec §4·§5.3). Preview env scope 에만 NEXT_PUBLIC_DEV_LOGIN=1.
// Production 은 미설정이라 로고 탭 제스처·메뉴가 모두 사라진다.
const DEV_LOGIN_VISIBLE = process.env.NEXT_PUBLIC_DEV_LOGIN === "1";
const DEV_LOGIN_TAPS = 5;

const messageFor = makeUserMessage({
  upstream_error: "로그인 링크를 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
});

type LoginScreenProps = {
  inAppKind: InAppBrowserKind | null;
};

export function LoginScreen({ inAppKind }: LoginScreenProps) {
  const sp = useSearchParams();
  const onboard = sp.get("onboard") === "1";
  if (onboard) return <OnboardingSlides />;
  const next = sp.get("next");
  const searchString = sp.toString();
  return <LoginForm next={next} inAppKind={inAppKind} searchString={searchString} />;
}

type LoginFormProps = {
  next: string | null;
  inAppKind: InAppBrowserKind | null;
  searchString: string;
};

function LoginForm({ next, inAppKind, searchString }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [magicPending, startMagicTransition] = useTransition();
  const [kakaoPending, setKakaoPending] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const devTaps = useRef(0);
  const hasInvite = Boolean(next);

  // 숨긴 제스처: 로고를 DEV_LOGIN_TAPS 회 탭하면 dev 메뉴를 연다. 메뉴가 닫히면 카운터 리셋.
  function handleLogoTap() {
    devTaps.current += 1;
    if (devTaps.current >= DEV_LOGIN_TAPS) {
      devTaps.current = 0;
      setDevMenuOpen(true);
    }
  }

  const pathname = usePathname();
  // InAppBrowserGuard 의 외부 브라우저 전환 target = 현재 페이지 URL. SSR 단계는 path 만,
  // hydration 후 window.location.origin 으로 채움. 가드 자체가 mount 후 paint 되므로 안전.
  const targetUrl = useMemo(() => {
    const path = `${pathname}${searchString ? `?${searchString}` : ""}`;
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }, [pathname, searchString]);

  function submitMagicLink() {
    startMagicTransition(async () => {
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

  async function signInWithKakao() {
    if (kakaoPending) return;
    setKakaoPending(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const callback = `${origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        // ADR-0008: 카카오 콘솔 동의항목과 1:1 정렬. nickname 필수 + image 선택.
        // Supabase default scopes 가 account_email 을 포함하므로 명시적으로 덮어써서 배제 (개인 개발자 앱은 이메일 동의항목 등록 불가).
        options: {
          redirectTo: callback,
          scopes: "profile_nickname profile_image",
        },
      });
      if (error) {
        console.error("[LoginForm] signInWithOAuth kakao failed:", error.message);
        toast.error("카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setKakaoPending(false);
        return;
      }
      // 성공 시 supabase 가 redirect 트리거 — pending 유지로 중복 클릭 방지.
    } catch (e) {
      console.error("[LoginForm] signInWithOAuth threw:", e);
      toast.error(FALLBACK_ERROR_MESSAGE);
      setKakaoPending(false);
    }
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
          {DEV_LOGIN_VISIBLE ? (
            <button type="button" onClick={handleLogoTap} aria-label="from.with" className="flex">
              <Image
                src="/logo-from-with.svg"
                alt="from.with"
                width={287}
                height={56}
                priority
                unoptimized
                className="h-14 w-auto"
              />
            </button>
          ) : (
            <Image
              src="/logo-from-with.svg"
              alt="from.with"
              width={287}
              height={56}
              priority
              unoptimized
              className="h-14 w-auto"
            />
          )}
        </h1>
        <p className="text-muted-foreground break-keep">
          {hasInvite
            ? "가입하면 바로 챌린지 서약서로 이동돼요"
            : "친구들과 함께 운동 내기 시작하기"}
        </p>
      </section>

      <section aria-label="로그인 방법 선택" className="flex flex-col gap-3">
        <InAppBrowserGuard kind={inAppKind} targetUrl={targetUrl}>
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
              <Button
                size="lg"
                aria-describedby="consent-note"
                className="h-12 w-full"
                onClick={signInWithKakao}
                disabled={kakaoPending}
              >
                <KakaoBubbleIcon />
                {kakaoPending ? "로그인 페이지로 이동 중..." : "카카오로 시작하기"}
              </Button>

              {MAGIC_LINK_ENABLED && (
                <>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="이메일"
                    autoComplete="email"
                  />
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 w-full"
                    onClick={submitMagicLink}
                    disabled={magicPending || email.length === 0}
                  >
                    {magicPending ? "링크 보내는 중..." : "이메일로 로그인 링크 받기"}
                  </Button>
                </>
              )}

              <p id="consent-note" className="text-muted-foreground text-center text-xs">
                계속하면 이용약관 및 개인정보 수집·이용에 동의한 것으로 간주돼요.
              </p>
            </>
          )}
        </InAppBrowserGuard>
      </section>

      {DEV_LOGIN_VISIBLE && (
        <DevLoginMenu
          open={devMenuOpen}
          onOpenChange={(o) => {
            setDevMenuOpen(o);
            if (!o) devTaps.current = 0;
          }}
        />
      )}
    </main>
  );
}

function KakaoBubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="fill-current">
      <path d="M12 3.5c-5.5 0-9.95 3.5-9.95 7.83 0 2.81 1.84 5.27 4.6 6.66l-1.17 4.3c-.1.37.31.66.62.45l5.13-3.43c.25.02.51.04.77.04 5.5 0 9.95-3.5 9.95-7.83C21.95 7 17.5 3.5 12 3.5z" />
    </svg>
  );
}
