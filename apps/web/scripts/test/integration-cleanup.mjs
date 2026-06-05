// CI integration 잡의 cleanup step 이 호출하는 스크립트.
// 기존 `truncate_test_data` RPC 를 한 번 호출해 @test.local 사용자 scope 의 시드를 비운다.
// 호출 전 SUPABASE_CLEANUP_ALLOWED_REF 와 NEXT_PUBLIC_SUPABASE_URL 의 project ref 가
// 일치하는지 확인 — 잘못된 프로젝트(prod) 에 붙어 RPC 호출하는 사고를 방지한다.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const allowedRef = process.env.SUPABASE_CLEANUP_ALLOWED_REF;

if (!url || !key) {
  console.error("[cleanup] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}
if (!allowedRef) {
  console.error(
    "[cleanup] SUPABASE_CLEANUP_ALLOWED_REF not set — refuse to cleanup unknown project",
  );
  process.exit(1);
}

// URL 형태: https://<project_ref>.supabase.co
const actualRef = url.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (actualRef !== allowedRef) {
  console.error(
    `[cleanup] project ref mismatch — expected ${allowedRef}, got ${actualRef ?? "<unparseable>"}. refusing to cleanup.`,
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error } = await admin.rpc("truncate_test_data");
if (error) {
  console.error("[cleanup] truncate_test_data failed:", error.message);
  process.exit(1);
}
console.log(`[cleanup] truncate_test_data ok (project=${actualRef})`);
