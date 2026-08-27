import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { revisionSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/zafarrancho/[id]/revision — decisión de tierra (Persona Designada / asesor).
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const existente = await prisma.zafarranchoEjercicio.findUnique({ where: { id } });
  if (!existente) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (existente.estado !== "pendiente_revision") {
    return NextResponse.json(
      { error: "Solo se puede revisar un registro en estado 'pendiente_revision'" },
      { status: 409 }
    );
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = revisionSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const [, ejercicio] = await prisma.$transaction([
    prisma.zafarranchoRevision.create({
      data: {
        ejercicioId: id,
        decision: body.decision,
        comentario: body.comentario,
        revisadoPor: body.revisadoPor,
      },
    }),
    prisma.zafarranchoEjercicio.update({
      where: { id },
      data: { estado: body.decision },
    }),
  ]);

  const ejercicioCompleto = await prisma.zafarranchoEjercicio.findUnique({
    where: { id: ejercicio.id },
    include: {
      tipoZafarrancho: true,
      participantes: true,
      revisiones: { orderBy: { revisadoAt: "desc" } },
    },
  });

  return NextResponse.json({ data: ejercicioCompleto });
}
