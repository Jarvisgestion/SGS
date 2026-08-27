import type { Prisma } from "@prisma/client";

type Tipo = "sin_gobierno" | "colision" | "incendio" | "varadura" | "remolque";

const RELATION_BY_TIPO: Record<Tipo, string> = {
  sin_gobierno: "extSinGobierno",
  colision: "extColision",
  incendio: "extIncendio",
  varadura: "extVaradura",
  remolque: "extRemolque",
};

/** `{ extIncendio: { create: {...} } }` — para el alta del registro. */
export function extCreateData(tipo: Tipo, ext: Record<string, unknown>) {
  return { [RELATION_BY_TIPO[tipo]]: { create: ext } };
}

/** `{ extIncendio: { update: {...} } }` — para la corrección a bordo. */
export function extUpdateData(tipo: Tipo, ext: Record<string, unknown>) {
  return { [RELATION_BY_TIPO[tipo]]: { update: ext } };
}

export const registroEmergenciaInclude = {
  extSinGobierno: true,
  extColision: true,
  extIncendio: true,
  extVaradura: true,
  extRemolque: true,
  revisiones: { orderBy: { revisadoAt: "desc" } },
} satisfies Prisma.RegistroEmergenciaInclude;
