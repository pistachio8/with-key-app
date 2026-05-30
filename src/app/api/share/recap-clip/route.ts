import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { renderPhotoCard, type CardData } from "@/app/api/og/recap-card/templates";
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { fetchRecap } from "@/lib/db/reads/recap";
import { loadCardFonts } from "@/lib/share/og-fonts";
import { formatSharePeriod } from "@/lib/share/period";
import { pickOne, sample } from "@/lib/share/seeded-pick";
import { createClient } from "@/lib/supabase/server";
import { encodeClip } from "./encode";
import { renderIntroFrame } from "./frames";
import { buildStoryboard, MAX_MONTAGE, type Beat } from "./storyboard";

export const maxDuration = 60;

const FPS = 30;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const challengeId = url.searchParams.get("challengeId");
  if (!challengeId) return NextResponse.json({ error: "missing challengeId" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // fetchRecap이 closed 또는 active+만기 챌린지만 반환하므로 OG 라우트와 게이팅이 같다.
  const recap = await fetchRecap(user.id, { challengeId });
  if (!recap) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const seed = Number(url.searchParams.get("seed")) || 0;
    const photos = await fetchChallengePhotos(challengeId, { client: supabase });

    // 엔드카드 = 미리본 사진 카드와 동일: 내 사진 중 seed 픽(없으면 전체).
    const mine = photos.filter((p) => p.ownerId === user.id);
    const endcardPhoto = pickOne(mine.length > 0 ? mine : photos, seed);
    const data: CardData = {
      groupName: recap.group?.name ?? "우리 그룹",
      period: formatSharePeriod(recap.startAt, recap.endAt),
      doneCount: recap.viewerDoneCount,
      crew: recap.members.length,
      heroUrl: endcardPhoto?.signedUrl ?? null,
      allAchieved: recap.members.length > 0 && recap.members.every((member) => member.achieved),
    };

    // 몽타주 = 전체 사진의 seed 샘플(최대 MAX_MONTAGE).
    const montage = sample(photos, MAX_MONTAGE, seed);

    const storyboard = buildStoryboard({ photoCount: montage.length, fps: FPS });
    const fonts = await loadCardFonts();
    const pngs = await Promise.all(
      storyboard.beats.map((beat) => renderBeatPng(beat, data, montage, fonts)),
    );
    const mp4 = await encodeClip({ beats: storyboard.beats, pngs, fps: FPS });

    return new Response(new Uint8Array(mp4), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'inline; filename="recap-clip.mp4"',
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[recap-clip] render failed", {
      challengeId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "clip render failed" }, { status: 500 });
  }
}

async function renderBeatPng(
  beat: Beat,
  data: CardData,
  montage: ReadonlyArray<{ signedUrl: string }>,
  fonts: Awaited<ReturnType<typeof loadCardFonts>>,
): Promise<Buffer> {
  const element =
    beat.kind === "endcard"
      ? renderPhotoCard(data)
      : beat.kind === "intro"
        ? renderIntroFrame(data.groupName)
        : // D-D: 몽타주도 사진 카드 레이아웃. 카드 프레임 고정 + 히어로 사진만 순환.
          renderPhotoCard({ ...data, heroUrl: montage[beat.photoIndex ?? 0]?.signedUrl ?? null });

  const response = new ImageResponse(element, {
    width: 1080,
    height: 1350,
    fonts: fonts.length ? fonts : undefined,
  });
  return Buffer.from(await response.arrayBuffer());
}
