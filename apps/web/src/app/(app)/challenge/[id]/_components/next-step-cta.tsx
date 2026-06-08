import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChallengePhase } from "@withkey/domain";

type Props = {
  phase: ChallengePhase;
  isParticipant: boolean;
  mySigned: boolean;
  isSolo: boolean;
};

// PRD §3.4 dual-mode reframing · §4 상태머신. 챌린지 상세 진입 시 "다음에 뭘
// 해야 할지" 를 명시한다. running 은 FAB(카메라)로 인증 진입하므로 여기서는
// 그 외(비참가자 / pending / accepted / over / closed)만 분기 (ADR-0027 — over 는 closed 취급).
export function NextStepCta({ phase, isParticipant, mySigned, isSolo }: Props) {
  if (!isParticipant) {
    if (phase === "running") {
      return <Notice text="이미 시작된 챌린지예요. 다음 챌린지부터 함께해요." />;
    }
    return <Notice text="이 챌린지의 참가자가 아니에요." />;
  }
  if (phase === "over" || phase === "closed") {
    return <Notice text="종료된 챌린지에요." />;
  }
  if (phase === "pending" || phase === "accepted") {
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
          isSolo
            ? "서명 완료. 정보 탭에서 혼자 시작할 수 있어요."
            : "서명 완료. 운영자가 멤버를 확정하면 시작돼요."
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
