import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { editarTipoZafarranchoSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Sin DELETE, igual que tripulantes: los ejercicios ya cargados apuntan al
 * tipo. Se da de baja con `activo=false` — deja de ofrecerse al cargar, pero
 * los registros históricos siguen mostrando de qué zafarrancho se trataba.
 *
 * El `codigo` tampoco se edita: es la clave estable por la que se referencia
 * el tipo. Se cambia el nombre visible, no el identificador.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const buque = await getBuqueActivo();

  const existente = await prisma.tipoZafarrancho.findFirst({ where: { id, buqueId: buque.id } });
  if (!existente) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = editarTipoZafarranchoSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const tipo = await prisma.tipoZafarrancho.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ data: tipo });
}
