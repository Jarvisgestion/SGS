import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { editarZafarranchoSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const ejercicio = await prisma.zafarranchoEjercicio.findUnique({
    where: { id },
    include: {
      tipoZafarrancho: true,
      // `select` explícito: `tripulante: true` traería también `pinHash`.
      participantes: {
        include: {
          tripulante: { select: { id: true, apellidoNombre: true, dni: true, puesto: true } },
        },
      },
      revisiones: { orderBy: { revisadoAt: "desc" } },
    },
  });

  if (!ejercicio) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ data: ejercicio });
}

// PATCH /api/zafarrancho/[id] — edición a bordo tras una observación, y reenvío a tierra.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const buque = await getBuqueActivo();

  const existente = await prisma.zafarranchoEjercicio.findUnique({ where: { id } });
  if (!existente || existente.buqueId !== buque.id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (existente.estado !== "observado") {
    return NextResponse.json(
      { error: "Solo se puede editar un registro que fue observado por tierra" },
      { status: 409 }
    );
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = editarZafarranchoSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const ejercicio = await prisma.zafarranchoEjercicio.update({
    where: { id },
    data: {
      ...(body.tipoZafarranchoId ? { tipoZafarranchoId: body.tipoZafarranchoId } : {}),
      ...(body.marea !== undefined ? { marea: body.marea } : {}),
      ...(body.singladura !== undefined ? { singladura: body.singladura } : {}),
      ...(body.fecha ? { fecha: body.fecha } : {}),
      ...(body.hora ? { hora: body.hora } : {}),
      ...(body.temasDesarrollados ? { temasDesarrollados: body.temasDesarrollados } : {}),
      ...(body.libroNavegacionFoja !== undefined
        ? { libroNavegacionFoja: body.libroNavegacionFoja }
        : {}),
      ...(body.observaciones !== undefined ? { observaciones: body.observaciones } : {}),
      ...(body.firmaCapitan !== undefined ? { firmaCapitan: body.firmaCapitan } : {}),
      estado: "pendiente_revision",
      submittedAt: new Date(),
      ...(body.participantes
        ? {
            participantes: {
              deleteMany: {},
              create: body.participantes.map((p) => ({
                tripulanteId: p.tripulanteId,
                dni: p.dni,
                puesto: p.puesto,
                firma: p.firma,
              })),
            },
          }
        : {}),
    },
    include: { participantes: true, tipoZafarrancho: true },
  });

  return NextResponse.json({ data: ejercicio });
}
