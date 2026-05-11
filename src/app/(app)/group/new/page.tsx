"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { BANK_CODES, BANK_NAMES, type BankCode } from "@/lib/bank/codes";
import { createGroup } from "./_actions";

const userMessage = makeUserMessage();

// PRD §5 · Design Brief 화면 — 새 그룹 만들기. 계좌 3필드 묶음 optional.
// D-016: 계좌번호는 서버에서 AES-256-GCM 으로 암호화. 클라에는 마스킹된 last4 만 노출.
export default function NewGroupPage() {
  const router = useRouter();
  const nameId = useId();
  const bankId = useId();
  const holderId = useId();
  const numberId = useId();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [bankCode, setBankCode] = useState<BankCode | "">("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  function submit() {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      toast.error("그룹 이름을 입력해 주세요.");
      return;
    }
    const trimmedHolder = accountHolder.trim();
    const trimmedNumber = accountNumber.trim();
    const filledCount = [bankCode, trimmedHolder, trimmedNumber].filter((v) => v.length > 0).length;
    if (filledCount > 0 && filledCount < 3) {
      toast.error("은행 · 예금주 · 계좌번호를 모두 입력하거나 전부 비워주세요.");
      return;
    }
    const hasAccount = filledCount === 3;

    startTransition(async () => {
      try {
        const res = await createGroup({
          name: trimmedName,
          ...(hasAccount
            ? {
                bankCode: bankCode as BankCode,
                accountHolder: trimmedHolder,
                accountNumber: trimmedNumber,
              }
            : {}),
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
          toast.error(FALLBACK_ERROR_MESSAGE);
          return;
        }
        router.push(`/challenge/new?groupId=${res.data.id}`);
      } catch (err) {
        console.error("[createGroup] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <header>
        <h1 className="text-xl font-semibold">새 그룹 만들기</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          그룹과 (선택) 벌금 정산 계좌를 설정하세요. 혼자, 또는 친구와 함께 시작할 수 있어요.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-sm font-semibold">
          그룹 이름
        </label>
        <Input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 매일 운동 클럽"
          maxLength={30}
          autoComplete="off"
        />
      </div>

      <details className="bg-muted/30 rounded-xl border p-4">
        <summary className="text-sm font-semibold select-none">(선택) 벌금 정산 계좌 등록</summary>
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-muted-foreground text-xs break-keep">
            여기에 등록한 계좌는 멤버들이 정산 시 마스킹된 형태로 보이며, 복사 버튼을 눌러 평문을
            받을 수 있어요. 모두 비워두면 나중에 등록할 수 있습니다.
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor={bankId} className="text-sm font-semibold">
              은행
            </label>
            <select
              id={bankId}
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value as BankCode | "")}
              className="bg-background h-11 rounded-lg border px-3"
            >
              <option value="">선택해 주세요</option>
              {BANK_CODES.map((code) => (
                <option key={code} value={code}>
                  {BANK_NAMES[code]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={holderId} className="text-sm font-semibold">
              예금주
            </label>
            <Input
              id={holderId}
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="홍길동"
              maxLength={30}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={numberId} className="text-sm font-semibold">
              계좌번호
            </label>
            <Input
              id={numberId}
              type="text"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="숫자만 입력 (하이픈 없이)"
              maxLength={16}
              autoComplete="off"
            />
            <p className="text-muted-foreground text-xs">
              서버에 암호화되어 저장됩니다. 평문은 복사 시에만 노출돼요.
            </p>
          </div>
        </div>
      </details>

      <Button size="lg" className="h-12" onClick={submit} disabled={pending}>
        {pending ? "생성 중..." : "다음: 서약서 쓰기"}
      </Button>
    </div>
  );
}
