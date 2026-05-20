"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InAppBrowserGuard } from "@/components/auth/in-app-browser-guard";
import type { InAppBrowserKind } from "@/lib/auth/in-app-browser";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { acceptInvite } from "../_actions";
import { InviteLoadingDots } from "./invite-loading-dots";

const userMessage = makeUserMessage({
  not_found: "만료되었거나 유효하지 않은 초대 링크예요.",
  forbidden: "그룹 인원이 가득 찼어요 (최대 4명).",
  invalid_input: "잘못된 초대 링크예요.",
});

type Props = {
  token: string;
  groupName: string | null;
  isAuthed: boolean;
  // ADR-0008 — isAuthed=false 분기에서 인앱뷰 가드 노출용. optional 로 두어 기존 호출자 호환.
  inAppKind?: InAppBrowserKind | null;
};

// PRD §3.2 원본 유저 플로우: 참여 → 서약서 확인 → 서명.
// 수락 성공 시 /pledge 로 보내 기존 서약 UI 를 재사용한다.
// pending 챌린지가 없으면 /pledge 가 "서명할 서약서 없음" empty state 를 보여준다.
//
// isAuthed=false (카톡 등 cold-land 익명 진입) 는 spec 2026-05-17-invite-og-preview C2:
// 미리보기는 보여주되 수락 액션만 로그인 게이트. callback 의 ?next= 분기(#53)가
// 로그인 후 같은 /invite/{token} 으로 복귀시킨다.
export function AcceptForm({ token, groupName, isAuthed, inAppKind = null }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 가드 외부 열기 target = 현재 invite 페이지 URL. 인앱뷰에서 외부 브라우저 전환 시 같은
  // URL 재진입 → 외부에서도 동일 OG 카드/챌린지 컨텍스트 보존 (ADR-0008 Decision).
  const inviteUrl = useMemo(() => {
    const path = `/invite/${encodeURIComponent(token)}`;
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }, [token]);

  if (!isAuthed) {
    const next = encodeURIComponent(`/invite/${encodeURIComponent(token)}`);
    return (
      <InAppBrowserGuard kind={inAppKind} targetUrl={inviteUrl}>
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground break-keep text-sm">
            <span className="font-semibold">{groupName ?? "이름 없는 그룹"}</span> 에 참여하려면
            먼저 로그인해주세요.
          </p>
          <Button
            size="lg"
            className="h-12 w-full"
            onClick={() => router.push(`/login?next=${next}`)}
          >
            로그인하고 참여하기
          </Button>
        </div>
      </InAppBrowserGuard>
    );
  }

  function onClick() {
    startTransition(async () => {
      try {
        const res = await acceptInvite(token);
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        router.push(res.data.redirectTo);
      } catch (err) {
        console.error("[AcceptForm] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  if (pending) {
    // 모킹업 §5-B (line 741~750) — pending 동안 §5-B 전환 화면을 같은 자리에 렌더.
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 py-2 text-center"
      >
        <span aria-hidden="true" className="text-4xl">
          🎉
        </span>
        <div>
          <p className="t-h3">
            초대받은 챌린지의
            <br />
            서약서로 이동합니다
          </p>
          <p className="text-muted-foreground mt-2 text-xs">서명 후 바로 챌린지에 합류돼요</p>
        </div>
        <div className="mt-2">
          <InviteLoadingDots />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground break-keep text-sm">
        <span className="font-semibold">{groupName ?? "이름 없는 그룹"}</span> 에 참여하시겠어요?
        <br />
        참여하면 바로 서약서 서명 화면으로 이동해요.
      </p>
      <Button size="lg" className="h-12 w-full" onClick={onClick}>
        참여하기
      </Button>
    </div>
  );
}
