// src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx
import Image from "next/image";
import { formatKRW } from "@/lib/challenge/penalty";
import { BANK_NAMES, type BankCode } from "@/lib/bank/codes";
import { Stamp } from "@/components/ui/stamp";
import { cn } from "@/lib/utils";
import { AccountCopyButton } from "./account-copy-button";

type Props = {
  groupName: string | null; // 솔로면 null → 그룹명 생략
  title: string;
  durationDays: number;
  startAt: string | null; // null 이면 기간 줄 생략
  endAt: string | null;
  goalCount: number;
  viewerDoneCount: number;
  viewerAchieved: boolean;
  viewerPerHeadPenalty: number;
  isSolo: boolean;
  members: ReadonlyArray<{ id: string; displayName: string; isMvp: boolean }>;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  groupId: string | null;
};

// InvitationHeader 와 동일한 UTC 기준 날짜 포맷 (예: "2026 · 05 · 01")
function fmtPart(iso: string, withYear: boolean): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return withYear ? `${y} · ${m} · ${day}` : `${m} · ${day}`;
}

function bankLabel(code: string): string {
  return (BANK_NAMES as Record<string, string>)[code as BankCode] ?? code;
}

const DASH = "my-3 border-t border-dashed border-[var(--invite-dashline)]";
const LABEL = "text-[10px] tracking-[0.15em] text-[var(--invite-subtext)]";

export function SettlementReceipt({
  groupName,
  title,
  durationDays,
  startAt,
  endAt,
  goalCount,
  viewerDoneCount,
  viewerAchieved,
  viewerPerHeadPenalty,
  isSolo,
  members,
  bankCode,
  accountHolder,
  accountNumberLast4,
  groupId,
}: Props) {
  // 셋 다 채워졌을 때만 ACCOUNT — 삼중 truthy 체크로 각 값이 string 으로 narrowing (assertion 불필요)
  const account =
    bankCode && accountHolder && accountNumberLast4
      ? { code: bankCode, holder: accountHolder, last4: accountNumberLast4 }
      : null;
  const period = startAt && endAt ? `${fmtPart(startAt, true)} — ${fmtPart(endAt, false)}` : null;

  return (
    <section
      aria-label="정산 영수증"
      className="font-receipt border-y-2 border-dashed border-[var(--invite-dashline)] bg-[var(--invite-bg)] px-5 py-5 text-[var(--invite-ink)]"
    >
      {/* 헤더 */}
      <div className="flex flex-col items-center text-center">
        {/* 장식용 로고 — from·with 접근성 이름은 하단 Stamp 가 담당 (role=img name 중복 방지) */}
        <Image
          src="/logo-from-with-warm.svg"
          alt=""
          width={123}
          height={24}
          className="h-6 w-auto"
        />
        <p className="mt-2 text-[11px] text-[var(--invite-subtext)]">
          🧾 정산 영수증{groupName ? ` · ${groupName}` : ""}
        </p>
        <p className="text-[11px] text-[var(--invite-subtext)]">
          {title} · {durationDays}일{period ? ` · ${period}` : ""}
        </p>
      </div>

      <div className={DASH} />

      {/* 항목 */}
      <dl className="text-[13px] leading-[2]">
        <div className="flex justify-between">
          <dt className="text-[var(--invite-muted)]">목표 인증</dt>
          <dd className="font-semibold">{goalCount}회</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--invite-muted)]">나의 인증</dt>
          <dd className="font-semibold">{viewerDoneCount}회</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--invite-muted)]">판정</dt>
          <dd className="font-semibold">{viewerAchieved ? "달성 🎉" : "미달 😅"}</dd>
        </div>
      </dl>

      <div className={DASH} />

      {/* 나의 정산 — 미달 TERRA / 달성 0원 INK */}
      <div className="flex items-baseline justify-between">
        <span className={LABEL}>나의 정산</span>
        <span
          className={cn(
            "text-2xl font-bold",
            viewerAchieved ? "text-[var(--invite-ink)]" : "text-[var(--invite-terra)]",
          )}
        >
          {formatKRW(viewerPerHeadPenalty)}
        </span>
      </div>

      {/* 그룹 전용: CREW + ACCOUNT */}
      {!isSolo && (
        <>
          <div className={DASH} />
          <p className={LABEL}>CREW</p>
          <p className="mt-1 text-[13px] leading-relaxed font-medium break-keep">
            {members.map((m) => (m.isMvp ? `👑 ${m.displayName}` : m.displayName)).join(" · ")}
          </p>
          {account && (
            <>
              <p className={cn(LABEL, "mt-3")}>ACCOUNT</p>
              <p className="mt-1 text-[13px]">
                {bankLabel(account.code)} ***-****{account.last4} ·{" "}
                <span className="font-semibold">{account.holder}</span>
              </p>
              {groupId && <AccountCopyButton groupId={groupId} />}
            </>
          )}
        </>
      )}

      <div className={DASH} />

      {/* footer */}
      <p className="text-center text-[11px] text-[var(--invite-subtext)]">
        {viewerAchieved ? "끝까지 해냈어요 👏" : "오늘도 인증, 수고했어요 😜"}
      </p>

      {/* from·with 도장 — 기존 Stamp 재사용, INK 톤다운 색 + animate-stamp-in 내장 */}
      <div className="mt-3 flex justify-center">
        <Stamp
          variant="wordmark"
          className="size-14 border-[var(--invite-stamp)] text-[var(--invite-stamp)]"
        />
      </div>
    </section>
  );
}
