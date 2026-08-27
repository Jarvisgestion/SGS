import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { crearZafarranchoSchema } from "@/lib/validation";

// GET /api/zafarrancho?estado=pendiente_revision
export async function GET(request: NextRequest) {
  const buque = await getBuqueActivo();
  const estado = request.nextUrl.searchParams.get("estado") ?? undefined;

  const ejercicios = await prisma.zafarranchoEjercicio.findMany({
    where: { buqueId: buque.id, ...(estado ? { estado } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      tipoZafarrancho: true,
      participantes: true,
      revisiones: { orderBy: { revisadoAt: "desc" } },
    },
  });

  return NextResponse.json({ data: ejercicios });
}

// POST /api/zafarrancho — carga a bordo del Registro de Ejercicio de Zafarrancho (RE-01 A)
export async function POST(request: NextRequest) {
  const buque = await getBuqueActivo();

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = crearZafarranchoSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const tipo = await prisma.tipoZafarrancho.findFirst({
    where: { id: body.tipoZafarranchoId, buqueId: buque.id },
  });
  if (!tipo) {
    return NextResponse.json(
      { error: "El tipo de zafarrancho indicado no existe para este buque" },
      { status: 400 }
    );
  }

  const tripulanteIds = body.participantes.map((p) => p.tripulanteId);
  const tripulantesValidos = await prisma.tripulante.count({
    where: { id: { in: tripulanteIds }, buqueId: buque.id },
  });
  if (tripulantesValidos !== new Set(tripulanteIds).size) {
    return NextResponse.json(
      { error: "Hay participantes que no pertenecen a la tripulación de este buque" },
      { status: 400 }
    );
  }

  const ejercicio = await prisma.zafarranchoEjercicio.create({
    data: {
      buqueId: buque.id,
      tipoZafarranchoId: body.tipoZafarranchoId,
      marea: body.marea,
      singladura: body.singladura,
      fecha: body.fecha,
      hora: body.hora,
      temasDesarrollados: body.temasDesarrollados,
      libroNavegacionFoja: body.libroNavegacionFoja,
      observaciones: body.observaciones,
      firmaCapitan: body.firmaCapitan,
      // Llega al endpoint porque ya se completó y sincronizó a bordo (sección 2,
      // pasos 1-3); el estado "borrador" es exclusivamente client-side mientras
      // se completa el formulario, no un estado que se persista en el servidor.
      estado: "pendiente_revision",
      submittedAt: new Date(),
      participantes: {
        create: body.participantes.map((p) => ({
          tripulanteId: p.tripulanteId,
          dni: p.dni,
          puesto: p.puesto,
          firma: p.firma,
        })),
      },
    },
    include: { participantes: true, tipoZafarrancho: true },
  });

  return NextResponse.json({ data: ejercicio }, { status: 201 });
}
