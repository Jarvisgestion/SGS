import type { Prisma } from "@prisma/client";

export type ZafarranchoEjercicioCompleto = Prisma.ZafarranchoEjercicioGetPayload<{
  include: {
    tipoZafarrancho: true;
    participantes: true;
    revisiones: true;
  };
}>;

export type TipoZafarrancho = Prisma.TipoZafarranchoGetPayload<Record<string, never>>;
export type Tripulante = Prisma.TripulanteGetPayload<Record<string, never>>;

export type Estado = "borrador" | "pendiente_revision" | "aprobado" | "observado";

export const ESTADO_LABEL: Record<Estado, string> = {
  borrador: "Borrador",
  pendiente_revision: "Pendiente de revisión",
  aprobado: "Aprobado",
  observado: "Observado",
};

export type RegistroEmergenciaCompleto = Prisma.RegistroEmergenciaGetPayload<{
  include: {
    extSinGobierno: true;
    extColision: true;
    extIncendio: true;
    extVaradura: true;
    extRemolque: true;
    revisiones: true;
  };
}>;

export type BoteRescateCompleto = Prisma.BoteRescateControlGetPayload<{
  include: {
    confirmadoPor: { select: { id: true; apellidoNombre: true; puesto: true } };
    checklistRegistros: { include: { checklistConfig: true } };
    revisiones: true;
  };
}>;

export type ChecklistConfigItem = Prisma.ChecklistConfigGetPayload<Record<string, never>>;

export const TIPO_CHECKLIST_BOTE_LABEL: Record<string, string> = {
  bote_exterior: "Inspección exterior",
  bote_interior: "Inspección interior",
  bote_pescante: "Pescante y sistema de izado",
  bote_inventario: "Inventario de a bordo",
};

export type TipoRegistroEmergencia = "sin_gobierno" | "colision" | "incendio" | "varadura" | "remolque";

export const TIPO_EMERGENCIA_LABEL: Record<TipoRegistroEmergencia, string> = {
  sin_gobierno: "Buque sin gobierno (RE-01 B)",
  colision: "Colisión (RE-01 C)",
  incendio: "Incendio (RE-01 D)",
  varadura: "Varadura (RE-01 E)",
  remolque: "Remolque de emergencia (RE-01 R)",
};
