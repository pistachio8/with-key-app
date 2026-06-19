// 디버깅용 개발자 로그인 모드 — fixture 계정 seed (spec §6).
//
// 공유(preview·prod 단일) Supabase 에 2종 fixture 계정을 결정적 UUID + skip-if-exists 로
// 멱등 생성한다. 여러 번 실행해도 동일 결과 — point_ledger 는 append-only 라 한 번 부여한
// 잔액은 되돌릴 수 없으므로(트리거가 admin 포함 모든 role 의 비-INSERT op 차단, §6.3)
// 파괴적 reset 을 쓰지 않고 on-conflict-do-nothing + 고정 ref 로만 멱등을 보장한다.
//
// 사용:
//   node apps/web/scripts/dev-seed-accounts.mjs --dry-run   # 계획만 출력 (연결 불필요)
//   node apps/web/scripts/dev-seed-accounts.mjs             # 실제 seed (ops 게이트 해소 후 사람이 실행)
//
// 실제 실행은 po:seed-run-approval 게이트(사람) 해소 후. amount 를 잘못 넣으면 비가역이라 신중히.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");

// 결정적 고정 UUID — 재실행 시 on-conflict-do-nothing / grant ref 멱등의 키 (§6.3).
// auth.users id 는 createUser 가 생성하므로 이메일로 조회해 재사용한다(아래 ensureAuthUser).
const IDS = {
  memberGroup: "d0000000-0000-4000-8000-000000000001",
  memberChallenge: "d0000000-0000-4000-8000-000000000002",
  memberActionLog: "d0000000-0000-4000-8000-000000000003",
  memberKudos: "d0000000-0000-4000-8000-000000000004",
  balanceGroup: "d0000000-0000-4000-8000-000000000011",
  // 잔액 grant 멱등 ref. grant_bundle_points 의 p_ref_id 는 uuid 타입이라(0044) 문자열이
  // 아닌 고정 UUID 로 인코딩한다 — 논리 라벨 'dev-seed-balance-v1'.
  balanceGrantRef: "d0000000-0000-4000-8000-000000000012",
};

const ACCOUNTS = {
  memberActive: { email: "member-active@fromwith.test", displayName: "멤버진행중" },
  balance: { email: "balance@fromwith.test", displayName: "잔액있음" },
};

const BALANCE_POINTS = 30000;

function log(...args) {
  console.log("[dev-seed]", ...args);
}

function fail(context, error) {
  console.error(`[dev-seed] ${context} 실패:`, error?.message ?? error);
  process.exit(1);
}

function main() {
  if (DRY_RUN) {
    printPlan();
    return;
  }
  return runSeed();
}

function printPlan() {
  log("DRY RUN — 실제 쓰기 없음. 계획:");
  log(
    `account ${ACCOUNTS.memberActive.email}: users → groups(${IDS.memberGroup}) → group_members(owner) → ` +
      `active challenge(${IDS.memberChallenge}, start/end 직접) → participant(signed) → ` +
      `action_log(${IDS.memberActionLog}, NOT NULL 전부 공급) → kudos(${IDS.memberKudos})`,
  );
  log(
    `account ${ACCOUNTS.balance.email}: users → groups(${IDS.balanceGroup}) → group_members(owner) → ` +
      `grant_bundle_points(${BALANCE_POINTS}p, ref=${IDS.balanceGrantRef}) 1회`,
  );
  log(
    "멱등: 모든 행 on-conflict-do-nothing(upsert ignoreDuplicates) + grant ref 고정. 파괴적 reset 없음.",
  );
}

async function runSeed() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    fail("env", "NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY 누락");
  }

  // service_role — group_members INSERT 정책 부재(§6.2)라 admin 으로만 멤버 행 생성 가능.
  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const memberId = await ensureAuthUser(admin, ACCOUNTS.memberActive);
  await seedMemberActive(admin, memberId);

  const balanceId = await ensureAuthUser(admin, ACCOUNTS.balance);
  await seedBalance(admin, balanceId);

  log("done.");
}

// admin.createUser → 이미 존재하면 listUsers 로 조회(auth-js 에 getUserByEmail 부재, §5.1).
async function ensureAuthUser(admin, account) {
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    email_confirm: true,
  });
  if (!error && data?.user) {
    log(`auth user 생성: ${account.email}`);
    return data.user.id;
  }

  const existing = await findUserByEmail(admin, account.email);
  if (!existing) {
    fail(`createUser ${account.email}`, error);
  }
  log(`auth user 존재 — 재사용: ${account.email}`);
  return existing.id;
}

