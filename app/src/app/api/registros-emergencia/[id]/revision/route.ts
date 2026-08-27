import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { revisionSchema } from "@/lib/validation";
import { registroEmergenciaInclude } from "@/lib/registroEmergencia";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/registros-emergencia/[id]/revision — decisión de tierra (Persona Designada / asesor).
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const existente = await prisma.registroEmergencia.findUnique({ where: { id } });
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

  await prisma.$transaction([
    prisma.registroEmergenciaRevision.create({
      data: {
        registroId: id,
        decision: body.decision,
        comentario: body.comentario,
        revisadoPor: auth.usuario.nombre,
        revisadoPorId: auth.usuario.id,
      },
    }),
    prisma.registroEmergencia.update({
      where: { id },
      data: { estado: body.decision },
    }),
  ]);

  const registroCompleto = await prisma.registroEmergencia.findUnique({
    where: { id },
    include: registroEmergenciaInclude,
  });

  return NextResponse.json({ data: registroCompleto });
}
