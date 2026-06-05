// 옛 진입점 — PR7 부터 /me 로 통합.
// 외부 deeplink·푸시 URL 잔존 가능성을 고려해 redirect 유지.

import { redirect } from "next/navigation";

export default function SettingsRedirect(): never {
  redirect("/me");
}
