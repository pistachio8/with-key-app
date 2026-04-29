// BE_SCHEMA §13.2 결제 백로그. POC는 env 기반 정적 송금 URL + amount/memo query 주입.
const FALLBACK = "https://pay.kakao.com/";

// env 가 임의 도메인으로 오염되면 SettlementSheet 의 <a href target=_blank> 가 open-redirect/피싱 통로가 된다.
// 카카오페이 공식 도메인만 통과시키는 allowlist 로 고정.
const ALLOWED_HOSTS = new Set<string>(["qr.kakaopay.com", "pay.kakao.com", "link.kakao.com"]);

export type KakaoPayLinkInput = {
  amount: number;
  memo?: string;
};

export function buildKakaoPayLink({ amount, memo }: KakaoPayLinkInput): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be positive");
  }
  const base = process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL ?? FALLBACK;
  const url = new URL(base);
  if (!ALLOWED_HOSTS.has(url.host)) {
    throw new Error(`disallowed kakaopay host: ${url.host}`);
  }
  url.searchParams.set("amount", String(Math.round(amount)));
  if (memo && memo.trim().length > 0) {
    url.searchParams.set("memo", memo.trim());
  }
  return url.toString();
}
