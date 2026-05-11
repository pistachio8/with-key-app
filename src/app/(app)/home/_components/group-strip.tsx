import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GroupChallengeView } from "@/lib/db/reads/current-challenges";
import { ProgressCard } from "./progress-card";

type Props = {
  groups: ReadonlyArray<GroupChallengeView>;
};

// PRD §4 · Design Brief §2.2 화면 4 — 내 그룹 스트립. 0/1/N 에 따라 다른 레이아웃.
export function GroupStrip({ groups }: Props) {
  if (groups.length === 0) {
    return (
      <section className="bg-card flex flex-col items-center gap-3 rounded-2xl border p-6 text-center">
        <p className="text-muted-foreground break-keep text-sm">
          아직 속한 그룹이 없어요. 혼자, 또는 친구와 함께 시작해 보세요.
        </p>
        <Link href="/group/new" className={cn(buttonVariants({ size: "lg" }), "h-12 w-full gap-2")}>
          <Plus aria-hidden="true" /> 새 그룹 만들기
        </Link>
      </section>
    );
  }

  if (groups.length === 1) {
    const g = groups[0]!;
    return <GroupCard group={g} />;
  }

  return (
    <section
      aria-label="내 그룹"
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2"
    >
      {groups.map((g) => (
        <div key={g.groupId} className="w-[85%] shrink-0 snap-start">
          <GroupCard group={g} />
        </div>
      ))}
    </section>
  );
}

function GroupCard({ group }: { group: GroupChallengeView }) {
  if (!group.challenge) {
    return (
      <article className="bg-card flex flex-col gap-3 rounded-2xl border p-5 shadow-sm">
        <header>
          <h2 className="text-base font-semibold">{group.groupName ?? "이름 없는 그룹"}</h2>
          <p className="text-muted-foreground mt-1 text-xs">진행 중인 서약서가 없어요.</p>
        </header>
        <Link
          href={`/challenge/new?groupId=${group.groupId}`}
          className={cn(buttonVariants({ size: "lg" }), "h-11 w-full gap-2")}
        >
          <Plus aria-hidden="true" /> 새로운 서약서 만들기
        </Link>
      </article>
    );
  }

  const c = group.challenge;
  return (
    <div className="flex flex-col gap-3">
      {group.groupName && (
        <p className="text-muted-foreground text-xs font-medium">{group.groupName}</p>
      )}
      <ProgressCard
        title={c.title}
        goalCount={c.goalCount}
        doneCount={c.doneCount}
        potTotal={c.potTotal}
        daysLeft={c.daysLeft}
      />
      <Link
        href={`/challenge/${c.id}`}
        className={cn(buttonVariants({ size: "lg" }), "h-11 w-full")}
      >
        현황 보기
      </Link>
    </div>
  );
}
