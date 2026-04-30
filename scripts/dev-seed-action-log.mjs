// Dev-only helper: insert a placeholder action_log on behalf of one of the
// challenge's teammates, so the kudos feed can be exercised without a fully
// wired /action submit flow.
//
// Usage:
//   pnpm seed:action-log <challengeId>          # picks a non-viewer participant
//   pnpm seed:action-log <challengeId> <email>  # uses a specific teammate by email

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const [, , challengeId, teammateEmailArg] = process.argv;
if (!challengeId) {
  console.error(
    "usage: pnpm seed:action-log <challengeId> [teammateEmail]\n" +
      "  challengeId: UUID of an active challenge you're a member of\n" +
      "  teammateEmail (optional): specific participant to post the log as",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const viewerEmail = process.env.DEV_LOGIN_EMAIL;

if (!url || !secret) {
  console.error("missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY");
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  // auth.admin.listUsers is paginated; POC projects stay small enough for page 1.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users.find((u) => u.email === email) ?? null;
}

// Resolve viewer (the account that will see the feed) from DEV_LOGIN_EMAIL.
let viewerUserId = null;
if (viewerEmail) {
  const viewer = await findUserByEmail(viewerEmail);
  viewerUserId = viewer?.id ?? null;
}

// Pull all participants on the challenge.
const { data: participants, error: pErr } = await admin
  .from("challenge_participants")
  .select("user_id")
  .eq("challenge_id", challengeId);
if (pErr) {
  console.error("failed to load participants:", pErr.message);
  process.exit(1);
}
if (!participants || participants.length === 0) {
  console.error(`no participants found for challenge ${challengeId}`);
  process.exit(1);
}

// Pick the teammate to post as.
let teammateId = null;
if (teammateEmailArg) {
  const tm = await findUserByEmail(teammateEmailArg);
  if (!tm) {
    console.error(`no auth user found with email ${teammateEmailArg}`);
    process.exit(1);
  }
  if (!participants.some((p) => p.user_id === tm.id)) {
    console.error(`${teammateEmailArg} is not a participant of ${challengeId}`);
    process.exit(1);
  }
  teammateId = tm.id;
} else {
  const teammate = participants.find((p) => p.user_id !== viewerUserId);
  if (!teammate) {
    console.error(
      "no non-viewer participant found. Add a teammate to the challenge, " +
        "or pass an explicit email:\n" +
        "  pnpm seed:action-log <challengeId> teammate@example.com",
    );
    process.exit(1);
  }
  teammateId = teammate.user_id;
}

// Insert a placeholder action_log for that teammate.
const { data: log, error: insertErr } = await admin
  .from("action_logs")
  .insert({
    challenge_id: challengeId,
    user_id: teammateId,
    activity_type: "gym",
    photo_url: "https://example.com/photo.jpg",
    selected_keywords: ["펌핑"],
    shown_keywords: ["펌핑", "집중", "루틴"],
    reroll_count: 0,
    ai_summary: "오늘도 해냈다.",
    prompt_version: "dev-seed",
  })
  .select("id, created_at")
  .single();

if (insertErr) {
  console.error("insert action_log failed:", insertErr.message);
  process.exit(1);
}

console.log(
  `\nSeeded action_log\n` +
    `  challenge: ${challengeId}\n` +
    `  author:    ${teammateId}\n` +
    `  log id:    ${log.id}\n` +
    `  created:   ${log.created_at}\n`,
);
