"use server";

import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";
import { z, type ZodError } from "zod";
import {
  actionLogInputSchema,
  type ActionLogInput,
  KEYWORD_POOL_VERSION,
  toKstDayKey,
  dayIndexOf,
} from "@withkey/domain";
import { generateDiary, type DiaryResult } from "@/lib/ai/diary";
import { inferMealSlot } from "@/lib/ai/meal-time";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { deletePhoto, uploadPhoto } from "@/lib/storage/action-photos";
import { recordVerifySignals } from "@/lib/verify";
import { dispatchActionCompletedNotification } from "@/lib/push/dispatch";

type SubmitResult = {
  id: string;
  summary: string;
  photoAttached: boolean;
  // 첫 인증 성공 모달(§10-C) 분기.
  isFirstAction: boolean;
  // 슬라이드 day 카운터(§10-B) — KST 캘린더 기준 오늘 일차 (1-indexed, clamp 1..totalDays).
  currentDay: number;
  // 총 챌린지 일수 (DaySlider 1..N).
  totalDays: number;
  // 인증한 challenge 일차 인덱스(1..totalDays, 정렬) — streak 채도용.
  verifiedDays: number[];
  // 이번 제출이 누적 인증일수를 goalCount 에 처음 도달시켰는지(컨페티 트리거).
  goalReached: boolean;
  // 목표 횟수(주 N회 빈도값, POC 정산은 전체 distinct 일수와 비교).
  goalCount: number;
};

