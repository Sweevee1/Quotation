import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Short fingerprint of a password hash, stored in the session so a password change invalidates old cookies. */
export function passwordFingerprint(hash: string): string {
  return createHash("sha256").update(hash).digest("hex").slice(0, 16);
}
