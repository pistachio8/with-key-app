// src/lib/db/reads/recap.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { computePerHeadPenalty, pickMvpIds } from "@/lib/challenge/settlement";

export type RecapMemberView = {
  id: string;
  displayName: string;
  doneCount: number;
  achieved: boolean;
  isMvp: boolean;
};

export type RecapView = {
  challengeId: string;
  title: string;
  goalCount: number;
  durationDays: number;
  startAt: string | null;
  endAt: string | null;
  status: "active" | "closed";
  viewerId: string;
  viewerAchieved: boolean;
  viewerDoneCount: number;
  viewerPerHeadPenalty: number;
  members: ReadonlyArray<RecapMemberView>;
  anyoneAchieved: boolean;
};

type ChallengeRow = {
  id: string;
  title: string;
  goal_count: number;
  duration_days: number;
  penalty_amount: number;
  status: "active" | "closed";
  start_at: string | null;
  end_at: string | null;
};

type ParticipantRow = {
  user_id: string;
  display_name: string | null;
  done_count: number;
};

export function buildRecapView(input: {
  challenge: ChallengeRow;
  participants: ReadonlyArray<ParticipantRow>;
  viewerId: string;
  now: Date;
}): RecapView {
  const { challenge, participants, viewerId } = input;
  const mvpIds = pickMvpIds({
    goalCount: challenge.goal_count,
    members: participants.map((p) => ({ id: p.user_id, doneCount: p.done_count })),
  });

  const members: RecapMemberView[] = participants.map((p) => ({
    id: p.user_id,
    displayName: p.display_name ?? "익명",
    doneCount: p.done_count,
    achieved: p.done_count >= challenge.goal_count,
    isMvp: mvpIds.includes(p.user_id),
  }));

  const viewer = members.find((m) => m.id === viewerId);
  const viewerDoneCount = viewer?.doneCount ?? 0;

  return {
    challengeId: challenge.id,
    title: challenge.title,
    goalCount: challenge.goal_count,
    durationDays: challenge.duration_days,
    startAt: challenge.start_at,
    endAt: challenge.end_at,
    status: challenge.status,
    viewerId,
    viewerAchieved: viewerDoneCount >= challenge.goal_count,
    viewerDoneCount,
    viewerPerHeadPenalty: computePerHeadPenalty({
      doneCount: viewerDoneCount,
      goalCount: challenge.goal_count,
      penaltyAmount: challenge.penalty_amount,
    }),
    members,
    anyoneAchieved: members.some((m) => m.achieved),
  };
}
