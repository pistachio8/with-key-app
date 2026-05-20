import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchInvitePreview } from "@/lib/db/reads/invite";
import { detectInAppBrowser } from "@/lib/auth/in-app-browser";
import { ShareCard } from "@/components/ui/share-card";
import { AcceptForm } from "./_components/accept-form";

type Params = Promise<{ token: string }>;

// spec 2026-05-17-invite-og-preview C5 — KakaoTalk 카드 텍스트는 (image · title · description)
// 3중 안전망. 이미지 미표시 클라이언트를 위해 og:title 이 이미지 hook 과 동일.
// noindex 는 토큰 bearer 시크릿 인덱싱 차단.
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const preview = await fetchInvitePreview(token);

  const groupLabel = preview?.groupName ?? "친구";
  const title = `${groupLabel}이 같이 운동하자고 해요`;
  const challenge = preview?.pendingChallenge ?? null;
  const description = challenge
    ? `${challenge.title} · ${challenge.durationDays}일 · 주 ${challenge.goalCount}회 · 탭해서 함께 시작하기`
    : "탭해서 그룹에 참여하기";

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: "from. with",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// PRD §3.3 AC-2/AC-3/AC-4 · §3.4 만료/꽉참 edge cases.
// spec 2026-05-17-invite-og-preview C1 — 진입 redirect 제거: 익명 사용자도 미리보기를
// 보고 AcceptForm 에서만 로그인 게이트. Server Component redirect() 가 HTML(메타 포함)을
// 송출하지 않으므로 카톡 OG 크롤러를 위해서도 필수.
export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ADR-0008 — SSR 단계 인앱뷰 kind 결정. AcceptForm 의 isAuthed=false 분기 가드 wrap 용.
  const h = await headers();
  const inAppKind = detectInAppBrowser(h.get("user-agent"));

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

  // 모킹업 §5-A (line 717~739) — "초대장 도착" 카피에서 이모지 제거 (plan §3.3 Step 4).
  const inviterLabel = preview.groupName ?? "친구";
  return (
    <main className="bg-card mx-auto flex min-h-svh w-full max-w-screen-sm flex-col px-6 py-6">
      <header className="flex items-center justify-between">
        <Link
          href="/home"
          aria-label="홈으로"
          className="text-foreground -ml-2 inline-grid size-9 place-items-center rounded-full"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <Image
          src="/logo-from-with.svg"
          alt="from.with"
          width={123}
          height={24}
          priority
          unoptimized
          className="h-6 w-auto"
        />
      </header>

      <section className="mt-2">
        <p className="text-muted-foreground text-xs">초대장 도착</p>
        <h1 className="t-h1 mt-1 break-keep">
          {inviterLabel}님이 같이
          <br />
          운동하자고 해요
        </h1>
      </section>

      {preview.pendingChallenge ? (
        <div className="mt-6">
          <ShareCard
            title={preview.pendingChallenge.title}
            footer={
              <div className="bg-card/95 text-foreground rounded-xl p-3">
                <p className="text-muted-foreground text-[11px]">
                  {preview.pendingChallenge.durationDays}일 · 주{" "}
                  {preview.pendingChallenge.goalCount}회
                </p>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <p className="text-muted-foreground text-[10px]">실패 시 벌금</p>
                    <p className="text-sm font-bold">
                      {preview.pendingChallenge.penaltyAmount.toLocaleString("ko-KR")}원
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-[10px]">최대 인원</p>
                    <p className="text-sm font-bold">4명</p>
                  </div>
                </div>
              </div>
            }
          />
        </div>
      ) : (
        <p className="text-muted-foreground mt-6 break-keep text-xs">
          아직 진행 중인 서약서가 없어요. 참여하면 그룹장이 서약서를 만들 때 바로 알림을 받아요.
        </p>
      )}

      <p className="text-muted-foreground mt-3 text-center text-[11px]">
        탭에서 바로 참여 · 앱 설치 불필요
      </p>

      <div className="mt-auto pt-6">
        <AcceptForm
          token={token}
          groupName={preview.groupName}
          isAuthed={user !== null}
          inAppKind={inAppKind}
        />
      </div>
    </main>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col items-center justify-center gap-6 px-6 py-10">
      <Image
        src="/logo-from-with.svg"
        alt="from.with"
        width={164}
        height={32}
        priority
        unoptimized
        className="h-8 w-auto"
      />
      <section className="bg-card flex w-full flex-col gap-4 rounded-2xl border p-6">
        {children}
      </section>
    </main>
  );
}
