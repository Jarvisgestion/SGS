import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBuqueActivo } from "@/lib/buque";

// GET /api/catalogos — catálogos base para armar el formulario a bordo
// (tipos de zafarrancho y tripulación activa del buque).
export async function GET() {
  const buque = await getBuqueActivo();

  const [tiposZafarrancho, tripulantes] = await Promise.all([
    prisma.tipoZafarrancho.findMany({
      where: { buqueId: buque.id, activo: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.tripulante.findMany({
      where: { buqueId: buque.id, activo: true },
      orderBy: { apellidoNombre: "asc" },
    }),
  ]);

  return NextResponse.json({ data: { buque, tiposZafarrancho, tripulantes } });
}
