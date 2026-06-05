// CI integration 잡의 apply-migrations 직후 호출되는 스크립트.
// 0038 에서 정의한 `reenable_on_auth_user_created` security definer RPC 를 호출해
// `auth.users.on_auth_user_created` 트리거를 멱등 재생성한다.
//
// 배경: shared Supabase 프로젝트의 트리거가 외부 작업으로 disabled 회귀하는 빈도가
// 5일 → 1시간 이내로 가속됨 (ADR-0018 §회귀 history 4회째). 근본 해결책(ADR-0005 §후속 영향
// — local Supabase 이전) 이 진행되는 동안 매 잡 시작 시 트리거 강제 보장하는 봉합.
//
// 호출 전 SUPABASE_CLEANUP_ALLOWED_REF 와 NEXT_PUBLIC_SUPABASE_URL 의 project ref 가
// 일치하는지 확인 — 잘못된 프로젝트(prod) 에 붙어 RPC 호출하는 사고 방지.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const allowedRef = process.env.SUPABASE_CLEANUP_ALLOWED_REF;

if (!url || !key) {
  console.error("[reenable-trigger] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}
if (!allowedRef) {
  console.error(
    "[reenable-trigger] SUPABASE_CLEANUP_ALLOWED_REF not set — refuse to mutate unknown project",
  );
  process.exit(1);
}

// URL 형태: https://<project_ref>.supabase.co
const actualRef = url.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (actualRef !== allowedRef) {
  console.error(
    `[reenable-trigger] project ref mismatch — expected ${allowedRef}, got ${actualRef ?? "<unparseable>"}. refusing to mutate.`,
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error } = await admin.rpc("reenable_on_auth_user_created");
if (error) {
  console.error("[reenable-trigger] reenable_on_auth_user_created failed:", error.message);
  process.exit(1);
}
console.log(`[reenable-trigger] on_auth_user_created reenabled (project=${actualRef})`);
