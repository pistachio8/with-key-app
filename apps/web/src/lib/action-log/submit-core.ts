// submitActionLog 공유 코어 (D-7 spec C1 · EVAL-0019).
// web Server Action(_actions.ts submitActionLog)과 RN BFF route(POST /api/action-log)가
// 같은 본문을 호출하는 단일 출처(SoT). 이것이 web↔RN drift 를 by construction 으로 막는다.
//
// caller 와의 책임 경계:
//   - 코어가 받는 것: supabase client(주입 — web=cookie 세션, BFF=Bearer token) + 인증된 user.
//   - 코어 밖(caller): client 생성·인증, 그리고 `updateTag` 캐시 tail.
//     `updateTag` 는 Next 16 에서 Server Action 전용(Route Handler 호출 시 throw)이라 코어에 두면
//     BFF 경로가 깨진다 → web wrapper 는 updateTag, BFF 는 revalidateTag 로 caller 별 분기한다.
//   - `revalidatePath` 는 양 컨텍스트에서 호출 가능하므로 코어에 남긴다.
// 메인 경로의 모든 쓰기(insert·Storage·RPC)는 주입된 user client 로 실행되어 RLS 가 강제된다
// (ADR-0036 §2 — Bearer 경로도 RLS, admin 대체 금지). 코어 메인 경로에 adminClient 없음.
import "server-only";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ZodError } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  actionLogInputSchema,
  actionVideoLogInputSchema,
  type ActionLogInput,
  type ActionVideoLogInput,
  type SubmitResult,
  KEYWORD_POOL_VERSION,
  toKstDayKey,
  dayIndexOf,
} from "@withkey/domain";
import { generateDiary, type DiaryResult } from "@/lib/ai/diary";
import { inferMealSlot } from "@/lib/ai/meal-time";
import { track } from "@/lib/analytics/track";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { deletePhoto, uploadPhoto } from "@/lib/storage/action-photos";
import { deleteVideo, uploadVideo } from "@/lib/storage/action-videos";
import { judgeAndRecordVerifyStatus, recordVerifySignals } from "@/lib/verify";
import { dispatchActionCompletedNotification } from "@/lib/push/dispatch";

// 코어가 의존하는 최소 인증 사용자 — withUser(web)·getUser(token)(BFF) 양쪽이 만족한다.
export type AuthedUser = { id: string; email?: string | null };

function readJsonArray(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

type ParsedSubmission =
  | { ok: true; mediaType: "photo"; input: ActionLogInput; file: File | null }
  | { ok: true; mediaType: "video"; input: ActionVideoLogInput; file: File | null }
  | { ok: false; error: ZodError };

function parseFormData(formData: FormData): ParsedSubmission {
  // 영상 인증(spec §C2): 순수 실시간 캡처라 키워드·메모 없이 challengeId + 클립만 온다.
  if (formData.get("mediaType") === "video") {
    const parsed = actionVideoLogInputSchema.safeParse({
      challengeId: String(formData.get("challengeId") ?? ""),
    });
    if (!parsed.success) return { ok: false, error: parsed.error };
    const maybeVideo = formData.get("video");
    const file = maybeVideo instanceof File && maybeVideo.size > 0 ? maybeVideo : null;
    return { ok: true, mediaType: "video", input: parsed.data, file };
  }

  const memoRaw = formData.get("memo");
  const memo = typeof memoRaw === "string" ? memoRaw.trim() : "";
  const raw = {
    challengeId: String(formData.get("challengeId") ?? ""),
    activityType: String(formData.get("activityType") ?? ""),
    selectedKeywords: readJsonArray(formData.get("selectedKeywords")),
    shownKeywords: readJsonArray(formData.get("shownKeywords")),
    rerollCount: Number(formData.get("rerollCount") ?? 0),
    memo: memo.length > 0 ? memo : undefined,
  };
  const parsed = actionLogInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error };

  const maybeFile = formData.get("photo");
  const file = maybeFile instanceof File && maybeFile.size > 0 ? maybeFile : null;
  return { ok: true, mediaType: "photo", input: parsed.data, file };
}

