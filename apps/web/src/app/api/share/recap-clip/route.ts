import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import type { ReactElement } from "react";
import { renderPhotoCard, type CardData } from "@/app/api/og/recap-card/templates";
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { fetchRecap } from "@/lib/db/reads/recap";
import { loadCardFonts } from "@/lib/share/og-fonts";
import { formatSharePeriod, pickOne, sample } from "@withkey/domain";
import { createClient } from "@/lib/supabase/server";
import { encodeClip } from "./encode";
import { renderIntroFrame } from "./frames";
import { buildStoryboard, MAX_MONTAGE, type Beat } from "./storyboard";

export const maxDuration = 60;

const FPS = 30;

// per-frame 렌더 타임아웃·동시성 예산 — maxDuration=60s 안에서 satori 비용을 묶는다.
// beat 는 최대 8장(intro 1 + photo ≤MAX_MONTAGE(6) + endcard 1). 동시성 cap 3 으로 묶으면
// 최악 ceil(8/3)=3 배치, 8s × 3 = 24s 로 인코딩(ffmpeg)에 여유를 남긴다. 한 프레임이 8s 안에
// 못 끝나면(주로 hero 사진 fetch 가 행) 더 기다리지 않고 폴백 — 요청 전체 500 을 막는다.
const FRAME_TIMEOUT_MS = 8_000;
const RENDER_CONCURRENCY = 3;
const MAX_RENDER_ATTEMPTS = 2; // 최초 1 + 재시도 1. 모두 실패하면 정적 폴백.

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
    // 무제한 Promise.all 대신 동시성 cap 으로 묶어 satori 동시 렌더 비용을 제한한다.
    // 결과는 beat index 위치에 채워 순서(intro→photo→endcard)와 렌더 호출 총 수를 보존한다.
    const pngs = await mapWithLimit(storyboard.beats, RENDER_CONCURRENCY, (beat) =>
      renderBeatPngSafe(beat, data, montage, fonts, { challengeId }),
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

function pickBeatElement(
  beat: Beat,
  data: CardData,
  montage: ReadonlyArray<{ signedUrl: string }>,
): ReactElement {
  return beat.kind === "endcard"
    ? renderPhotoCard(data)
    : beat.kind === "intro"
      ? renderIntroFrame(data.groupName)
      : // D-D: 몽타주도 사진 카드 레이아웃. 카드 프레임 고정 + 히어로 사진만 순환.
        renderPhotoCard({ ...data, heroUrl: montage[beat.photoIndex ?? 0]?.signedUrl ?? null });
}

function renderElement(
  element: ReactElement,
  fonts: Awaited<ReturnType<typeof loadCardFonts>>,
): Promise<Buffer> {
  const response = new ImageResponse(element, {
    width: 1080,
    height: 1350,
    fonts: fonts.length ? fonts : undefined,
  });
  return response.arrayBuffer().then((buf) => Buffer.from(buf));
}

function renderBeatPng(
  beat: Beat,
  data: CardData,
  montage: ReadonlyArray<{ signedUrl: string }>,
  fonts: Awaited<ReturnType<typeof loadCardFonts>>,
): Promise<Buffer> {
  return renderElement(pickBeatElement(beat, data, montage), fonts);
}

// per-frame 격리: 한 프레임의 지연·실패가 요청 전체 500 으로 번지지 않게 한다.
// 최초 1회 + 재시도 1회(=2회) 모두 타임아웃/throw 면 정적 폴백 프레임으로 대체한다.
async function renderBeatPngSafe(
  beat: Beat,
  data: CardData,
  montage: ReadonlyArray<{ signedUrl: string }>,
  fonts: Awaited<ReturnType<typeof loadCardFonts>>,
  meta: { challengeId: string },
): Promise<Buffer> {
  for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt += 1) {
    try {
      return await withTimeout(
        renderBeatPng(beat, data, montage, fonts),
        FRAME_TIMEOUT_MS,
        `${beat.kind} frame`,
      );
    } catch (error) {
      console.error("[recap-clip] frame render failed", {
        challengeId: meta.challengeId,
        beatKind: beat.kind,
        attempt,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  // 재시도 소진 → 단색 배경 + 그룹명 폴백(네트워크 사진을 안 그리는 가장 안정적인 렌더).
  console.error("[recap-clip] frame fell back to static", {
    challengeId: meta.challengeId,
    beatKind: beat.kind,
    attempt: MAX_RENDER_ATTEMPTS,
  });
  try {
    return await renderElement(renderIntroFrame(data.groupName), fonts);
  } catch (error) {
    // 텍스트만 그리는 폴백마저 실패 = 렌더 파이프라인 전체 손상. 내놓을 프레임이 없으므로
    // 상위 catch 로 올려 500 으로 둔다(이 단일 프레임이 아니라 전체가 망가진 catastrophic floor).
    console.error("[recap-clip] static fallback frame also failed", {
      challengeId: meta.challengeId,
      beatKind: beat.kind,
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

// 한 프레임 렌더를 ms 초과 시 reject. 원본 렌더는 abort 되지 않지만(satori 미지원),
// 행이 걸린 hero 사진 fetch 를 더 기다리지 않고 재시도/폴백으로 넘긴다.
// 타임아웃 후 원본 promise 가 뒤늦게 reject 해도 Promise.race 가 이미 reaction 을 붙여둬
// unhandledRejection 으로 새지 않는다.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} render exceeded ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// 동시성 cap: p-limit 의존성 없이 worker 풀로 묶는다(신규 dep 회피, 단순성 우선).
// 결과를 입력 index 위치에 그대로 채워 beat 순서를 보존하고, fn 호출 총 수는 items.length 로 불변.
async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      // JS 단일 스레드: index 캡처와 cursor 증가는 await 이전이라 원자적 — worker 간 중복 처리 없음.
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  }
  const pool = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(pool);
  return results;
}