function readJsonArray(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function parseFormData(
  formData: FormData,
):
  | { ok: true; input: ActionLogInput; file: File | null }
  | { ok: false; error: ZodError<ActionLogInput> } {
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
  return { ok: true, input: parsed.data, file };
}

// 사진 1회 교체(EVAL-0024) 입력 — 본문은 안 받는다(불변). challengeId·actionLogId 만 식별.
const replacePhotoInputSchema = z.object({
  challengeId: z.string().uuid(),
  actionLogId: z.string().uuid(),
});

type ReplacePhotoResult = {
  id: string;
  // 교체된 새 photo_path (서명 URL 재발급/리렌더용).
  photoPath: string;
};

// BE_SCHEMA §8.5. RLS 가 참가자/active/기간 검증.
export const submitActionLog = withUser<FormData, SubmitResult>(
  async (user, formData): Promise<ActionResult<SubmitResult>> => {
    const parsed = parseFormData(formData);
    if (!parsed.ok) return validationFailure(parsed.error);

    const supabase = await createClient();

    // Ownership/active 이중 방어: RLS 가 최종 차단하지만 UX 메시지 분기 위해 선제 체크.
    const { data: membership, error: mErr } = await supabase
      .from("challenge_participants")
      .select("user_id, challenges!inner(status, start_at, end_at, duration_days, goal_count)")
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

    // 직접 입력 일기(spec 2026-05-28-action-manual-diary): memo 가 채워졌으면 AI 를
    // 건너뛰고 입력 글을 그대로 일기로 저장하며, 키워드는 무시한다(selected_keywords=[]).
    const isDirect = Boolean(parsed.input.memo);
    const finalKeywords = isDirect ? [] : parsed.input.selectedKeywords;

    // display_name 은 (a) AI 템플릿 fallback 1인칭 톤, (b) 완료 푸시 작성자명 둘 다에 쓰인다.
    // 직접 입력 모드에서도 푸시용으로 필요하므로 분기 밖에서 1회 조회. RLS users_select_self 허용.
    const { data: profile } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const pushDisplayName = profile?.display_name?.trim() || "친구";

    let aiSummary: string;
    let templateFallback: boolean;
    let promptVersion: string;
    let aiResult: DiaryResult | null = null;

    if (parsed.input.memo) {
      aiSummary = parsed.input.memo;
      templateFallback = false;
      promptVersion = "manual";
    } else {
      // meal 만 업로드 시각(now)으로 끼니 추론 — soft context 라 DB/analytics 미저장, 프롬프트에만 주입.
      const mealSlot = parsed.input.activityType === "meal" ? inferMealSlot(now) : undefined;

      aiResult = await generateDiary(
        {
          activityType: parsed.input.activityType,
          keywords: parsed.input.selectedKeywords,
          mealSlot,
        },
        { displayName: profile?.display_name ?? undefined },
      );
      aiSummary = aiResult.summary;
      templateFallback = aiResult.fallback;
      promptVersion = aiResult.promptVersion;
    }

    const { data, error } = await supabase
      .from("action_logs")
      .insert({
        challenge_id: parsed.input.challengeId,
        user_id: user.id,
        activity_type: parsed.input.activityType,
        photo_path: null,
        selected_keywords: finalKeywords,
        shown_keywords: parsed.input.shownKeywords,
        reroll_count: parsed.input.rerollCount,
        // 직접 입력은 ai_summary 로 승격되고 AI 모드는 memo 가 없으므로 항상 null.
        memo: null,
        ai_summary: aiSummary,
        template_fallback: templateFallback,
        prompt_version: promptVersion,
      })
      .select("id")
      .single();

    if (error) return failure(mapSupabaseError(error));
    if (!data) return failure("upstream_error");

    // D-018: 2-step photo upload → RPC update. 실패는 비파괴 폴백 (photoAttached=false).
    let photoAttached = false;
    let photoSize = 0;
    if (parsed.file) {
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
          // EVAL-0021: 결정론 검증 신호(phash·EXIF·스크린샷)를 EVAL-0020 컬럼에 기록한다.
          // status 판정은 하지 않는다(θ 의존 → EVAL-0022). 비파괴 — 실패해도 제출은 성공으로 유지하고
          // after() 로 응답 latency 와 분리한다. phash 는 저장된(리사이즈) 이미지 기준이라 결정론적이다.
          const photoBuffer = Buffer.from(await parsed.file.arrayBuffer());
          after(() =>
            recordVerifySignals({
              actionLogId: data.id,
              userId: user.id,
              photo: photoBuffer,
              submittedAt: new Date(now),
            }).catch((e) => {
              console.error("[submitActionLog] recordVerifySignals failed", e);
            }),
          );
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
          rerollCount: parsed.input.rerollCount,
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
    // 새 action_log 가 반영되려면 revalidatePath 가 필수.
    revalidatePath(`/challenge/${parsed.input.challengeId}`);
    revalidatePath(`/challenge/${parsed.input.challengeId}/dashboard`);
    // Phase 5-1: 본인 verifiedToday 즉시 fresh — /home 의 stats/list cache 무효화.
    updateTag(`user-${user.id}-home-feed`);

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
    });
  },
);

