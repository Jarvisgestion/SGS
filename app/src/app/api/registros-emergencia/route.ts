import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBuqueActivo } from "@/lib/buque";
import { crearRegistroEmergenciaSchema } from "@/lib/validation";
import { extCreateData, registroEmergenciaInclude } from "@/lib/registroEmergencia";

// GET /api/registros-emergencia?estado=&tipo=
export async function GET(request: NextRequest) {
  const buque = await getBuqueActivo();
  const estado = request.nextUrl.searchParams.get("estado") ?? undefined;
  const tipo = request.nextUrl.searchParams.get("tipo") ?? undefined;

  const registros = await prisma.registroEmergencia.findMany({
    where: { buqueId: buque.id, ...(estado ? { estado } : {}), ...(tipo ? { tipo } : {}) },
    orderBy: { createdAt: "desc" },
    include: registroEmergenciaInclude,
  });

  return NextResponse.json({ data: registros });
}

// POST /api/registros-emergencia — carga a bordo de RE-01 B/C/D/E/R.
export async function POST(request: NextRequest) {
  const buque = await getBuqueActivo();

  const json = await request.json();
  const parsed = crearRegistroEmergenciaSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { tipo, ext, ...base } = parsed.data;

  const registro = await prisma.registroEmergencia.create({
    data: {
      buqueId: buque.id,
      tipo,
      ...base,
      // Ver nota en POST /api/zafarrancho: llega al endpoint porque ya se
      // completó y sincronizó a bordo — "borrador" es client-side únicamente.
      estado: "pendiente_revision",
      submittedAt: new Date(),
      ...extCreateData(tipo, ext),
    },
    include: registroEmergenciaInclude,
  });

  return NextResponse.json({ data: registro }, { status: 201 });
}
