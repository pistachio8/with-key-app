import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// #42 fix: 새 흐름 반영 (migration 0028 `pending_invite_start_flow`):
// - `/pledge` 는 redirect 페이지 — `/challenge/${ch.id}/pledge` 로 직접 진입.
// - PledgeSheet 는 `!agreed || !signature || pending` 로 disabled — PointerEvent
//   stroke 시뮬레이션으로 캔버스 서명 후 `서명하고 참여` 가 enabled 된다.
// - `sign_and_maybe_activate` 가 자동 activate 를 멈추고 서명만 기록 (0028 명시).
//   active 전이는 owner 가 `StartChallengeCard` 의 "서명한 멤버로 시작하기" 버튼을
//   명시적으로 누르는 흐름이다. fixture group 의 `owner_id` 는 viewer 자신이므로
//   같은 spec 안에서 자연스럽게 양쪽 단계를 모두 실행할 수 있다.
test("owner signs pledge and starts challenge with signed members", async ({ page, groupId }) => {
  // 1) Create a pending challenge with 2 participants: current user (unsigned)
  //    and a second user (already signed). The current user's sign via UI
  //    should fire sign_and_maybe_activate and flip the status to 'active'.
  const userId = await page.evaluate(async () => {
    const r = await fetch("/api/me");
    return r.ok ? ((await r.json()) as { id: string }).id : null;
  });
  if (!userId) throw new Error("cannot resolve current user id");

  const { data: ch, error: chErr } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: "서명 전이 테스트",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "pending",
    })
    .select("id")
    .single();
  if (chErr) throw chErr;

  // display_name is derived by trigger from split_part(email, '@', 1) and is
  // bounded by public.users.display_name (1..20 chars). Keep this local-part short.
  const shortSuffix = Math.random().toString(36).slice(2, 8);
  const otherEmail = `o-${shortSuffix}@test.local`;
  const { data: otherUser, error: userErr } = await admin.auth.admin.createUser({
    email: otherEmail,
    email_confirm: true,
  });
  if (userErr) throw userErr;
  if (!otherUser?.user) throw new Error("failed to create second user");

  await admin.from("group_members").insert({
    group_id: groupId,
    user_id: otherUser.user.id,
    role: "member",
  });
  await admin.from("challenge_participants").insert([
    { challenge_id: ch.id, user_id: userId, signed_at: null },
    {
      challenge_id: ch.id,
      user_id: otherUser.user.id,
      signed_at: new Date().toISOString(),
    },
  ]);

  // 2) Current user signs via UI.
  //    `/pledge` 진입점은 잔여 pending challenge 의존성이 있으므로 본 spec 의
  //    challenge 로 직접 진입한다 (#42).
  await page.goto(`/challenge/${ch.id}/pledge`);
  await expect(page.getByText("서명 전이 테스트")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("checkbox").check();

  // 전자 서명 캔버스에 stroke 입력 — `hasInk` 가 true 가 되어야 `onChange` 가 발화하고
  // `signature` state 가 채워져 "서명하고 참여" 버튼이 enabled 된다.
  const signatureCanvas = page.getByRole("img", { name: "전자 서명 캔버스" });
  await signatureCanvas.waitFor({ state: "visible" });
  const box = await signatureCanvas.boundingBox();
  if (!box) throw new Error("signature canvas has no bounding box");
  const startX = box.x + box.width * 0.2;
  const startY = box.y + box.height * 0.3;
  const endX = box.x + box.width * 0.8;
  const endY = box.y + box.height * 0.7;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();

  const submit = page.getByRole("button", { name: "서명하고 참여" });
  await expect(submit).toBeEnabled({ timeout: 5_000 });
  await submit.click();

  // 3) 서명 직후 challenge 서브 페이지로 router.replace 됨. owner 로서 명시적으로
  //    "서명한 멤버로 시작하기" 를 눌러야 active 로 전이된다 (0028 결정).
  //    같은 카드가 헤더 영역과 정보 탭 안에 동시에 렌더되므로 `.first()` 로 잡는다.
  const startButton = page.getByRole("button", { name: "서명한 멤버로 시작하기" }).first();
  await expect(startButton).toBeVisible({ timeout: 10_000 });
  await startButton.click();

  // 4) Assert — poll status in DB (Server Action + redirect may race).
  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("challenges")
          .select("status")
          .eq("id", ch.id)
          .single();
        if (error) throw error;
        return data?.status;
      },
      { timeout: 15_000, intervals: [500, 1000, 2000] },
    )
    .toBe("active");
});
