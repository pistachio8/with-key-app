// 서버/클라이언트 공용. Origin 은 호출자가 주입 (SSR 에서 headers()로, 클라에서 window.location.origin).
export function buildInviteUrl(origin: string, token: string): string {
  const trimmed = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${trimmed}/invite/${encodeURIComponent(token)}`;
}
