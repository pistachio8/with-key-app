import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { duotoneDataUrl } from "@/lib/share/hero-image";
import { pickOne } from "@/lib/share/seeded-pick";
import { loadCardFonts } from "@/lib/share/og-fonts";
import { formatSharePeriod } from "@/lib/share/period";
import { renderPhotoCard, renderTicketCard, type CardData } from "./templates";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const challengeId = url.searchParams.get("challengeId");
  if (!challengeId) return NextResponse.json({ error: "missing challengeId" }, { status: 400 });
  const template = url.searchParams.get("template") === "ticket" ? "ticket" : "photo";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // fetchRecap이 closed 또는 active+만기 챌린지만 반환하므로 status 재검사는 하지 않는다.
  const recap = await fetchRecap(user.id, { challengeId });
  if (!recap) return NextResponse.json({ error: "not found" }, { status: 404 });

  const seed = Number(url.searchParams.get("seed")) || 0;
  const photos = await fetchChallengePhotos(challengeId, { client: supabase });
  // 내 사진 우선 → 없으면 전체 → 없으면 null (D-E)
  const mine = photos.filter((p) => p.ownerId === user.id);
  const picked = pickOne(mine.length > 0 ? mine : photos, seed);
  const heroUrl = picked
    ? template === "ticket"
      ? await duotoneDataUrl(picked.signedUrl)
      : picked.signedUrl
    : null;
  const allAchieved = recap.members.length > 0 && recap.members.every((m) => m.achieved);

  const data: CardData = {
    groupName: recap.group?.name ?? "우리 그룹",
    period: formatSharePeriod(recap.startAt, recap.endAt),
    doneCount: recap.viewerDoneCount,
    crew: recap.members.length,
    heroUrl,
    allAchieved,
  };

  const fonts = await loadCardFonts();

  return new ImageResponse(template === "ticket" ? renderTicketCard(data) : renderPhotoCard(data), {
    width: 1080,
    height: 1350,
    fonts: fonts.length ? fonts : undefined,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
