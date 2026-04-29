import { MemberStrip } from "./_components/member-strip";

type Params = Promise<{ id: string }>;

// TODO(Day 2): Supabase query 로 challenge + participants + action_logs 조회.
const MOCK_DETAIL = {
  title: "주 3회 헬스장",
  goalCount: 3,
  members: [
    { id: "u1", displayName: "나", doneCount: 2 },
    { id: "u2", displayName: "민지", doneCount: 3 },
    { id: "u3", displayName: "JJ", doneCount: 1 },
  ],
} as const;

// PRD §4 · BE_SCHEMA §4 상태머신 · Design Brief 화면 4
export default async function ChallengeDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6 p-4">
      <header>
        <p className="text-muted-foreground font-mono text-xs">{id.slice(0, 8)}</p>
        <h1 className="text-xl font-semibold">{MOCK_DETAIL.title}</h1>
      </header>
      <section aria-labelledby="member-progress-heading">
        <h2 id="member-progress-heading" className="mb-3 text-sm font-semibold">
          멤버 진행률
        </h2>
        <MemberStrip goalCount={MOCK_DETAIL.goalCount} members={MOCK_DETAIL.members} />
      </section>
      {/* TODO(Day 2): 오늘의 피드 (FeedCard 리스트) — 실제 action_logs 결합 시 추가. */}
    </div>
  );
}
