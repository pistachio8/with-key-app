import { notFound, redirect } from "next/navigation";
import { toKstDayKey } from "@/lib/challenge/done-days";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { createClient } from "@/lib/supabase/server";
import { markActionStarted } from "../_actions";
import { ActionForm } from "./_components/action-form";

type Params = Promise<{ id: string }>;

// 모킹업 §10 — AI 운동일기 + 결과 모달. ADR-0002에 따라 /action → /challenge/[id]/action sub-route.
// RLS al_insert_active_period 가 active/기간/멤버십 강제. 페이지는 challengeId 검증 + 권한 확인.
// PRD §6.2 — 진입 시 그룹원에게 시작 알림(markActionStarted) 자동 발화. 내부 idempotency 가
// "1일 1회"를 보장하므로 새로고침에도 중복 알림이 가지 않음.
export default async function ChallengeActionPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const isParticipant = detail.members.some((m) => m.id === user.id);
  if (!isParticipant || detail.status !== "active") {
    redirect(`/challenge/${id}`);
  }

  // Fire-and-forget — 응답을 기다리지 않으면 페이지 첫 페인트가 지연되지 않음.
  void markActionStarted({ challengeId: id });

  // 같은 날 N개 피드는 등록 가능하지만 인증은 1회만 카운트 — 기대치 정렬용 배너 신호.
  const { data: latestLog } = await supabase
    .from("action_logs")
    .select("created_at")
    .eq("challenge_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const verifiedToday = latestLog
    ? toKstDayKey(latestLog.created_at) === toKstDayKey(new Date())
    : false;

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <p className="t-caption text-muted-foreground">{detail.title}</p>
        <h1 className="t-h2">AI 운동일기</h1>
      </header>
      <ActionForm challengeId={id} verifiedToday={verifiedToday} />
    </div>
  );
}
