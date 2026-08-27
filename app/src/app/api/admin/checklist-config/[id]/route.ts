import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { editarChecklistItemSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Sin DELETE: cada `checklist_registro` ya cargado apunta a su ítem de
 * configuración, y sin él la revisión en tierra mostraría filas sin nombre.
 * Se da de baja con `activo=false`: no aparece en los controles nuevos y los
 * viejos siguen legibles.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const buque = await getBuqueActivo();

  const existente = await prisma.checklistConfig.findFirst({ where: { id, buqueId: buque.id } });
  if (!existente) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = editarChecklistItemSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await prisma.checklistConfig.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ data: item });
}
