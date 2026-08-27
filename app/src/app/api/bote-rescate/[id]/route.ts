import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { editarBoteRescateSchema } from "@/lib/validation";
import { verifyPin } from "@/lib/pin";
import { boteRescateInclude } from "@/lib/boteRescate";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const control = await prisma.boteRescateControl.findUnique({
    where: { id },
    include: boteRescateInclude,
  });

  if (!control) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ data: control });
}

// PATCH /api/bote-rescate/[id] — corrección a bordo tras una observación.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const buque = await getBuqueActivo();

  const existente = await prisma.boteRescateControl.findUnique({ where: { id } });
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
  const parsed = editarBoteRescateSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { items, confirmadoPorId, pin, ...base } = parsed.data;

  // La corrección se vuelve a confirmar con PIN: es un nuevo acto de quien
  // rehace el control, no un arrastre de la confirmación original.
  const confirmante = await prisma.tripulante.findFirst({
    where: { id: confirmadoPorId, buqueId: buque.id, activo: true },
  });
  if (!confirmante || !(await verifyPin(pin, confirmante.pinHash))) {
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  const configIds = items.map((i) => i.checklistConfigId);
  const configsValidas = await prisma.checklistConfig.count({
    where: { id: { in: configIds }, buqueId: buque.id },
  });
  if (configsValidas !== new Set(configIds).size) {
    return NextResponse.json(
      { error: "Hay ítems de checklist que no pertenecen a este buque" },
      { status: 400 }
    );
  }

  const control = await prisma.$transaction(async (tx) => {
    await tx.checklistRegistro.deleteMany({ where: { boteRescateControlId: id } });
    await tx.boteRescateControl.update({
      where: { id },
      data: {
        ...base,
        confirmadoPorId,
        confirmadoAt: new Date(),
        estado: "pendiente_revision",
        submittedAt: new Date(),
      },
    });
    await tx.checklistRegistro.createMany({
      data: items.map((i) => ({
        checklistConfigId: i.checklistConfigId,
        registroPadreTipo: "bote_rescate_control",
        registroPadreId: id,
        boteRescateControlId: id,
        fecha: base.fechaHora,
        estado: i.estado,
        observacion: i.observacion ?? null,
      })),
    });
    return tx.boteRescateControl.findUniqueOrThrow({
      where: { id },
      include: boteRescateInclude,
    });
  });

  return NextResponse.json({ data: control });
}
