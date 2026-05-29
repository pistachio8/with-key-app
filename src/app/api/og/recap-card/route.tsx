import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { duotoneDataUrl } from "@/lib/share/hero-image";
import { formatSharePeriod } from "@/lib/share/period";
import { renderPhotoCard, renderTicketCard, type CardData } from "./templates";

const fontCache: Record<string, ArrayBuffer | null> = {};

async function loadFont(file: string): Promise<ArrayBuffer | null> {
  if (file in fontCache) return fontCache[file];
  try {
    const buf = await readFile(path.join(process.cwd(), "public/fonts", file));
    fontCache[file] = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  } catch {
    fontCache[file] = null;
  }
  return fontCache[file];
}

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

  const photos = await fetchChallengePhotos(challengeId, { client: supabase });
  const latest = photos.length > 0 ? photos[photos.length - 1].signedUrl : null;
  const heroUrl = latest ? (template === "ticket" ? await duotoneDataUrl(latest) : latest) : null;
  const allAchieved = recap.members.length > 0 && recap.members.every((m) => m.achieved);

  const data: CardData = {
    groupName: recap.group?.name ?? "우리 그룹",
    period: formatSharePeriod(recap.startAt, recap.endAt),
    doneCount: recap.viewerDoneCount,
    crew: recap.members.length,
    heroUrl,
    allAchieved,
  };

  const [pretendard, anton] = await Promise.all([
    loadFont("PretendardVariable.woff2"),
    loadFont("Anton-Regular.ttf"),
  ]);
  const fonts = [
    pretendard
      ? { name: "Pretendard", data: pretendard, weight: 400 as const, style: "normal" as const }
      : null,
    pretendard
      ? { name: "Pretendard", data: pretendard, weight: 700 as const, style: "normal" as const }
      : null,
    anton ? { name: "Anton", data: anton, weight: 400 as const, style: "normal" as const } : null,
  ].filter((font): font is NonNullable<typeof font> => font !== null);

  return new ImageResponse(template === "ticket" ? renderTicketCard(data) : renderPhotoCard(data), {
    width: 1080,
    height: 1350,
    fonts: fonts.length ? fonts : undefined,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
