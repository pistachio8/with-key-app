import { describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const ORIGINAL = process.env.ACCOUNT_ENCRYPTION_KEY;

// base64 encoding of 32 random bytes. Fixed value so ciphertext differences
// across tests are attributable to IV randomness, not key rotation.
const TEST_KEY_B64 = Buffer.alloc(32, 7).toString("base64");

async function freshCipher() {
  // account-cipher reads the env at call time, not at module load, so we can
  // just re-import. But importing after env mutation is safer — makes the
  // dependency explicit.
  const mod = await import("./account-cipher");
  return mod;
}

describe("account-cipher (AES-256-GCM)", () => {
  beforeEach(() => {
    process.env.ACCOUNT_ENCRYPTION_KEY = TEST_KEY_B64;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ACCOUNT_ENCRYPTION_KEY;
    else process.env.ACCOUNT_ENCRYPTION_KEY = ORIGINAL;
  });

  it("round-trips: decrypt(encrypt(x)) === x", async () => {
    const { encryptAccountNumber, decryptAccountNumber } = await freshCipher();
    const plain = "11012345678";
    const encrypted = encryptAccountNumber(plain);
    expect(Buffer.isBuffer(encrypted)).toBe(true);
    // iv(12) + min 1 byte cipher + tag(16) — '11012345678' = 11 bytes
    expect(encrypted.length).toBe(12 + plain.length + 16);
    expect(decryptAccountNumber(encrypted)).toBe(plain);
  });

  it("produces a different ciphertext each call (random IV)", async () => {
    const { encryptAccountNumber } = await freshCipher();
    const a = encryptAccountNumber("11012345678");
    const b = encryptAccountNumber("11012345678");
    expect(a.equals(b)).toBe(false);
  });

  it("rejects tampered authTag (GCM integrity)", async () => {
    const { encryptAccountNumber, decryptAccountNumber } = await freshCipher();
    const encrypted = encryptAccountNumber("11012345678");
    const tampered = Buffer.from(encrypted);
    // Flip the last byte (authTag region) — decipher must throw.
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptAccountNumber(tampered)).toThrow();
  });

  it("rejects tampered ciphertext bytes", async () => {
    const { encryptAccountNumber, decryptAccountNumber } = await freshCipher();
    const encrypted = encryptAccountNumber("11012345678");
    const tampered = Buffer.from(encrypted);
    // Flip a middle byte (cipher region).
    tampered[15] ^= 0xff;
    expect(() => decryptAccountNumber(tampered)).toThrow();
  });

  it("throws when key env is missing", async () => {
    delete process.env.ACCOUNT_ENCRYPTION_KEY;
    const { encryptAccountNumber } = await freshCipher();
    expect(() => encryptAccountNumber("11012345678")).toThrow(/ACCOUNT_ENCRYPTION_KEY/);
  });

  it("throws when key env is not 32 bytes after base64 decode", async () => {
    process.env.ACCOUNT_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    const { encryptAccountNumber } = await freshCipher();
    expect(() => encryptAccountNumber("11012345678")).toThrow(/32 bytes/);
  });
});
