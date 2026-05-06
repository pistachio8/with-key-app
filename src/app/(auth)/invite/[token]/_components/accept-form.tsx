"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { acceptInvite } from "../_actions";

const userMessage = makeUserMessage({
  not_found: "만료되었거나 유효하지 않은 초대 링크예요.",
  forbidden: "그룹 인원이 가득 찼어요 (최대 4명).",
  invalid_input: "잘못된 초대 링크예요.",
});

type Props = {
  token: string;
  groupName: string | null;
};

// PRD §3.2 원본 유저 플로우: 참여 → 서약서 확인 → 서명.
// 수락 성공 시 /pledge 로 보내 기존 서약 UI 를 재사용한다.
// pending 챌린지가 없으면 /pledge 가 "서명할 서약서 없음" empty state 를 보여준다.
export function AcceptForm({ token, groupName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        const res = await acceptInvite(token);
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        router.push("/pledge");
      } catch (err) {
        console.error("[AcceptForm] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground break-keep text-sm">
        <span className="font-semibold">{groupName ?? "이름 없는 그룹"}</span> 에 참여하시겠어요?
        <br />
        참여하면 바로 서약서 서명 화면으로 이동해요.
      </p>
      <Button size="lg" className="h-12 w-full" onClick={onClick} disabled={pending}>
        {pending ? "참여 중..." : "참여하고 서명하러 가기"}
      </Button>
    </div>
  );
}
