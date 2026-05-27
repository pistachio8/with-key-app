#!/usr/bin/env node
// VAPID public/private 키가 P-256 유효 페어인지 확인. iOS APNs Web Push 의 BadJwtToken
// 에러는 `k=` 파라미터 (server public key) 가 client subscribe 시 사용된 public key 와
// 일치하지 않을 때 발생. FCM 은 이 추가 검사를 안 해 안드만 도착하는 비대칭이 발생.
//
// 사용:
//   - 로컬 .env.local / .env.preview 등에 env 가 set 된 상태에서
//   - node --env-file=.env.preview scripts/verify-vapid-pair.mjs
//   - 또는 process.env 에 두 변수를 직접 주입:
//   - NEXT_PUBLIC_VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... node scripts/verify-vapid-pair.mjs
//
// Vercel preview env 를 가져오려면 Vercel UI 의 Settings → Environment Variables 에서
// Preview scope 값을 복사. (vercel CLI 가 있으면 `vercel env pull .env.preview --environment preview`)

import { createECDH } from "node:crypto";

const PUB_ENV = "NEXT_PUBLIC_VAPID_PUBLIC_KEY";
const PRV_ENV = "VAPID_PRIVATE_KEY";
const SUB_ENV = "VAPID_SUBJECT";

function fail(msg) {
  console.error("[FAIL]", msg);
  process.exit(1);
}

function pass(msg) {
  console.log("[PASS]", msg);
}

const publicKeyB64 = process.env[PUB_ENV];
const privateKeyB64 = process.env[PRV_ENV];
const subject = process.env[SUB_ENV];

if (!publicKeyB64) fail(`${PUB_ENV} not set`);
if (!privateKeyB64) fail(`${PRV_ENV} not set`);
if (!subject) fail(`${SUB_ENV} not set`);

// 1) 공백 / 패딩 검출
if (publicKeyB64 !== publicKeyB64.trim()) {
  fail(`${PUB_ENV} contains leading/trailing whitespace — fix in Vercel env`);
}
if (privateKeyB64 !== privateKeyB64.trim()) {
  fail(`${PRV_ENV} contains leading/trailing whitespace — fix in Vercel env`);
}
if (publicKeyB64.includes("=")) {
  fail(`${PUB_ENV} contains "=" padding — must be URL-safe base64 without padding`);
}
if (privateKeyB64.includes("=")) {
  fail(`${PRV_ENV} contains "=" padding — must be URL-safe base64 without padding`);
}
if (/[+/]/.test(publicKeyB64)) {
  fail(`${PUB_ENV} contains "+" or "/" — must be URL-safe base64 (use - and _)`);
}
if (/[+/]/.test(privateKeyB64)) {
  fail(`${PRV_ENV} contains "+" or "/" — must be URL-safe base64 (use - and _)`);
}

// 2) 길이 검출
const publicBuf = Buffer.from(publicKeyB64, "base64url");
const privateBuf = Buffer.from(privateKeyB64, "base64url");

if (publicBuf.length !== 65) {
  fail(
    `${PUB_ENV} decoded to ${publicBuf.length} bytes (expected 65, uncompressed P-256 prefix + X + Y)`,
  );
}
if (privateBuf.length !== 32) {
  fail(`${PRV_ENV} decoded to ${privateBuf.length} bytes (expected 32, P-256 scalar)`);
}
if (publicBuf[0] !== 0x04) {
  fail(`${PUB_ENV} first byte is 0x${publicBuf[0].toString(16)} (expected 0x04 uncompressed)`);
}

pass("formats OK (URL-safe base64, no padding, correct lengths)");

// 3) Subject 검증
let subjectURL;
try {
  subjectURL = new URL(subject);
} catch {
  fail(`${SUB_ENV} is not a valid URL: "${subject}"`);
}
if (!["https:", "mailto:"].includes(subjectURL.protocol)) {
  fail(`${SUB_ENV} protocol is "${subjectURL.protocol}" (must be https: or mailto:)`);
}
if (subjectURL.protocol === "mailto:" && subjectURL.pathname.includes(" ")) {
  fail(`${SUB_ENV} mailto address contains spaces — Apple is strict, use bare email`);
}
pass(`subject OK: ${subjectURL.protocol}//${subjectURL.host || subjectURL.pathname.slice(0, 40)}`);

// 4) 페어 검증 — private 에서 public 을 derive 해 env public 과 비교
const ecdh = createECDH("prime256v1");
try {
  ecdh.setPrivateKey(privateBuf);
} catch (e) {
  fail(`private key cannot be loaded as P-256 scalar: ${(e && e.message) || e}`);
}
const derivedPublic = ecdh.getPublicKey();

if (!derivedPublic.equals(publicBuf)) {
  console.error("");
  console.error("[FAIL] PAIR MISMATCH — keys do NOT correspond to the same EC point");
  console.error("");
  console.error(`  ${PUB_ENV} (env)     :`, publicKeyB64.slice(0, 32) + "…");
  console.error(`  derived from private:`, derivedPublic.toString("base64url").slice(0, 32) + "…");
  console.error("");
  console.error(
    "  => iOS APNs (web.push.apple.com) rejects with BadJwtToken because `k=` parameter",
  );
  console.error("     in Authorization header does not match what the browser used at subscribe.");
  console.error("     FCM is lenient and accepts these JWTs, which is why Android works.");
  console.error("");
  console.error("  Fix:");
  console.error("    1. Regenerate VAPID pair locally:");
  console.error(
    "       node -e \"console.log(JSON.stringify(require('web-push').generateVAPIDKeys(),null,2))\"",
  );
  console.error("    2. Update BOTH env vars in Vercel (Production + Preview + Development)");
  console.error("    3. DELETE all rows in push_subscriptions table (old endpoints are dead)");
  console.error("    4. Have users re-toggle 알림 받기 to re-subscribe with new public key");
  process.exit(2);
}

pass("VAPID public/private form a valid P-256 pair");
console.log("");
console.log("[OK] all checks passed — BadJwtToken is NOT caused by key pair mismatch.");
console.log("    Next likely cause: VAPID_SUBJECT 형식 (mailto vs https) 또는 JWT iat claim.");
console.log("    Try changing VAPID_SUBJECT to your https URL and re-test.");
