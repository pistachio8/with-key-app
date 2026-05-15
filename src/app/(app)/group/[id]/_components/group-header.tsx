// 모킹업 §12 - 그룹 헤더. 운영자/멤버 구분 칩만 표시 (이름 편집은 POC 범위 외).

import { Chip } from "@/components/ui/chip";

interface GroupHeaderProps {
  name: string | null;
  isOwner: boolean;
  memberCount: number;
}

export function GroupHeader({ name, isOwner, memberCount }: GroupHeaderProps) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="t-h1">{name ?? "이름 없는 그룹"}</h1>
      <div className="flex items-center gap-1.5">
        <Chip tone={isOwner ? "primary" : "neutral"}>{isOwner ? "운영자" : "멤버"}</Chip>
        <Chip tone="neutral">멤버 {memberCount}명</Chip>
      </div>
    </header>
  );
}
