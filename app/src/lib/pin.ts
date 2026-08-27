import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEY_LEN = 64;

/**
 * Confirmación por PIN para checklists rutinarios (especificación, sección 4).
 *
 * Se usa scrypt del módulo `crypto` de Node — sin dependencias externas. El PIN
 * en claro nunca se guarda ni se loguea: en la base sólo queda `salt:hash`.
 *
 * Nota de alcance: esto cubre la confirmación de un checklist, NO es un sistema
 * de autenticación. No hay sesión, ni bloqueo por reintentos, ni rotación de
 * PIN — eso viene con el login real (próximo paso #2 del README). Un PIN de 4
 * dígitos es fuerza bruta trivial si el endpoint queda expuesto sin rate limit.
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(pin, salt, KEY_LEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(pin, Buffer.from(saltHex, "hex"), KEY_LEN);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
