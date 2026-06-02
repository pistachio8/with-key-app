import { redirect } from "next/navigation";

// ADR-0003: 그룹 명시 UI 폐기 — 자동 그룹은 createChallenge 가 처리.
// 외부 링크 보존을 위해 redirect.
export default function GroupNewRedirect() {
  redirect("/challenge/new");
}