// EVAL-0024 (WP4) — 마감 전 1회 사진 교체. 잘못 올린 사진을 마감 전 한 번만 바로잡는다(AC-auto-verify-5).
// 2회째·마감 후는 서버 가드로 차단. 본문(키워드·종류·일기)은 불변이고 photo_path 만 갱신된다.
//
// 1회 제한 추적: action_logs.edited_at(0001, immutability 목록에서 제외 — 0045 §C)을 플래그로 쓴다.
//   edited_at IS NULL = 미교체. 교체 성공 시 now() 를 기록 → 이후 IS NOT NULL 이면 2회째로 거부한다.
// immutability 예외(EVAL-0020, 0045/0046): photo_path 교체는 예외 ②. photo_path·edited_at 갱신은
//   adminClient(service_role)로 한 번에 atomic UPDATE 한다 — `.is("edited_at", null)` 조건이 1회 제한을
//   race-safe 하게 강제하고(동시 2요청 중 1건만 성공), recordVerifySignals(EVAL-0021)가 같은 흐름에서
//   이미 admin write 를 쓰는 패턴과 정렬된다. 기존 update_action_log_photo_path RPC(0011)는 edited_at·
//   once-gate 를 지원하지 않고 그 확장은 migration 이라 본 task 의 non-goal 이다.
export const replaceActionPhoto = withUser<FormData, ReplacePhotoResult>(
  async (user, formData): Promise<ActionResult<ReplacePhotoResult>> => {
    const parsed = replacePhotoInputSchema.safeParse({
      challengeId: String(formData.get("challengeId") ?? ""),
      actionLogId: String(formData.get("actionLogId") ?? ""),
    });
    if (!parsed.success) return validationFailure(parsed.error);

    const maybeFile = formData.get("photo");
    const file = maybeFile instanceof File && maybeFile.size > 0 ? maybeFile : null;
    if (!file) return failure("invalid_input", { photo: ["required"] });

    const { challengeId, actionLogId } = parsed.data;
    const supabase = await createClient();

    // 소유·마감·교체여부 선제 조회(RLS — 본인 행만). end_at/status 로 마감 가드, edited_at 로 1회 가드.
    const { data: log, error: readErr } = await supabase
      .from("action_logs")
      .select("photo_path, edited_at, challenges!inner(status, end_at)")
      .eq("id", actionLogId)
      .eq("challenge_id", challengeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readErr) return failure(mapSupabaseError(readErr));
    if (!log) return failure("not_found");

    const ch = Array.isArray(log.challenges) ? log.challenges[0] : log.challenges;
    const now = Date.now();
    // 마감 후/비활성 차단 — submitActionLog 와 동일한 active + end_at 게이트.
    if (!ch || ch.status !== "active" || !ch.end_at || now > new Date(ch.end_at).getTime()) {
      return failure("forbidden");
    }
    // 이미 1회 교체됨 — 2회째 차단(빠른 경로, 업로드 전에 거부).
    if (log.edited_at) return failure("conflict");

    // 교체 사진 업로드 — 새 nonce 로 새 object 가 생성되므로 기존 object 와 충돌하지 않는다.
    const upload = await uploadPhoto({
      userId: user.id,
      challengeId,
      actionLogId,
      file,
      client: supabase,
    });
    if (!upload.ok) {
      return failure(upload.reason === "upload_failed" ? "upstream_error" : "invalid_input");
    }

    // photo_path + edited_at atomic 교체. `.is("edited_at", null)` 가 1회 제한의 최종(race-safe) 게이트다.
    const admin = adminClient();
    const { data: updated, error: updErr } = await admin
      .from("action_logs")
      .update({ photo_path: upload.path, edited_at: new Date(now).toISOString() })
      .eq("id", actionLogId)
      .eq("user_id", user.id)
      .is("edited_at", null)
      .select("id")
      .maybeSingle();

    if (updErr) {
      await deletePhoto(user.id, upload.path, supabase);
      return failure(mapSupabaseError(updErr));
    }
    if (!updated) {
      // 동시 요청이 먼저 슬롯을 차지함 — 방금 올린 object 를 정리하고 2회째로 거부한다.
      await deletePhoto(user.id, upload.path, supabase);
      return failure("conflict");
    }

    // 직전 사진 정리(best-effort) — 실패해도 교체 자체는 성공으로 본다.
    if (log.photo_path && log.photo_path !== upload.path) {
      await deletePhoto(user.id, log.photo_path, supabase);
    }

    // 교체 시 부정탐지 신호 재실행(EVAL-0021) — phash/EXIF/스크린샷 재계산. status 판정은 안 한다(EVAL-0022).
    // after() 로 응답 latency 와 분리하고 비파괴(실패해도 교체는 성공).
    const photoBuffer = Buffer.from(await file.arrayBuffer());
    after(() =>
      recordVerifySignals({
        actionLogId,
        userId: user.id,
        photo: photoBuffer,
        submittedAt: new Date(now),
      }).catch((e) => {
        console.error("[replaceActionPhoto] recordVerifySignals failed", e);
      }),
    );

    revalidatePath(`/challenge/${challengeId}`);
    revalidatePath(`/challenge/${challengeId}/dashboard`);
    updateTag(`user-${user.id}-home-feed`);

    return success({ id: actionLogId, photoPath: upload.path });
  },
);
