import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchInvitePreview } from "@/lib/db/reads/invite";
import { AcceptForm } from "./_components/accept-form";

type Params = Promise<{ token: string }>;

// PRD §3.3 AC-2/AC-3/AC-4 · §3.4 만료/꽉참 edge cases.
export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent(`/invite/${encodeURIComponent(token)}`);
    redirect(`/login?next=${next}`);
  }

  const preview = await fetchInvitePreview(token);

  if (!preview) {
    return (
      <InviteShell>
        <h1 className="text-xl font-semibold">유효하지 않은 초대</h1>
        <p className="text-muted-foreground break-keep text-sm">
          만료되었거나 존재하지 않는 초대 링크예요. 그룹장에게 새 링크를 요청해 주세요.
        </p>
      </InviteShell>
    );
  }

  if (preview.expired) {
    return (
      <InviteShell>
        <h1 className="text-xl font-semibold">만료된 초대</h1>
        <p className="text-muted-foreground break-keep text-sm">
          이 초대 링크는 72시간이 지나 만료됐어요. 그룹장에게 새 링크를 요청해 주세요.
        </p>
      </InviteShell>
    );
  }

  if (preview.full) {
    return (
      <InviteShell>
        <h1 className="text-xl font-semibold">그룹이 가득 찼어요</h1>
        <p className="text-muted-foreground break-keep text-sm">
          이 그룹은 이미 4명이 참여 중이에요 (최대 인원).
        </p>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <h1 className="text-xl font-semibold">그룹 초대</h1>
      {preview.pendingChallenge ? (
        <PledgeSummary challenge={preview.pendingChallenge} />
      ) : (
        <p className="text-muted-foreground break-keep text-xs">
          아직 진행 중인 서약서가 없어요. 참여하면 그룹장이 서약서를 만들 때 바로 알림을 받아요.
        </p>
      )}
      <AcceptForm token={token} groupName={preview.groupName} />
    </InviteShell>
  );
}

function PledgeSummary({
  challenge,
}: {
  challenge: {
    title: string;
    goalCount: number;
    penaltyAmount: number;
    durationDays: number;
  };
}) {
  return (
    <section
      aria-label="서약서 요약"
      className="bg-muted/40 flex flex-col gap-1 rounded-xl border p-4 text-sm"
    >
      <p className="font-semibold">📜 {challenge.title}</p>
      <p className="text-muted-foreground text-xs">
        {challenge.durationDays}일 · 주 {challenge.goalCount}회 · 벌금{" "}
        {challenge.penaltyAmount.toLocaleString("ko-KR")}원
      </p>
    </section>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col justify-center gap-4 px-6 py-10">
      <section className="bg-card flex flex-col gap-4 rounded-2xl border p-6">{children}</section>
    </main>
  );
}
