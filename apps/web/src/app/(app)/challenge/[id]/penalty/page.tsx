import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { formatKRW } from "@withkey/domain";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { getAuthedUser } from "@/lib/supabase/auth";
import { fetchPenaltyStatus } from "@/lib/db/reads/penalty-status";
import { PenaltyProofForm } from "./_components/penalty-proof-form";
import { PenaltyProofCard } from "./_components/penalty-proof-card";
import PenaltyLoading from "./loading";

type Params = Promise<{ id: string }>;

// 벌칙(만회 찬스) 창2 화면 (spec §C3·§C4 / EVAL-0044). Next 16 cacheComponents: 셸 sync, dynamic await 는 자식.
export default function PenaltyPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PenaltyLoading />}>
      <PenaltySection params={params} />
    </Suspense>
  );
}

export async function PenaltySection({ params }: { params: Params }) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const status = await fetchPenaltyStatus(id, user.id);
  // RLS 가 비멤버를 걸러 null 이거나(접근 불가), 벌칙 미션이 없는 챌린지(redemption 비활성)면 404.
  if (!status || !status.penaltyMission) notFound();

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Link
          href={`/challenge/${id}`}
          aria-label="챌린지로 돌아가기"
          className="hover:bg-muted focus-visible:ring-ring -ml-1.5 inline-flex size-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="t-h3 flex-1">만회 찬스</h1>
        <Chip tone="secondary">증명 · 판정</Chip>
      </header>

      {/* 미션 카드 — 그룹장이 정한 미션. */}
      <Card padding="md" className="bg-primary text-primary-foreground flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
          그룹장이 정한 미션
        </p>
        <p className="text-[17px] font-bold leading-snug">{status.penaltyMission}</p>
        <p className="flex items-center gap-1.5 text-[12px] opacity-85">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          미달자 모두 같은 미션 수행 · 친구 과반 인정 시 벌금 {formatKRW(status.penaltyAmount)} 면제
        </p>
      </Card>

      <PenaltyBody status={status} />
    </div>
  );
}

function PenaltyBody({
  status,
}: {
  status: NonNullable<Awaited<ReturnType<typeof fetchPenaltyStatus>>>;
}) {
  // 1) 창2 시작 전(종료~+48h) — 아직 미달분 X 확정 중. 진입로(home)에서 노출 안 되지만 직접 URL 방어.
  if (status.windowPhase === "before") {
    return (
      <EmptyState
        icon={Clock}
        title="아직 만회 찬스가 열리지 않았어요"
        description="챌린지 종료 48시간 뒤부터 증명을 제출하고 판정할 수 있어요."
      />
    );
  }

  // 자격: 서약 참가자만(판정·제출). 비참가자(URL 직접 진입)는 차단 카피.
  if (!status.isSigned) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="이 만회 찬스의 참가자가 아니에요"
        description="서약한 참가자만 증명을 제출하거나 판정할 수 있어요."
      />
    );
  }

  // viewer 본인의 제출 자격 — 확정 미달분 X>0.
  const isPenalizedSelf = status.viewerConfirmedPenalty > 0;
  const judgeableProofs = status.proofs.filter((p) => !p.isViewer);
  const canJudge = status.windowPhase === "open";

  return (
    <div className="flex flex-col gap-5">
      {/* 2) 미달자 본인 — 제출 영역(미제출 시 폼, 제출 후 상태 카드). */}
      {isPenalizedSelf && (
        <section className="flex flex-col gap-3" aria-labelledby="penalty-submit-heading">
          <h2 id="penalty-submit-heading" className="t-caption">
            내 만회 찬스
          </h2>
          {status.viewerProof ? (
            // 이미 제출됨 — 상태 카드(판단중/면제/반려/만료). 재제출은 창2 open 일 때만 폼으로.
            <PenaltyProofCard proof={status.viewerProof} canJudge={false} />
          ) : status.windowPhase === "open" ? (
            <PenaltyProofForm challengeId={status.challengeId} />
          ) : (
            // 만료 + 미제출 → 2배 이월(자동 확정은 cron/EVAL-0045, UI 는 안내만).
            <Card tone="muted" padding="md" className="border-transparent">
              <p className="t-sub text-[13px]">
                제출 기간이 끝났어요. 미제출이라 벌금이 2배로 다음 정산에 이월돼요.
              </p>
            </Card>
          )}
        </section>
      )}

      {/* 3) 동료 판정 — 본인 외 증명들. */}
      <section className="flex flex-col gap-3" aria-labelledby="penalty-judge-heading">
        <h2 id="penalty-judge-heading" className="t-caption">
          친구들의 증명 판정
        </h2>
        {judgeableProofs.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="아직 제출된 증명이 없어요"
            description={
              canJudge
                ? "증명이 올라오면 여기서 판정할 수 있어요. 마감까지 제출이 없으면 자동으로 벌금 2배가 이월돼요."
                : "판정 기간이 끝났어요."
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {judgeableProofs.map((proof) => (
              <PenaltyProofCard key={proof.proofId} proof={proof} canJudge={canJudge} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