// BE_SCHEMA §8.5. RLS 가 참가자/active/기간 검증. caller 가 client·user 를 주입한다.
export async function submitActionLogCore(
  supabase: SupabaseClient,
  user: AuthedUser,
  formData: FormData,
): Promise<ActionResult<SubmitResult>> {
  const parsed = parseFormData(formData);
  if (!parsed.ok) return validationFailure(parsed.error);

  // Ownership/active 이중 방어: RLS 가 최종 차단하지만 UX 메시지 분기 위해 선제 체크.
  const { data: membership, error: mErr } = await supabase
    .from("challenge_participants")
    .select(
      "user_id, challenges!inner(status, start_at, end_at, duration_days, goal_count, group_id)",
    )
    .eq("challenge_id", parsed.input.challengeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (mErr) return failure(mapSupabaseError(mErr));
  if (!membership) return failure("not_found");
  const ch = Array.isArray(membership.challenges)
    ? membership.challenges[0]
    : membership.challenges;
  if (!ch || ch.status !== "active") return failure("forbidden");
  const now = Date.now();
  if (
    !ch.start_at ||
    !ch.end_at ||
    now < new Date(ch.start_at).getTime() ||
    now > new Date(ch.end_at).getTime()
  ) {
    return failure("forbidden");
  }

  // 본인 인증 로그(생성시각) 전체 조회 — distinct KST 일자로 streak/달성 산출.
  // insert 이전 상태이므로 오늘 인증은 todayKey 로 별도 합산한다.
  const { data: priorLogs } = await supabase
    .from("action_logs")
    .select("created_at")
    .eq("challenge_id", parsed.input.challengeId)
    .eq("user_id", user.id);

  const totalDays = Number(ch.duration_days);
  const goalCount = Number(ch.goal_count);
  const startKstDayKey = toKstDayKey(ch.start_at);
  const todayKey = toKstDayKey(new Date(now));

  const priorDayKeys = new Set((priorLogs ?? []).map((l) => toKstDayKey(l.created_at)));
  // 첫 인증(§10-C): 본 insert 이전 로그가 0건.
  const isFirstAction = (priorLogs?.length ?? 0) === 0;
  const todayWasNewDay = !priorDayKeys.has(todayKey);

  const allDayKeys = new Set(priorDayKeys);
  allDayKeys.add(todayKey);
  const verifiedDays = Array.from(allDayKeys)
    .map((key) => dayIndexOf(key, startKstDayKey))
    .filter((index) => index >= 1 && index <= totalDays)
    .sort((a, b) => a - b);

  // 달성 크로싱 — 정확히 goalCount 에 처음 도달하는 제출에서만 true.
  const doneCountAfter = verifiedDays.length;
  const doneCountBefore = doneCountAfter - (todayWasNewDay ? 1 : 0);
  const goalReached = doneCountBefore < goalCount && doneCountAfter >= goalCount;

  const currentDay = Math.max(1, Math.min(totalDays, dayIndexOf(todayKey, startKstDayKey)));

  // display_name 은 (a) AI 템플릿 fallback 1인칭 톤, (b) 완료 푸시 작성자명 둘 다에 쓰인다.
  // 직접 입력·영상 모드에서도 푸시용으로 필요하므로 분기 밖에서 1회 조회. RLS users_select_self 허용.
  const { data: profile } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const pushDisplayName = profile?.display_name?.trim() || "친구";

  // 인증 본문 분기.
  //  - 영상(spec §C2): 실시간 캡처 자체가 인증 → AI 일기·키워드 없음. ai_summary='' · prompt_version='video'.
  //  - 직접 입력(spec 2026-05-28-action-manual-diary): memo 를 ai_summary 로 승격, 키워드 무시(selected_keywords=[]).
  //  - AI 모드: generateDiary 로 일기 생성.
  let aiSummary: string;
  let templateFallback: boolean;
  let promptVersion: string;
  let aiResult: DiaryResult | null = null;
  let finalKeywords: string[];
  let shownKeywords: string[];
  let rerollCount: number;
  let isDirect: boolean;

  if (parsed.mediaType === "video") {
    aiSummary = "";
    templateFallback = false;
    promptVersion = "video";
    finalKeywords = [];
    shownKeywords = [];
    rerollCount = 0;
    isDirect = false;
  } else {
    const input = parsed.input;
    isDirect = Boolean(input.memo);
    finalKeywords = isDirect ? [] : input.selectedKeywords;
    shownKeywords = input.shownKeywords;
    rerollCount = input.rerollCount;

    if (input.memo) {
      aiSummary = input.memo;
      templateFallback = false;
      promptVersion = "manual";
    } else {
      // meal 만 업로드 시각(now)으로 끼니 추론 — soft context 라 DB/analytics 미저장, 프롬프트에만 주입.
      const mealSlot = input.activityType === "meal" ? inferMealSlot(now) : undefined;

      aiResult = await generateDiary(
        {
          activityType: input.activityType,
          keywords: input.selectedKeywords,
          mealSlot,
        },
        { displayName: profile?.display_name ?? undefined },
      );
      aiSummary = aiResult.summary;
      templateFallback = aiResult.fallback;
      promptVersion = aiResult.promptVersion;
    }
  }

  const insertRow = {
    challenge_id: parsed.input.challengeId,
    user_id: user.id,
    activity_type: parsed.input.activityType,
    photo_path: null,
    selected_keywords: finalKeywords,
    shown_keywords: shownKeywords,
    reroll_count: rerollCount,
    // 직접 입력은 ai_summary 로 승격되고 AI 모드는 memo 가 없으므로 항상 null. 영상은 빈 문자열.
    memo: null,
    ai_summary: aiSummary,
    template_fallback: templateFallback,
    prompt_version: promptVersion,
  };
  // media_type 은 0054 추가 컬럼이나 생성 타입(supabase.ts)이 아직 stale → 영상만 캐스트로 'video' 주입한다.
  // 사진은 DB default 'photo' 로 충족되어 명시하지 않는다(기존 동작 보존).
  const { data, error } = await supabase
    .from("action_logs")
    .insert(
      parsed.mediaType === "video"
        ? ({ ...insertRow, media_type: "video" } as typeof insertRow)
        : insertRow,
    )
    .select("id")
    .single();

  if (error) return failure(mapSupabaseError(error));
  if (!data) return failure("upstream_error");

  // D-018: 2-step media upload → RPC update. 실패는 비파괴 폴백.
  let photoAttached = false;
  let photoSize = 0;
  if (parsed.mediaType === "video") {
    // 영상 인증: 클립 업로드 → update_action_log_video_path 로 video_path 저장.
    // AI 부정탐지(signals/judge) 없음 — 실시간 캡처가 1차 보증, 사후 게이트는 peer-reject(spec §C2).
    if (parsed.file) {
      const upload = await uploadVideo({
        userId: user.id,
        challengeId: parsed.input.challengeId,
        actionLogId: data.id,
        file: parsed.file,
        client: supabase,
      });
      if (upload.ok) {
        const { error: rpcError } = await supabase.rpc("update_action_log_video_path", {
          p_log_id: data.id,
          p_video_path: upload.path,
        });
        if (rpcError) {
          console.error("[submitActionLog] update_action_log_video_path failed", rpcError);
          await deleteVideo(user.id, upload.path, supabase);
        }
      } else {
        console.warn("[submitActionLog] uploadVideo failed", {
          actionLogId: data.id,
          reason: upload.reason,
        });
      }
    }
  } else if (parsed.file) {
    const upload = await uploadPhoto({
      userId: user.id,
      challengeId: parsed.input.challengeId,
      actionLogId: data.id,
      file: parsed.file,
      client: supabase,
    });

    if (upload.ok) {
      const { error: rpcError } = await supabase.rpc("update_action_log_photo_path", {
        p_log_id: data.id,
        p_photo_path: upload.path,
      });
      if (rpcError) {
        console.error("[submitActionLog] update_action_log_photo_path failed", rpcError);
        await deletePhoto(user.id, upload.path, supabase);
      } else {
        photoAttached = true;
        photoSize = parsed.file.size;
        // EVAL-0021 신호 기록 → EVAL-0022 θ 판정(status·model_version write) 파이프라인.
        // 비파괴 — 실패해도 제출은 성공으로 유지하고 after() 로 응답 latency 와 분리한다.
        // 신호 계산 실패(signals=null)는 판정기가 manual_review 로 graceful 처리한다.
        const photoBuffer = Buffer.from(await parsed.file.arrayBuffer());
        after(async () => {
          try {
            const signals = await recordVerifySignals({
              actionLogId: data.id,
              userId: user.id,
              photo: photoBuffer,
              submittedAt: new Date(now),
            });
            await judgeAndRecordVerifyStatus({
              actionLogId: data.id,
              challengeId: parsed.input.challengeId,
              userId: user.id,
              groupId: ch.group_id,
              signals,
            });
          } catch (e) {
            console.error("[submitActionLog] auto verification failed", e);
          }
        });
      }
    } else {
      console.warn("[submitActionLog] uploadPhoto failed", {
        actionLogId: data.id,
        reason: upload.reason,
      });
    }
  }

  // track() is never-throw (D-017) — no .catch needed.
  void track(
    {
      name: "action_logged",
      props: {
        challengeId: parsed.input.challengeId,
        activityType: parsed.input.activityType,
        selectedKeywords: finalKeywords,
        keywordCount: finalKeywords.length,
        hasMemo: isDirect,
        rerollCount,
        photoSize,
        photoAttached,
        poolVersion: KEYWORD_POOL_VERSION,
      },
    },
    { userId: user.id },
  );

  // 직접 입력 모드는 AI 가 돌지 않으므로 ai_generated 를 발사하지 않는다 — latency/coverage/
  // fallback 메트릭 오염 방지(분석에서 직접/AI 구분은 prompt_version='manual' 로).
  if (aiResult) {
    void track(
      {
        name: "ai_generated",
        props: {
          actionLogId: data.id,
          latencyMs: aiResult.latencyMs,
          fallback: aiResult.fallback,
          keywordCoverage: aiResult.keywordCoverage,
          promptVersion: aiResult.promptVersion,
        },
      },
      { userId: user.id },
    );
  }

  // PRD §6.4 — 그룹원에게 인증 완료 push (본인 제외). after() 로 응답 latency 와 분리.
  // 매 제출마다 발송하되 그 날 첫 인증(todayWasNewDay)/재제출 문구를 분기한다.
  after(() =>
    dispatchActionCompletedNotification(
      parsed.input.challengeId,
      { userId: user.id, displayName: pushDisplayName },
      { activityType: parsed.input.activityType, isFirstOfDay: todayWasNewDay },
    ).catch((e) => {
      console.error("[submitActionLog] completion dispatch failed", e);
    }),
  );

  // nested layout 구조에서는 layout 의 fetch 결과 + page 의 feed/dashboard fetch 가
  // Next.js Router cache 로 보관됨. 인증 완료 후 client navigation 으로 돌아왔을 때
  // 새 action_log 가 반영되려면 revalidatePath 가 필수. (updateTag 는 caller 가 담당)
  revalidatePath(`/challenge/${parsed.input.challengeId}`);
  revalidatePath(`/challenge/${parsed.input.challengeId}/dashboard`);

  return success({
    id: data.id,
    summary: aiSummary,
    photoAttached,
    isFirstAction,
    currentDay,
    totalDays,
    verifiedDays,
    goalReached,
    goalCount,
    // EVAL-0049 안 A — 오늘 이미 인증한 뒤의 추가 피드면 true(인증 횟수 미증가).
    alreadyVerifiedToday: !todayWasNewDay,
  });
}
