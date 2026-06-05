// src/app/(app)/challenge/[id]/_components/use-copy-account-number.ts
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import type { ErrorCode } from "@/lib/actions/response";
import { revealAccountNumber } from "../_actions";

const userMessage = makeUserMessage({
  not_found: "오너가 아직 계좌를 등록하지 않았어요.",
});

// D-016: 계좌번호 복사 공용 훅. revealAccountNumber 로 암호문을 복호화해 평문을 받아
// 즉시 clipboard 에 복사. iOS Safari/PWA transient activation 보존을 위해 write() 를
// 제스처 핸들러 안에서 동기 호출하고 ClipboardItem 에 Promise<Blob> 를 넘긴다.
export function useCopyAccountNumber(groupId: string): { copy: () => void; copying: boolean } {
  const [copying, setCopying] = useState(false);

  function copy() {
    setCopying(true);

    // reveal 결과를 promise 바깥에 기록 — 3갈래(액션 실패 / 액션 throw / clipboard 실패)
    // 토스트를 정확히 구분하기 위함.
    let revealError: ErrorCode | null = null;
    let revealThrew = false;

    const text = revealAccountNumber({ groupId }).then(
      (res) => {
        if (!res.ok) {
          revealError = res.error;
          throw new Error("reveal-failed");
        }
        return res.data.accountNumber;
      },
      (err) => {
        revealThrew = true;
        console.error("[useCopyAccountNumber] revealAccountNumber threw", err);
        throw err;
      },
    );

    const finish = (write: Promise<unknown>) =>
      write
        .then(() => toast.success("계좌번호가 복사되었어요"))
        .catch((err) => {
          if (revealError) {
            toast.error(userMessage(revealError));
          } else if (revealThrew) {
            toast.error(FALLBACK_ERROR_MESSAGE);
          } else {
            console.error("[useCopyAccountNumber] clipboard write failed", err);
            toast.error("복사에 실패했어요. 다시 시도해 주세요.");
          }
        })
        .finally(() => setCopying(false));

    if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function") {
      try {
        const blob = text.then((n) => new Blob([n], { type: "text/plain" }));
        blob.catch(() => {}); // 구형 Chrome 생성자 throw 시 orphan unhandled rejection 방지
        finish(navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]));
        return;
      } catch {
        // 구형 Chrome(76–115): ClipboardItem 은 있으나 Promise 값을 거부 → 구 경로로.
      }
    }

    // 구 경로 (Firefox<127 · 비-secure context · 데스크톱 비엄격): reveal 후 writeText.
    finish(text.then((n) => navigator.clipboard.writeText(n)));
  }

  return { copy, copying };
}
