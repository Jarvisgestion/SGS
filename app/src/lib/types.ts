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
