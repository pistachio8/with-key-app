import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "pending" | "accepted" | "active" | "closed";

type Props = {
  status: Status;
  isParticipant: boolean;
  mySigned: boolean;
  isSolo: boolean;
};

// PRD §3.4 dual-mode reframing · §4 상태머신. 챌린지 상세 진입 시 "다음에 뭘
// 해야 할지" 를 명시한다. active 는 StartActionButton 이 별도 처리하므로 여기서는
// 그 외 상태(비참가자 / pending / accepted / closed)만 분기.
export function NextStepCta({ status, isParticipant, mySigned, isSolo }: Props) {
  if (!isParticipant) {
    return <Notice text="이 챌린지의 참가자가 아니에요." />;
  }
  if (status === "closed") {
    return <Notice text="종료된 챌린지에요." />;
  }
  if (status === "pending" || status === "accepted") {
    if (!mySigned) {
      return (
        <Link href="/pledge" className={cn(buttonVariants({ size: "lg" }), "h-12 w-full")}>
          서약서 쓰러 가기
        </Link>
      );
    }
    return (
      <Notice
        text={
          isSolo ? "서명 완료. 잠시 후 시작됩니다." : "서명 완료. 다른 멤버 서명 대기 중이에요."
        }
      />
    );
  }
  return null;
}

function Notice({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground bg-muted/40 rounded-2xl border px-4 py-3 text-sm">{text}</p>
  );
}
