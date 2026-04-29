"use server";

import { actionLogInputSchema, type ActionLogInput } from "@/lib/validators/action-log";
import { generateDiary } from "@/lib/ai/diary";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, validationFailure, type ActionResult } from "@/lib/actions/response";

// BE_SCHEMA §8.5 · action_logs 에 AI 결과 흡수
// NOTE: photoUrl 은 Day 2 PR 에서 Supabase Storage signed URL 로 교체.
// NOTE: Day 2 — user 가 challengeId 의 참가자인지 ownership 검증 추가 (signPledge 와 동일 패턴).
type SubmitResult = { id: string; summary: string };

export const submitActionLog = withUser<ActionLogInput, SubmitResult>(
  async (_user, input): Promise<ActionResult<SubmitResult>> => {
    const parsed = actionLogInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const diary = await generateDiary({
      activityType: parsed.data.activityType,
      keywords: parsed.data.selectedKeywords,
      memo: parsed.data.memo,
    });

    // NOTE: Day 2 — Supabase insert 후 실제 action_log.id 로 교체.
    const mockId = crypto.randomUUID();

    // analytics failure 가 core flow 를 막지 않도록 .catch() 격리.
    void track({
      name: "action_logged",
      props: {
        challengeId: parsed.data.challengeId,
        activityType: parsed.data.activityType,
        selectedKeywords: parsed.data.selectedKeywords,
        keywordCount: parsed.data.selectedKeywords.length,
        hasMemo: Boolean(parsed.data.memo),
        rerollCount: parsed.data.rerollCount,
        photoSize: 0,
      },
    }).catch((e) => console.error("[track] action_logged failed", e));

    void track({
      name: "ai_generated",
      props: {
        actionLogId: mockId,
        latencyMs: diary.latencyMs,
        fallback: diary.fallback,
        keywordCoverage: diary.keywordCoverage,
        promptVersion: diary.promptVersion,
      },
    }).catch((e) => console.error("[track] ai_generated failed", e));

    return success({ id: mockId, summary: diary.summary });
  },
);
