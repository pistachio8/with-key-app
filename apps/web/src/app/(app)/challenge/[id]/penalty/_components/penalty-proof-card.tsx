// 한 명의 벌칙 증명 카드 — 영상 + (본인 외) 판정 토글 (spec §C4 / EVAL-0044, mockup penalty-review.html).
// RSC: 영상은 signed URL 만 재생(public 버킷 금지). 판정 토글은 client(PenaltyJudgeButtons)에 위임.

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import type { PenaltyProofView } from "@/lib/db/reads/penalty-status";
import { PenaltyJudgeButtons } from "./penalty-judge-buttons";

type Props = {
  proof: PenaltyProofView;
  // 판정 가능 여부 — 창2 open + viewer 가 서약 참가자 + 본인 증명 아님.
  canJudge: boolean;
};

const STATUS_LABEL: Record<
  PenaltyProofView["status"],
  { text: string; tone: "success" | "secondary" | "neutral" }
> = {
  pending: { text: "판정 대기", tone: "neutral" },
  accepted: { text: "면제 확정", tone: "success" },
  rejected: { text: "반려 · 2배 이월", tone: "secondary" },
  expired: { text: "기간 만료", tone: "secondary" },
};

export function PenaltyProofCard({ proof, canJudge }: Props) {
  const status = STATUS_LABEL[proof.status];
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="t-body font-semibold">
          {proof.isViewer ? "내 증명" : `${proof.performerName}님의 증명`}
        </p>
        <Chip tone={status.tone}>{status.text}</Chip>
      </div>

      {proof.videoSignedUrl ? (
        <video
          src={proof.videoSignedUrl}
          playsInline
          controls
          preload="metadata"
          className="bg-foreground/95 aspect-[9/12] w-full rounded-2xl object-cover"
          aria-label={`${proof.performerName}님의 증명 영상`}
        />
      ) : (
        <div className="bg-muted text-muted-foreground flex aspect-[9/12] w-full items-center justify-center rounded-2xl text-[12px]">
          영상을 불러올 수 없어요
        </div>
      )}

      {/* 과반 반려면 표시. 본인이 아니고 판정 가능하면 토글 노출. */}
      {canJudge && !proof.isViewer && proof.status === "pending" ? (
        <PenaltyJudgeButtons
          proofId={proof.proofId}
          rejectCount={proof.rejectCount}
          viewerRejected={proof.viewerRejected}
        />
      ) : (
        !proof.isViewer && (
          <p className="text-muted-foreground text-center text-[11px]">
            반려 {proof.rejectCount}명 · 누가 눌렀는지는 공개되지 않아요
          </p>
        )
      )}
    </Card>
  );
}
