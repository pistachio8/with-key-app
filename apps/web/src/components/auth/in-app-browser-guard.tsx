"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildAndroidIntentUrl,
  detectInAppBrowser,
  isAndroid,
  isIOS,
  type InAppBrowserKind,
} from "@/lib/auth/in-app-browser";

// ADR-0008 — 인앱브라우저 진입 시 카카오 OAuth 가 깨지므로 CTA 영역을 안내로 통째 대체.
// SSR 단계에서 결정된 kind (headers().get('user-agent') 기반) 를 props 로 받아 첫 paint
// 부터 가드 노출 — 깜빡임 방지. 클라이언트 hydration 후 navigator 로 재확정 (CDN/proxy
// UA 변조 fallback). targetUrl 은 외부 브라우저 전환 시 그대로 사용할 invite/login 페이지 URL.

type Props = {
  kind: InAppBrowserKind | null;
  targetUrl: string;
  children: React.ReactNode;
};

// 앱별 메뉴 안내 카피 — plan UI 디자인 가이드 §4 표 그대로. UA 변경 시 본 매핑 갱신.
const MENU_HINT: Record<InAppBrowserKind, string> = {
  kakaotalk: "카카오톡 우상단 ⋯ 메뉴 → 'Safari/Chrome 에서 열기'",
  instagram: "인스타그램 우상단 ⋯ 메뉴 → '브라우저에서 열기'",
  facebook: "페이스북 우상단 ⋯ 메뉴 → '시스템 브라우저에서 열기'",
  naver: "네이버 우상단 메뉴 → '외부 브라우저로 열기'",
  line: "라인 우상단 메뉴 → '기본 브라우저에서 열기'",
  other: "오른쪽 상단 메뉴 → '외부 브라우저에서 열기'",
};

type GuardState = {
  kind: InAppBrowserKind | null;
  platform: "android" | "ios" | "other";
};

export function InAppBrowserGuard({ kind: ssrKind, targetUrl, children }: Props) {
  const [state, setState] = useState<GuardState>({
    kind: ssrKind,
    platform: "other",
  });

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    // 마운트 1회 hydration 보강 — UA 가 SSR 추정과 다를 때(CDN/proxy 변조) 재확정.
    // ssrKind 변경 시에만 의존성 재실행. infinite loop 위험 없음.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({
      kind: detectInAppBrowser(ua) ?? ssrKind,
      platform: isAndroid(ua) ? "android" : isIOS(ua) ? "ios" : "other",
    });
  }, [ssrKind]);

  if (!state.kind) return <>{children}</>;
  return <Guide kind={state.kind} platform={state.platform} targetUrl={targetUrl} />;
}

type GuideProps = {
  kind: InAppBrowserKind;
  platform: "android" | "ios" | "other";
  targetUrl: string;
};

function Guide({ kind, platform, targetUrl }: GuideProps) {
  function openExternal() {
    // 카카오톡 최신 버전이 intent 차단한 사례 존재 — 실패 시 메뉴 안내 fallback 으로 보장.
    window.location.href = buildAndroidIntentUrl(targetUrl);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(targetUrl);
      toast.success("복사됐어요. Safari 를 열고 주소창을 길게 눌러 붙여넣기 해주세요.");
    } catch (error) {
      console.error("[InAppBrowserGuard] clipboard write failed:", error);
      toast.error("복사에 실패했어요. 주소창을 길게 눌러 복사해 주세요.");
    }
  }

  const hint = MENU_HINT[kind];
  const [menuStep1, menuStep2Raw] = hint.split(" → ");
  const menuStep2 = menuStep2Raw ?? "브라우저에서 열기";

  return (
    <section
      role="region"
      aria-labelledby="in-app-guard-title"
      className="flex flex-col items-center gap-3 text-center"
    >
      <div
        aria-hidden="true"
        className="bg-[var(--brand-primary-soft)] grid size-12 place-items-center rounded-full"
      >
        <ExternalLink className="text-primary size-5" />
      </div>
      <h2 id="in-app-guard-title" className="t-h3">
        인앱브라우저에서는
        <br />
        카카오 로그인이 안 돼요
      </h2>
      <p className="text-muted-foreground break-keep text-sm">{hint}</p>

      <div className="mt-2 flex w-full flex-col gap-2">
        {platform === "android" && (
          <Button size="lg" className="h-12 w-full" onClick={openExternal}>
            <ExternalLink className="size-4" aria-hidden="true" />
            외부 브라우저로 열기
          </Button>
        )}
        {platform === "ios" && (
          <Button size="lg" variant="outline" className="h-12 w-full" onClick={copyLink}>
            <Copy className="size-4" aria-hidden="true" />
            링크 복사 후 Safari 에서 붙여넣기
          </Button>
        )}
        {platform === "other" && (
          <Button size="lg" variant="outline" className="h-12 w-full" onClick={copyLink}>
            <Copy className="size-4" aria-hidden="true" />
            링크 복사
          </Button>
        )}
      </div>

      <div className="border-border/60 bg-card/80 mt-1 w-full rounded-2xl border p-4 text-left backdrop-blur">
        <p className="text-muted-foreground text-xs">전환이 안 되면 직접:</p>
        <ol className="text-foreground mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>{menuStep1}</li>
          <li>&apos;{menuStep2}&apos; 선택</li>
        </ol>
      </div>
    </section>
  );
}
