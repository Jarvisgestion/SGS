/**
 * Estado de cumplimiento de los zafarranchos.
 *
 * Cada `TipoZafarrancho` guarda su `periodicidadDias` (Incendio cada 30,
 * Buque-Tierra cada 365, etc.). Este módulo es lo que le da sentido a ese
 * dato: responde "¿está el buque al día?", que es la pregunta de una
 * inspección de PNA.
 *
 * Función pura y sin dependencias de Prisma ni de la fecha del sistema (la
 * fecha "hoy" se pasa por parámetro) para poder testearla de verdad.
 */

export type EstadoCumplimiento = "nunca" | "vencido" | "por_vencer" | "al_dia";

export const ESTADO_CUMPLIMIENTO_LABEL: Record<EstadoCumplimiento, string> = {
  nunca: "Sin registros",
  vencido: "Vencido",
  por_vencer: "Por vencer",
  al_dia: "Al día",
};

/**
 * Cuánto antes del vencimiento se avisa: 20% del período. Escala solo con la
 * periodicidad (6 días para uno de 30, 73 para uno anual) en vez de usar un
 * número fijo que sería inútil en un extremo u otro. Es un criterio elegido
 * acá, no algo que fije la especificación: conviene confirmarlo.
 */
const FRACCION_AVISO = 0.2;

export type EntradaCumplimiento = {
  tipoId: string;
  nombre: string;
  periodicidadDias: number;
  /** Fecha del último ejercicio APROBADO por tierra, o null si no hay. */
  ultimoAprobado: Date | null;
  /**
   * Cuántos ejercicios de este tipo se hicieron pero todavía no fueron
   * aprobados. No cuentan para el cumplimiento —tierra no los validó— pero
   * se muestran para no dar por vencido algo que ya está cargado y esperando.
   */
  pendientesRevision: number;
};

export type ResultadoCumplimiento = EntradaCumplimiento & {
  estado: EstadoCumplimiento;
  /** Fecha en que vence el próximo ejercicio; null si nunca se hizo uno. */
  proximoVencimiento: Date | null;
  /** Días hasta el vencimiento; negativo si ya venció. null si nunca se hizo. */
  diasRestantes: number | null;
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Días completos entre dos fechas, ignorando la hora. */
function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((b - a) / MS_POR_DIA);
}

export function calcularCumplimiento(
  entrada: EntradaCumplimiento,
  hoy: Date
): ResultadoCumplimiento {
  if (!entrada.ultimoAprobado) {
    return { ...entrada, estado: "nunca", proximoVencimiento: null, diasRestantes: null };
  }

  const proximoVencimiento = new Date(entrada.ultimoAprobado);
  proximoVencimiento.setDate(proximoVencimiento.getDate() + entrada.periodicidadDias);

  const diasRestantes = diasEntre(hoy, proximoVencimiento);
  // Al menos 1 día de aviso, para que una periodicidad muy corta no salte de
  // "al día" a "vencido" sin pasar por "por vencer".
  const umbralAviso = Math.max(1, Math.floor(entrada.periodicidadDias * FRACCION_AVISO));

  let estado: EstadoCumplimiento;
  if (diasRestantes < 0) estado = "vencido";
  else if (diasRestantes <= umbralAviso) estado = "por_vencer";
  else estado = "al_dia";

  return { ...entrada, estado, proximoVencimiento, diasRestantes };
}

/** Orden de atención: primero lo que hay que resolver. */
const PRIORIDAD: Record<EstadoCumplimiento, number> = {
  vencido: 0,
  por_vencer: 1,
  nunca: 2,
  al_dia: 3,
};

export function calcularCumplimientos(
  entradas: EntradaCumplimiento[],
  hoy: Date
): ResultadoCumplimiento[] {
  return entradas
    .map((e) => calcularCumplimiento(e, hoy))
    .sort((a, b) => {
      const p = PRIORIDAD[a.estado] - PRIORIDAD[b.estado];
      if (p !== 0) return p;
      // Dentro del mismo estado, lo más urgente primero.
      return (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0);
    });
}
