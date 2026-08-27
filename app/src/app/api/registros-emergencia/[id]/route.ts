import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { editarRegistroEmergenciaSchema } from "@/lib/validation";
import { extUpdateData, registroEmergenciaInclude } from "@/lib/registroEmergencia";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const registro = await prisma.registroEmergencia.findUnique({
    where: { id },
    include: registroEmergenciaInclude,
  });

  if (!registro) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ data: registro });
}

// PATCH /api/registros-emergencia/[id] — edición a bordo tras una observación, y reenvío a tierra.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const buque = await getBuqueActivo();

  const existente = await prisma.registroEmergencia.findUnique({ where: { id } });
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
  const parsed = editarRegistroEmergenciaSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { tipo, ext, ...base } = parsed.data;

  if (tipo !== existente.tipo) {
    return NextResponse.json(
      { error: "No se puede cambiar el tipo de registro al corregirlo" },
      { status: 400 }
    );
  }

  const registro = await prisma.registroEmergencia.update({
    where: { id },
    data: {
      ...base,
      estado: "pendiente_revision",
      submittedAt: new Date(),
      ...extUpdateData(tipo, ext),
    },
    include: registroEmergenciaInclude,
  });

  return NextResponse.json({ data: registro });
}
