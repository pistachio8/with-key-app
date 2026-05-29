// src/app/(app)/challenge/[id]/recap/page.tsx
import { headers } from "next/headers";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { formatSharePeriod } from "@/lib/share/period";
import { track } from "@/lib/analytics/track";
import { Card } from "@/components/ui/card";
import { AccountInlinePrompt } from "./_components/account-inline-prompt";
import { PhotoGallery } from "./_components/photo-gallery";
import { SettlementReceipt } from "./_components/settlement-receipt";
import { ShareCardAction } from "./_components/share-card-action";

type Params = Promise<{ id: string }>;

// 모킹업 §11 정산 · PRD §10 — ADR-0002: challenge sub-route.
export default async function RecapPage({ params }: { params: Params }) {
  const { id: challengeId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const [recap, photos] = await Promise.all([
    fetchRecap(user.id, { challengeId }),
    fetchChallengePhotos(challengeId, { client: supabase }),
  ]);

  if (!recap) {
    return (
      <div className="flex flex-col gap-6 p-4">
        {/* 챌린지 기간(7~90일) 가변 — "주간" 하드코딩은 30일 챌린지에 어색. 중립 표현. */}
        <h1 className="t-h2">정산</h1>
        <p className="t-sub break-keep">
          아직 결과가 없어요. 챌린지가 끝나면 결과를 여기서 돌아봐요.
        </p>
        <Link
          href={`/challenge/${challengeId}`}
          className="text-primary w-fit text-sm font-semibold underline-offset-4 hover:underline"
        >
          챌린지로 가기
        </Link>
      </div>
    );
  }

  void track(
    { name: "penalty_displayed", props: { amount: recap.viewerPerHeadPenalty } },
    { userId: user.id },
  );

  const isOwner = recap.group?.ownerId === user.id;
  const hasAccount = !!(
    recap.group?.bankCode &&
    recap.group?.accountHolder &&
    recap.group?.accountNumberLast4
  );
  // 조기 종료 = status='closed' AND end_at 가 아직 미래.
  // status='closed' 는 endChallenge action 만 작성 (auto-close 없음) → 운영자가 명시적으로 종료 누름.
  // end_at 미래면 만기 도달 전 종료 = 조기. 만기 도달 후 종료면 그냥 정상 종료로 본다.
  const isEarlyEnded =
    recap.status === "closed" && recap.endAt != null && new Date(recap.endAt) > new Date();
  const isSolo = recap.members.length === 1;
  const groupName = recap.group?.name ?? "우리 그룹";

  // 공유 메시지: 브랜드는 "from. with"(layout.tsx · invite siteName 컨벤션).
  // 카카오톡에서 메시지와 URL 사이 빈 줄을 보존하려면 navigator.share 의 url 필드를
  // 비우고 text 한 덩이로 보낸다(invite-trigger.tsx 패턴). 링크는 서비스 홈.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const homeUrl = `${proto}://${host}/`;
  const sharePeriod = formatSharePeriod(recap.startAt, recap.endAt);
  const shareHeadline = sharePeriod
    ? `${groupName} · ${sharePeriod}의 기록`
    : `${groupName}의 기록`;
  const shareMessage = `${shareHeadline}\n\nfrom. with\n${homeUrl}`;

  return (
    <div className="flex flex-col gap-4 p-4">
      {recap.group && !hasAccount && (
        <AccountInlinePrompt
          groupId={recap.group.id}
          isOwner={isOwner}
          bankCode={recap.group.bankCode}
          accountHolder={recap.group.accountHolder}
        />
      )}

      {isEarlyEnded && (
        <Card tone="muted" padding="sm" className="border-transparent">
          <div className="t-sub break-keep">
            운영자가 기간 만료 전 종료한 챌린지에요. 지금까지의 인증만 정산해요.
          </div>
        </Card>
      )}

      <SettlementReceipt
        groupName={isSolo ? null : groupName}
        title={recap.title}
        durationDays={recap.durationDays}
        startAt={recap.startAt}
        endAt={recap.endAt}
        goalCount={recap.goalCount}
        viewerDoneCount={recap.viewerDoneCount}
        viewerAchieved={recap.viewerAchieved}
        viewerPerHeadPenalty={recap.viewerPerHeadPenalty}
        isSolo={isSolo}
        members={recap.members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          isMvp: m.isMvp,
        }))}
        bankCode={recap.group?.bankCode ?? null}
        accountHolder={recap.group?.accountHolder ?? null}
        accountNumberLast4={recap.group?.accountNumberLast4 ?? null}
      />

      <PhotoGallery photos={photos} />

      <ShareCardAction challengeId={challengeId} shareMessage={shareMessage} />
    </div>
  );
}
