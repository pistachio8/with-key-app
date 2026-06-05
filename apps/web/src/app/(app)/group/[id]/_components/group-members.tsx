// 모킹업 §12 - 그룹 멤버 리스트. 역할 + 가입일.

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import type { GroupMemberView } from "@/lib/db/reads/group-detail";

interface GroupMembersProps {
  members: ReadonlyArray<GroupMemberView>;
}

function formatJoined(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function GroupMembers({ members }: GroupMembersProps) {
  return (
    <section aria-label="그룹 멤버" className="flex flex-col gap-2">
      <h2 className="t-caption">멤버 ({members.length}명)</h2>
      <Card padding="none">
        <ul>
          {members.map((m, i) => (
            <li
              key={m.id}
              className={
                i > 0
                  ? "border-border/60 flex items-center gap-3 border-t px-4 py-3"
                  : "flex items-center gap-3 px-4 py-3"
              }
            >
              <div className="bg-brand-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                {m.displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex flex-1 flex-col">
                <span className="t-body font-semibold">{m.displayName}</span>
                <span className="t-sub text-[11px]">{formatJoined(m.joinedAt)}부터</span>
              </div>
              {m.role === "owner" && <Chip tone="primary">운영자</Chip>}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