async function findUserByEmail(admin, email) {
  // dev 프로젝트는 유저가 소수 — 페이지 스캔으로 충분.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail("listUsers", error);
    const found = data.users.find((user) => user.email === email);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

// on-conflict-do-nothing 삽입. ignoreDuplicates=true → INSERT ... ON CONFLICT DO NOTHING.
async function insertIgnore(admin, table, row, onConflict) {
  const { error } = await admin.from(table).upsert(row, { onConflict, ignoreDuplicates: true });
  if (error) fail(`${table} upsert`, error);
}

async function seedMemberActive(admin, userId) {
  const now = new Date();
  const startAt = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1일 전 시작
  const endAt = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000); // 6일 후 종료 → 진행중

  await insertIgnore(
    admin,
    "users",
    { id: userId, display_name: ACCOUNTS.memberActive.displayName },
    "id",
  );
  await insertIgnore(
    admin,
    "groups",
    { id: IDS.memberGroup, owner_id: userId, name: "dev 멤버 그룹" },
    "id",
  );
  await insertIgnore(
    admin,
    "group_members",
    { group_id: IDS.memberGroup, user_id: userId, role: "owner" },
    "group_id,user_id",
  );
  await insertIgnore(
    admin,
    "challenges",
    {
      id: IDS.memberChallenge,
      group_id: IDS.memberGroup,
      title: "dev 활성 챌린지",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "active",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    },
    "id",
  );
  await insertIgnore(
    admin,
    "challenge_participants",
    // deposit_points 는 default 0 — server-managed 라 명시하지 않는다(§6.2).
    { challenge_id: IDS.memberChallenge, user_id: userId, signed_at: now.toISOString() },
    "challenge_id,user_id",
  );
  await insertIgnore(
    admin,
    "action_logs",
    // 0001 NOT NULL/CHECK 전부 공급(§6.2): photo_url·selected_keywords(1~3)·shown_keywords·
    // ai_summary(≤150)·prompt_version·activity_type(enum). photo_url 은 placeholder —
    // storage object 는 seed 하지 않으므로 사진은 렌더되지 않는다(레이아웃·doneCount 디버깅용).
    {
      id: IDS.memberActionLog,
      challenge_id: IDS.memberChallenge,
      user_id: userId,
      activity_type: "running",
      photo_url: "seed://dev-fixture-placeholder.jpg",
      selected_keywords: ["뿌듯함", "상쾌함"],
      shown_keywords: ["뿌듯함", "상쾌함", "개운함", "짜릿함"],
      ai_summary: "오늘도 달렸어요. dev fixture 로그입니다.",
      prompt_version: "dev-seed-v1",
      template_fallback: true,
    },
    "id",
  );
  await insertIgnore(
    admin,
    "kudos",
    // fixture 단순화: peer 계정을 만들지 않으므로(§6 grill) 본인 로그에 self-kudos 1개.
    { id: IDS.memberKudos, action_log_id: IDS.memberActionLog, user_id: userId, emoji: "🔥" },
    "id",
  );
  log("member-active fixture 완료");
}

async function seedBalance(admin, userId) {
  await insertIgnore(
    admin,
    "users",
    { id: userId, display_name: ACCOUNTS.balance.displayName },
    "id",
  );
  await insertIgnore(
    admin,
    "groups",
    { id: IDS.balanceGroup, owner_id: userId, name: "dev 잔액 그룹" },
    "id",
  );
  await insertIgnore(
    admin,
    "group_members",
    { group_id: IDS.balanceGroup, user_id: userId, role: "owner" },
    "group_id,user_id",
  );

  // 잔액은 point_ledger 직접 INSERT 가 트리거로 막히고 grant_bundle_points 만 통로(§6.2).
  // service_role 전용 + ref_id 멱등이라 재실행 no-op.
  const { error } = await admin.rpc("grant_bundle_points", {
    p_user_id: userId,
    p_group_id: IDS.balanceGroup,
    p_amount: BALANCE_POINTS,
    p_ref_id: IDS.balanceGrantRef,
  });
  if (error) fail("grant_bundle_points", error);
  log(`balance fixture 완료 (${BALANCE_POINTS}p)`);
}

await main();
