import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { renderPhotoCard, type CardData } from "@/app/api/og/recap-card/templates";
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { fetchRecap } from "@/lib/db/reads/recap";
import { loadCardFonts } from "@/lib/share/og-fonts";
import { formatSharePeriod } from "@/lib/share/period";
import { createClient } from "@/lib/supabase/server";
import { encodeClip } from "./encode";
import { renderIntroFrame, renderMontageFrame } from "./frames";
import { buildStoryboard, type Beat } from "./storyboard";

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
    const photos = await fetchChallengePhotos(challengeId, { client: supabase });
    const heroUrl = photos.length > 0 ? photos[photos.length - 1].signedUrl : null;
    const data: CardData = {
      groupName: recap.group?.name ?? "우리 그룹",
      period: formatSharePeriod(recap.startAt, recap.endAt),
      doneCount: recap.viewerDoneCount,
      crew: recap.members.length,
      heroUrl,
      allAchieved: recap.members.length > 0 && recap.members.every((member) => member.achieved),
    };

    const storyboard = buildStoryboard({ photoCount: photos.length, fps: FPS });
    const fonts = await loadCardFonts();
    const pngs = await Promise.all(
      storyboard.beats.map((beat) => renderBeatPng(beat, data, photos, fonts)),
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
  photos: ReadonlyArray<{ signedUrl: string }>,
  fonts: Awaited<ReturnType<typeof loadCardFonts>>,
): Promise<Buffer> {
  const element =
    beat.kind === "endcard"
      ? renderPhotoCard(data)
      : beat.kind === "intro"
        ? renderIntroFrame(data.groupName)
        : renderMontageFrame(photos[beat.photoIndex ?? 0]?.signedUrl ?? null);

  const response = new ImageResponse(element, {
    width: 1080,
    height: 1350,
    fonts: fonts.length ? fonts : undefined,
  });
  return Buffer.from(await response.arrayBuffer());
}
