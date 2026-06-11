// 개발자에게 건의하기 — spec: docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md

import { requireUser } from "@/lib/auth/require-user";
import { FeedbackForm } from "./_components/feedback-form";

export default async function FeedbackPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="t-h1">개발자에게 건의하기</h1>
      <p className="t-body text-muted-foreground">
        버그 제보나 아이디어를 보내주세요. 보내주신 내용은 개발팀이 바로 확인해요.
      </p>
      <FeedbackForm />
    </div>
  );
}
