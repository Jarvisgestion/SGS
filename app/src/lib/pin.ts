import { hashSecret, verifySecret } from "@/lib/hash";

/**
 * Confirmación por PIN para checklists rutinarios (especificación, sección 4).
 *
 * Nota de alcance: esto confirma un checklist, NO autentica a la persona —
 * de eso se ocupa `auth.ts`. El PIN dice "quién de la tripulación da por
 * hecho este control"; la sesión dice "quién está usando la aplicación".
 */
export const hashPin = hashSecret;
export const verifyPin = verifySecret;
