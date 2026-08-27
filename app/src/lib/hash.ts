import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEY_LEN = 64;

/**
 * Hashing con scrypt del módulo `crypto` de Node — sin dependencias externas.
 * Lo usan tanto el PIN de confirmación de checklists (`pin.ts`) como las
 * contraseñas de usuario (`auth.ts`). El valor en claro nunca se guarda ni se
 * loguea: en la base sólo queda `salt:hash`.
 */
export async function hashSecret(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plain, salt, KEY_LEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifySecret(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(plain, Buffer.from(saltHex, "hex"), KEY_LEN);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
