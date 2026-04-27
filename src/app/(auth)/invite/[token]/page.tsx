// PRD §3.3 AC-2 · 초대 토큰 72h 만료 검증
type Params = Promise<{ token: string }>;

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">초대 수락</h1>
      <p className="text-muted-foreground text-sm">token: {token}</p>
      {/* TODO: 토큰 검증 + 그룹 참여 플로우 */}
    </main>
  );
}
