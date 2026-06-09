// src/components/app-shell/fab-menu.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Camera, Home, Users, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveVerifyTarget, type VerifyTargetChallenge } from "@withkey/domain";
import { GroupSwitcherSheet, type GroupSwitcherItem } from "./group-switcher-sheet";
import { FabPhotoVerifySheet } from "./fab-photo-verify-sheet";

interface FabMenuProps {
  activeChallenges: ReadonlyArray<VerifyTargetChallenge>;
  groups: ReadonlyArray<GroupSwitcherItem>;
  newGroupNamePreview: string;
}

const CHILD_BASE = cn(
  "absolute bottom-0 left-1/2 -ml-6 grid size-12 place-items-center rounded-full bg-card text-primary",
  "shadow-[0_6px_16px_rgba(20,24,36,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
);

// 닫힘=중앙 축소, 열림=부채꼴 좌표. duration 은 --motion-base(reduced-motion 1ms).
const childStyle = (openTransform: string, delay: number, open: boolean): React.CSSProperties => ({
  transform: open ? openTransform : "translate(0px, 8px) scale(0.4)",
  opacity: open ? 1 : 0,
  transitionProperty: "transform, opacity",
  transitionDuration: "var(--motion-base)",
  transitionTimingFunction: open ? "cubic-bezier(0.34,1.42,0.5,1)" : "var(--ease-out-soft)",
  transitionDelay: open ? `${delay}ms` : "0ms",
  pointerEvents: open ? "auto" : "none",
});

function currentChallengeId(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = /^\/challenge\/([^/]+)(?:\/|$)/.exec(pathname);
  return m ? m[1] : null;
}

export function FabMenu({ activeChallenges, groups, newGroupNamePreview }: FabMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 인증 작성 화면에서는 메뉴 숨김.
  if (pathname && /^\/challenge\/[^/]+\/action$/.test(pathname)) return null;

  const close = () => setOpen(false);
  const hasGroups = groups.length >= 1;
  const target = resolveVerifyTarget(currentChallengeId(pathname), activeChallenges);

  return (
    <>
      <button
        type="button"
        aria-hidden={!open}
        tabIndex={-1}
        onClick={close}
        className={cn(
          "fixed inset-0 z-20 bg-foreground/15 transition-opacity duration-[var(--motion-base)]",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
        <div inert={!open ? true : undefined}>
          {/* 홈 (좌상) */}
          <Link
            href="/home"
            aria-label="홈"
            onClick={close}
            className={CHILD_BASE}
            style={childStyle("translate(-78px,-94px) scale(1)", 30, open)}
          >
            <Home className="size-5" aria-hidden="true" />
          </Link>

          {/* 사진 인증 (정상) */}
          {target.kind === "navigate" ? (
            <Link
              href={target.href}
              aria-label="사진 인증"
              onClick={close}
              className={CHILD_BASE}
              style={childStyle("translate(0px,-126px) scale(1)", 95, open)}
            >
              <Camera className="size-5" aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              aria-label="사진 인증"
              onClick={() => {
                close();
                if (target.kind === "picker") setPickerOpen(true);
                else toast("진행 중인 챌린지가 없어요");
              }}
              className={CHILD_BASE}
              style={childStyle("translate(0px,-126px) scale(1)", 95, open)}
            >
              <Camera className="size-5" aria-hidden="true" />
            </button>
          )}

          {/* 그룹 (우상) */}
          {hasGroups ? (
            <button
              type="button"
              aria-label="그룹"
              onClick={() => {
                close();
                setGroupOpen(true);
              }}
              className={CHILD_BASE}
              style={childStyle("translate(78px,-94px) scale(1)", 160, open)}
            >
              <Users className="size-5" aria-hidden="true" />
            </button>
          ) : (
            <Link
              href="/group/new"
              aria-label="그룹"
              onClick={close}
              className={CHILD_BASE}
              style={childStyle("translate(78px,-94px) scale(1)", 160, open)}
            >
              <Users className="size-5" aria-hidden="true" />
            </Link>
          )}
        </div>

        {/* 메인 토글 */}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "relative grid size-14 place-items-center rounded-full bg-primary text-primary-foreground",
            "shadow-[0_10px_22px_rgba(138,164,255,0.5)] transition-colors duration-[var(--motion-base)]",
            "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <Zap
            aria-hidden="true"
            className="absolute inset-0 m-auto size-6 transition-[opacity,transform] duration-[var(--motion-base)]"
            style={{
              opacity: open ? 0 : 1,
              transform: open ? "rotate(90deg) scale(0.5)" : "rotate(0) scale(1)",
            }}
          />
          <X
            aria-hidden="true"
            className="absolute inset-0 m-auto size-6 transition-[opacity,transform] duration-[var(--motion-base)]"
            style={{
              opacity: open ? 1 : 0,
              transform: open ? "rotate(0) scale(1)" : "rotate(-90deg) scale(0.5)",
            }}
          />
        </button>
      </div>

      <GroupSwitcherSheet
        open={groupOpen}
        onOpenChange={setGroupOpen}
        groups={groups}
        newGroupNamePreview={newGroupNamePreview}
      />
      <FabPhotoVerifySheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        challenges={activeChallenges}
      />
    </>
  );
}
