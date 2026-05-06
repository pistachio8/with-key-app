import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// D-016: 계좌번호 앱 레이어 AES-256-GCM. 키는 Vercel env `ACCOUNT_ENCRYPTION_KEY` (base64 32B).
// 암호문 포맷: iv(12) || ciphertext(N) || authTag(16) — 단일 bytea 로 DB 저장.
// v1 KMS 이관 시 본 모듈의 두 함수 시그니처만 유지한 채 내부만 교체.

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function loadKey(): Buffer {
  const raw = process.env.ACCOUNT_ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) {
    throw new Error("ACCOUNT_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`ACCOUNT_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length})`);
  }
  return key;
}

export function encryptAccountNumber(plain: string): Buffer {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]);
}

export function decryptAccountNumber(encrypted: Buffer): string {
  if (encrypted.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("encrypted buffer too short");
  }
  const key = loadKey();
  const iv = encrypted.subarray(0, IV_BYTES);
  const tag = encrypted.subarray(encrypted.length - TAG_BYTES);
  const ciphertext = encrypted.subarray(IV_BYTES, encrypted.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
