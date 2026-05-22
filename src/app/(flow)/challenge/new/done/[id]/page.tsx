import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { buildInviteUrl } from "@/lib/invite/share-url";
import { CreationCompleteSheet } from "../../_components/creation-complete-sheet";

// 챌린지 생성 직후 step 3 (mockup §3-D · invite 공유 시트).
// /challenge/new 의 page.tsx 가드("모든 owner 그룹이 open 챌린지 → latest 로 redirect")
// 와 충돌 없게 별도 segment 로 분리 — server action 자동 client cache clear 가
// caller RSC 재실행을 일으켜도 본 segment 에는 가드가 없으므로 안전.
type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ token?: string | string[] }>;

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function ChallengeCreatedPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const token = firstSearchParam(sp.token);

  // token 미제공 → 챌린지 상세로 fallback (RLS 가 owner/멤버만 통과).
  if (!token) redirect(`/challenge/${id}`);

  await requireUser();
  const supabase = await createClient();

  // invites RLS: is_group_owner(group_id) 통과 시에만 select — 본인 owner 의 token 만 발견.
  // expires_at 은 RLS 에서 검사하지 않으므로 앱 레벨에서 비교 (PRD AC-2 · 72h).
  const { data: invite } = await supabase
    .from("invites")
    .select("token, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!invite || new Date(invite.expires_at) < new Date()) {
    redirect(`/challenge/${id}`);
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const inviteUrl = buildInviteUrl(`${proto}://${host}`, invite.token);

  // form 의 wrapper(p-4)에 의존하던 CreationCompleteSheet 가 별도 segment 로
  // 분리되면서 horizontal padding 이 사라져 CTA 가 viewport 끝까지 차지하던 회귀
  // 보정 — form 과 동일 padding/flex 구조 유지.
  return (
    <div className="flex min-h-svh flex-col p-4">
      <CreationCompleteSheet inviteUrl={inviteUrl} />
    </div>
  );
}
