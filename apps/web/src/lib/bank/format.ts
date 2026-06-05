// 계좌번호 마스킹: 마지막 4자리만 노출. 은행별 자릿수 편차 무관하게 고정 템플릿.
export function maskAccountNumber(last4: string): string {
  if (!/^[0-9]{4}$/.test(last4)) {
    throw new Error("last4 must be exactly 4 digits");
  }
  return `****-**-****${last4}`;
}

export function formatAccountHolder(name: string): string {
  return name.trim();
}
