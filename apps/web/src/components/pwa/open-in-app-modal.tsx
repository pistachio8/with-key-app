// src/components/pwa/open-in-app-modal.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SESSION_KEY = "pwa.modal.thisSession";

function readSessionDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "dismissed";
  } catch {
    return false;
  }
}

function writeSessionDismissed(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "dismissed");
  } catch {
    /* sessionStorage 차단 — 무시. */
  }
}

export function OpenInAppModal() {
  // SSR-safe lazy initializer.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !readSessionDismissed();
  });

  if (!open) return null;

  function continueOnWeb() {
    writeSessionDismissed();
    setOpen(false);
  }

  function openInApp() {
    // 같은 탭에서 launch_handler 가 캡처에 실패하면 그냥 새로고침되어 같은 모달이 무한히 뜨는
    // 회귀가 발생. 세션 dismiss 를 먼저 set 해 같은 탭에선 한 번만 시도하고 끝낸다.
    writeSessionDismissed();
    window.location.assign("/home");
  }

  return (
    <Dialog
      open={open}
      // disablePointerDismissal: 백드롭 클릭으로 닫히지 않도록.
      // onOpenChange guard: ESC 키 등 외부 신호로 닫히지 않도록.
      // 오직 두 버튼을 통해서만 닫힌다.
      disablePointerDismissal
      onOpenChange={(next, eventDetails) => {
        // escape-key reason 은 무시 — 강제 선택 모달이므로
        if (!next && eventDetails?.reason === "escape-key") return;
        if (!next) return;
        setOpen(next);
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>앱으로 계속할까요?</DialogTitle>
          <DialogDescription>
            홈 화면에 추가한 앱이 있어요. 한 번만 앱으로 열면 다음부터 자동으로 앱이 열려요.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={continueOnWeb}>
            웹으로 계속
          </Button>
          <Button onClick={openInApp}>앱으로 열기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
