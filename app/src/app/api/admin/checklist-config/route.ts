import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { crearChecklistItemSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const buque = await getBuqueActivo();
  const tipo = request.nextUrl.searchParams.get("tipo") ?? undefined;

  const items = await prisma.checklistConfig.findMany({
    where: { buqueId: buque.id, ...(tipo ? { tipo } : {}) },
    orderBy: [{ tipo: "asc" }, { orden: "asc" }],
  });

  return NextResponse.json({ data: items });
}

export async function POST(request: NextRequest) {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const buque = await getBuqueActivo();
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = crearChecklistItemSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { orden, ...datos } = parsed.data;

  const duplicado = await prisma.checklistConfig.findFirst({
    where: { buqueId: buque.id, tipo: datos.tipo, item: datos.item },
  });
  if (duplicado) {
    return NextResponse.json(
      { error: "Ese ítem ya existe en este grupo del checklist" },
      { status: 409 }
    );
  }

  // Si no se indica orden, va al final del grupo.
  const ultimo = await prisma.checklistConfig.findFirst({
    where: { buqueId: buque.id, tipo: datos.tipo },
    orderBy: { orden: "desc" },
    select: { orden: true },
  });

  const item = await prisma.checklistConfig.create({
    data: { ...datos, buqueId: buque.id, orden: orden ?? (ultimo ? ultimo.orden + 1 : 1) },
  });

  return NextResponse.json({ data: item }, { status: 201 });
}
