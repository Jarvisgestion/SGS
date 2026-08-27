import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBuqueActivo } from "@/lib/buque";
import { TIPOS_CHECKLIST_BOTE } from "@/lib/validation";

// GET /api/catalogos — catálogos base para armar los formularios a bordo:
// tipos de zafarrancho, tripulación activa e ítems de checklist del bote.
export async function GET() {
  const buque = await getBuqueActivo();

  const [tiposZafarrancho, tripulantes, checklistBote] = await Promise.all([
    prisma.tipoZafarrancho.findMany({
      where: { buqueId: buque.id, activo: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.tripulante.findMany({
      where: { buqueId: buque.id, activo: true },
      orderBy: { apellidoNombre: "asc" },
      // `select` explícito, NO el registro completo: `pinHash` no puede salir
      // del servidor. Este endpoint lo consume el navegador.
      select: { id: true, apellidoNombre: true, dni: true, puesto: true },
    }),
    prisma.checklistConfig.findMany({
      where: { buqueId: buque.id, activo: true, tipo: { in: [...TIPOS_CHECKLIST_BOTE] } },
      orderBy: [{ tipo: "asc" }, { orden: "asc" }],
    }),
  ]);

  return NextResponse.json({ data: { buque, tiposZafarrancho, tripulantes, checklistBote } });
}
