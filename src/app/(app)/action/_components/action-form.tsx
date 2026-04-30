"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/keywords/pool";
import { initialShuffle, reroll, type ShuffleState } from "@/lib/keywords/shuffle";
import { cn } from "@/lib/utils";
import { KeywordChipGroup } from "./keyword-chip-group";
import { RerollButton } from "./reroll-button";
import { submitActionLog } from "../_actions";

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  running: "🏃 러닝",
  gym: "🏋️ 헬스",
  yoga: "🧘 요가",
  other: "✨ 기타",
};

const userMessage = makeUserMessage({
  not_found: "현재 참여 중인 챌린지를 찾을 수 없어요.",
  forbidden: "지금은 인증할 수 있는 기간이 아니에요.",
});

type Props = {
  challengeId: string;
};

export function ActionForm({ challengeId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activityType, setActivityType] = useState<ActivityType>("gym");
  const [shuffle, setShuffle] = useState<ShuffleState>(() => initialShuffle("gym"));
  const [selected, setSelected] = useState<string[]>([]);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memo, setMemo] = useState("");

  function switchActivity(next: ActivityType) {
    setActivityType(next);
    setShuffle(initialShuffle(next));
    setSelected([]);
  }

  function submit() {
    startTransition(async () => {
      try {
        const res = await submitActionLog({
          challengeId,
          activityType,
          // NOTE: Supabase Storage signed URL 로 교체 (B4).
          photoUrl: "https://example.com/photo.jpg",
          selectedKeywords: selected,
          shownKeywords: shuffle.shown,
          rerollCount: shuffle.rerollCount,
          memo: memoOpen && memo ? memo : undefined,
        });
        if (!res.ok) {
          const firstField = res.issues
            ? Object.values(res.issues).flat().filter(Boolean)[0]
            : undefined;
          toast.error(firstField ?? userMessage(res.error));
          if (res.error === "unauthorized") router.push("/login");
          return;
        }
        if (!res.data?.id) {
          console.error("[submitActionLog] ok=true but missing data.id", res);
          toast.error(FALLBACK_ERROR_MESSAGE);
          return;
        }
        toast.success("인증 완료!");
        router.push("/home");
      } catch (err) {
        console.error("[submitActionLog] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">운동 종류</legend>
        <div role="radiogroup" aria-label="운동 종류" className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map((t) => {
            const checked = activityType === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => switchActivity(t)}
                className={cn(
                  "min-h-12 flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-colors",
                  "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  checked
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {ACTIVITY_LABELS[t]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <section className="flex flex-col gap-3" aria-labelledby="keyword-heading">
        <div className="flex items-center justify-between">
          <h2 id="keyword-heading" className="text-sm font-semibold">
            키워드 <span className="text-muted-foreground tabular-nums">({selected.length}/3)</span>
          </h2>
          <RerollButton
            rerollCount={shuffle.rerollCount}
            onClick={() => setShuffle(reroll(shuffle))}
          />
        </div>
        <KeywordChipGroup shown={shuffle.shown} selected={selected} onChange={setSelected} />
      </section>

      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setMemoOpen((v) => !v)}
          className="text-muted-foreground focus-visible:ring-ring rounded text-left text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-expanded={memoOpen}
          aria-controls="action-memo"
        >
          {memoOpen ? "✏️ 메모 접기" : "✏️ 직접 쓰고 싶어요"}
        </button>
        {memoOpen && (
          <textarea
            id="action-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value.slice(0, 100))}
            placeholder="자유롭게 남겨도 돼요 (0~100자)"
            className="focus-visible:ring-ring min-h-24 rounded-xl border p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            maxLength={100}
          />
        )}
      </section>

      <Button
        size="lg"
        className="h-12"
        disabled={selected.length === 0 || pending}
        onClick={submit}
      >
        {pending ? "일기 쓰는 중..." : "인증하기"}
      </Button>
    </div>
  );
}
