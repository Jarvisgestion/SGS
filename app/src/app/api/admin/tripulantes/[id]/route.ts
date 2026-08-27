import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { editarTripulanteSchema } from "@/lib/validation";
import { hashPin } from "@/lib/pin";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * No hay DELETE a propósito: los registros ya firmados apuntan al tripulante
 * (participantes de un zafarrancho, confirmación de un checklist). Borrarlo
 * rompería la trazabilidad que exige la sección 2.5. La baja es `activo=false`:
 * deja de aparecer en los formularios, pero el historial se mantiene legible.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const buque = await getBuqueActivo();

  const existente = await prisma.tripulante.findFirst({
    where: { id, buqueId: buque.id },
  });
  if (!existente) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = editarTripulanteSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { pin, ...datos } = parsed.data;

  const tripulante = await prisma.tripulante.update({
    where: { id },
    data: {
      ...datos,
      // `pin` ausente deja el PIN como está; presente lo reemplaza.
      ...(pin !== undefined ? { pinHash: pin ? await hashPin(pin) : null } : {}),
    },
    select: { id: true, apellidoNombre: true, dni: true, puesto: true, activo: true, pinHash: true },
  });

  const { pinHash, ...resto } = tripulante;
  return NextResponse.json({ data: { ...resto, tienePin: pinHash !== null } });
}
