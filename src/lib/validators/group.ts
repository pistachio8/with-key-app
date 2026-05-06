import { z } from "zod";
import { BANK_CODES } from "@/lib/bank/codes";

// BE_SCHEMA §5.2 · D-016: 그룹 입력은 이름 + (은행·예금주·계좌번호) 묶음 optional.
// - accountNumber 는 숫자만 8~16자리 (한국 일반 분포). 서버에서 AES-256-GCM 암호화 후 저장.
// - 3 값은 all-or-nothing: 전부 제공되거나 전부 생략되거나.

const baseSchema = z.object({
  name: z.string().min(1).max(30).optional(),
  bankCode: z.enum(BANK_CODES).optional(),
  accountHolder: z.string().min(1).max(30).optional(),
  accountNumber: z
    .string()
    .regex(/^[0-9]{8,16}$/, { message: "account number must be 8-16 digits" })
    .optional(),
});

export const groupInputSchema = baseSchema.superRefine((val, ctx) => {
  const present = [val.bankCode, val.accountHolder, val.accountNumber].filter(
    (v) => v !== undefined && v !== null,
  ).length;
  if (present > 0 && present < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "bank_code, accountHolder, accountNumber must be provided together",
      path: ["accountNumber"],
    });
  }
});

export type GroupInput = z.infer<typeof groupInputSchema>;
