// 건의 제출 Slack #qa 알림 — spec C5. never-throw(track() 철학): 알림 실패가 제출을 뒤집지 않는다.
import "server-only";
import type { FeedbackCategory } from "@withkey/domain";

const TIMEOUT_MS = 2500;

const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "🐞 버그",
  feature: "💡 기능 제안",
  other: "💬 기타",
};

export type FeedbackSlackMessage = {
  category: FeedbackCategory;
  body: string;
  userId: string;
  email?: string | null;
  photoUrl?: string | null;
};

export function buildFeedbackPayload(msg: FeedbackSlackMessage): { text: string } {
  const lines = [
    `${CATEGORY_LABEL[msg.category]} 건의가 도착했어요`,
    `>${msg.body.replaceAll("\n", "\n>")}`,
    `제출자: ${msg.email ?? "(email 없음)"} (${msg.userId})`,
  ];
  if (msg.photoUrl) lines.push(`사진: ${msg.photoUrl}`);
  return { text: lines.join("\n") };
}

export async function notifyFeedbackToSlack(msg: FeedbackSlackMessage): Promise<void> {
  const url = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  if (!url) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildFeedbackPayload(msg)),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("[notifyFeedbackToSlack] non-2xx", { status: res.status });
    }
  } catch (error) {
    console.error("[notifyFeedbackToSlack] failed", error);
  } finally {
    clearTimeout(timer);
  }
}
