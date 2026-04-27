// 필수 env 변수 존재 여부만 확인. 값 유효성은 런타임에.
const REQUIRED = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error("Missing env:", missing.join(", "));
  process.exit(1);
}
console.log("env OK");
