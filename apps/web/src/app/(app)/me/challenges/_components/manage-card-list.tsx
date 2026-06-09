"use client";

// 모킹업 §12 - 운영/참여 챌린지 카드. 카드별 종료/삭제(owner) 또는 나가기(member).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, Trash2, Flag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { endChallenge, deleteChallenge, leaveChallenge } from "@/app/(app)/challenge/[id]/_actions";
import { challengePhase, type ChallengePhase } from "@withkey/domain";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import type { MyChallengeItem } from "@/lib/db/reads/my-challenges";

interface ManageCardListProps {
  title: string;
  role: "owner" | "member";
  items: ReadonlyArray<MyChallengeItem>;
}

// ADR-0027 — 배지(표시)는 phase 기준(over→"정산 대기"). 단 아래 canEnd/canDelete/canLeave 는
// "DB row 를 변경할 수 있는가"(쓰기 권한)라 status 기준 유지 — over 도 운영자가 종료할 수 있어야 한다.
const PHASE_LABEL: Record<
  ChallengePhase,
  { label: string; tone: "primary" | "neutral" | "success" }
> = {
  pending: { label: "서명 대기", tone: "neutral" },
  accepted: { label: "곧 시작", tone: "neutral" },
  running: { label: "진행 중", tone: "primary" },
  over: { label: "정산 대기", tone: "neutral" },
  closed: { label: "종료", tone: "success" },
};

const userMessage = makeUserMessage({
  forbidden: "운영자는 나가기 대신 종료/삭제를 사용해 주세요.",
});

type DialogKind = "end" | "delete" | "leave" | null;

export function ManageCardList({ title, role, items }: ManageCardListProps) {
  const router = useRouter();
  const [active, setActive] = useState<{ id: string; kind: DialogKind }>({ id: "", kind: null });
  const [pending, start] = useTransition();

  if (items.length === 0) return null;

  function handleConfirm() {
    if (!active.id || !active.kind) return;
    const kind = active.kind;
    const id = active.id;
    const fn = kind === "end" ? endChallenge : kind === "delete" ? deleteChallenge : leaveChallenge;
    start(async () => {
      try {
        const res = await fn({ challengeId: id });
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        if (kind === "end") router.replace(`/challenge/${id}/recap`);
        else router.refresh();
        toast.success(
          kind === "end"
            ? "챌린지를 종료했어요"
            : kind === "delete"
              ? "챌린지를 삭제했어요"
              : "챌린지에서 나갔어요",
        );
        setActive({ id: "", kind: null });
      } catch (err) {
        console.error("[ManageCardList] action threw", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="t-caption">
          {title} ({items.length}개)
        </h2>
        <ul className="flex flex-col gap-2">
          {items.map((c) => {
            const label = PHASE_LABEL[challengePhase(c.status, c.endAt)];
            const canEnd = role === "owner" && c.status === "active";
            const canDelete = role === "owner" && c.status !== "closed";
            const canLeave = role === "member" && c.status !== "closed";
            return (
              <li key={c.id}>
                <Card padding="md" className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      href={`/challenge/${c.id}`}
                      className="t-body truncate font-semibold hover:underline"
                    >
                      {c.title}
                    </Link>
                    <div className="flex items-center gap-1.5">
                      <Chip tone={label.tone}>{label.label}</Chip>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {canEnd && (
                      <button
                        type="button"
                        aria-label="챌린지 종료"
                        onClick={() => setActive({ id: c.id, kind: "end" })}
                        className="hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-transform active:scale-95"
                      >
                        <Flag className="size-4" aria-hidden="true" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        aria-label="챌린지 삭제"
                        onClick={() => setActive({ id: c.id, kind: "delete" })}
                        className="text-destructive hover:bg-destructive/10 inline-flex size-9 items-center justify-center rounded-full transition-transform active:scale-95"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    )}
                    {canLeave && (
                      <button
                        type="button"
                        aria-label="챌린지 나가기"
                        onClick={() => setActive({ id: c.id, kind: "leave" })}
                        className="text-destructive hover:bg-destructive/10 inline-flex size-9 items-center justify-center rounded-full transition-transform active:scale-95"
                      >
                        <LogOut className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
      <ConfirmDialog
        open={active.kind === "end"}
        onOpenChange={(open) => !open && setActive({ id: "", kind: null })}
        title="챌린지를 종료하시겠어요?"
        description="진행 중인 챌린지가 즉시 종료되고 정산 화면으로 이동합니다."
        confirmLabel="종료"
        onConfirm={handleConfirm}
        pending={pending}
      />
      <ConfirmDialog
        open={active.kind === "delete"}
        onOpenChange={(open) => !open && setActive({ id: "", kind: null })}
        title="챌린지를 삭제하시겠어요?"
        description="삭제된 챌린지는 복구할 수 없어요. 멤버 인증 기록도 함께 삭제됩니다."
        confirmLabel="삭제"
        confirmTone="destructive"
        onConfirm={handleConfirm}
        pending={pending}
      />
      <ConfirmDialog
        open={active.kind === "leave"}
        onOpenChange={(open) => !open && setActive({ id: "", kind: null })}
        title="챌린지에서 나가시겠어요?"
        description="내 인증 기록도 함께 삭제됩니다."
        confirmLabel="나가기"
        confirmTone="destructive"
        onConfirm={handleConfirm}
        pending={pending}
      />
    </>
  );
}
