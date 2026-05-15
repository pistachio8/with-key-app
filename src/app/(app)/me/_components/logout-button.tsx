"use client";

// 마이페이지 로그아웃. signOut() 은 내부적으로 redirect 를 throw 하므로 catch 에서 무시.

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "../_actions";

// Next.js redirect() 는 NEXT_REDIRECT digest 가 붙은 에러를 throw 한다.
function isRedirectError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export function LogoutButton() {
  const [pending, start] = useTransition();
  function handle() {
    start(async () => {
      try {
        await signOut();
      } catch (err) {
        if (isRedirectError(err)) return;
        console.error("[signOut]", err);
        toast.error("로그아웃에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }
  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className="border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40 flex w-full items-center justify-center gap-2 rounded-[14px] border px-4 py-3.5 text-sm font-semibold transition-colors active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60"
    >
      <LogOut className="size-4" aria-hidden="true" />
      {pending ? "로그아웃 중…" : "로그아웃"}
    </button>
  );
}
