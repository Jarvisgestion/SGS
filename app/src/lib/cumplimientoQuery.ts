import { prisma } from "@/lib/prisma";
import { calcularCumplimientos, type EntradaCumplimiento } from "@/lib/cumplimiento";

/**
 * Arma el estado de cumplimiento de los zafarranchos de un buque.
 *
 * Sólo cuenta los ejercicios `aprobado`: uno cargado pero todavía sin revisar
 * no es evidencia de cumplimiento ante una inspección. Los pendientes se
 * cuentan aparte para poder mostrarlos y no dar por "vencido sin más" algo
 * que ya se hizo y está esperando revisión.
 */
export async function obtenerCumplimiento(buqueId: string, hoy = new Date()) {
  const tipos = await prisma.tipoZafarrancho.findMany({
    where: { buqueId, activo: true },
    orderBy: { nombre: "asc" },
    include: {
      ejercicios: {
        where: { estado: { in: ["aprobado", "pendiente_revision"] } },
        select: { fecha: true, estado: true },
        orderBy: { fecha: "desc" },
      },
    },
  });

  const entradas: EntradaCumplimiento[] = tipos.map((t) => ({
    tipoId: t.id,
    nombre: t.nombre,
    periodicidadDias: t.periodicidadDias,
    ultimoAprobado: t.ejercicios.find((e) => e.estado === "aprobado")?.fecha ?? null,
    pendientesRevision: t.ejercicios.filter((e) => e.estado === "pendiente_revision").length,
  }));

  return calcularCumplimientos(entradas, hoy);
}
