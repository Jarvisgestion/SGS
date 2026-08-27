import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { crearTipoZafarranchoSchema } from "@/lib/validation";

export async function GET() {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const buque = await getBuqueActivo();
  const tipos = await prisma.tipoZafarrancho.findMany({
    where: { buqueId: buque.id },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });

  return NextResponse.json({ data: tipos });
}

export async function POST(request: NextRequest) {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const buque = await getBuqueActivo();
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = crearTipoZafarranchoSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const duplicado = await prisma.tipoZafarrancho.findFirst({
    where: { buqueId: buque.id, codigo: parsed.data.codigo },
  });
  if (duplicado) {
    return NextResponse.json(
      { error: `Ya existe un tipo con el código "${parsed.data.codigo}"` },
      { status: 409 }
    );
  }

  const tipo = await prisma.tipoZafarrancho.create({
    data: { ...parsed.data, buqueId: buque.id },
  });

  return NextResponse.json({ data: tipo }, { status: 201 });
}
