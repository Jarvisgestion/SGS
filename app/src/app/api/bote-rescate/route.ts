import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { crearBoteRescateSchema } from "@/lib/validation";
import { verifyPin } from "@/lib/pin";
import { boteRescateInclude } from "@/lib/boteRescate";

// GET /api/bote-rescate?estado=
export async function GET(request: NextRequest) {
  const buque = await getBuqueActivo();
  const estado = request.nextUrl.searchParams.get("estado") ?? undefined;

  const controles = await prisma.boteRescateControl.findMany({
    where: { buqueId: buque.id, ...(estado ? { estado } : {}) },
    orderBy: { createdAt: "desc" },
    include: boteRescateInclude,
  });

  return NextResponse.json({ data: controles });
}

// POST /api/bote-rescate — carga a bordo de RE-01 F, confirmada por PIN.
export async function POST(request: NextRequest) {
  const buque = await getBuqueActivo();

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = crearBoteRescateSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { items, confirmadoPorId, pin, ...base } = parsed.data;

  const confirmante = await prisma.tripulante.findFirst({
    where: { id: confirmadoPorId, buqueId: buque.id, activo: true },
  });
  if (!confirmante || !(await verifyPin(pin, confirmante.pinHash))) {
    // Mismo mensaje exista o no el tripulante, para no revelar quién tiene PIN cargado.
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

  // Transacción interactiva: `registroPadreId` (el puntero genérico que la
  // especificación pide para poder reusar checklist_registro desde otros
  // registros) necesita el id del padre, que recién existe después del insert.
  // Hacerlo en dos writes sueltos dejaría filas huérfanas si el segundo falla.
  const control = await prisma.$transaction(async (tx) => {
    const creado = await tx.boteRescateControl.create({
      data: {
        buqueId: buque.id,
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
        registroPadreId: creado.id,
        boteRescateControlId: creado.id,
        fecha: base.fechaHora,
        estado: i.estado,
        observacion: i.observacion ?? null,
      })),
    });

    return tx.boteRescateControl.findUniqueOrThrow({
      where: { id: creado.id },
      include: boteRescateInclude,
    });
  });

  return NextResponse.json({ data: control }, { status: 201 });
}
