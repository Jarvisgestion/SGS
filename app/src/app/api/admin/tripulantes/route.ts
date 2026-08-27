import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { crearTripulanteSchema } from "@/lib/validation";
import { hashPin } from "@/lib/pin";

/**
 * `select` explícito en todo este archivo: `pinHash` no puede salir del
 * servidor. Se expone `tienePin` (booleano derivado) para que la pantalla
 * pueda mostrar quién ya tiene PIN asignado sin filtrar el hash.
 */
const SELECT = {
  id: true,
  apellidoNombre: true,
  dni: true,
  puesto: true,
  activo: true,
  pinHash: true,
} as const;

type ConHash = { pinHash: string | null };
function sinHash<T extends ConHash>({ pinHash, ...resto }: T) {
  return { ...resto, tienePin: pinHash !== null };
}

export async function GET() {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const buque = await getBuqueActivo();
  const tripulantes = await prisma.tripulante.findMany({
    where: { buqueId: buque.id },
    orderBy: [{ activo: "desc" }, { apellidoNombre: "asc" }],
    select: SELECT,
  });

  return NextResponse.json({ data: tripulantes.map(sinHash) });
}

export async function POST(request: NextRequest) {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const buque = await getBuqueActivo();
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = crearTripulanteSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { pin, ...datos } = parsed.data;

  const duplicado = await prisma.tripulante.findFirst({
    where: { buqueId: buque.id, dni: datos.dni },
  });
  if (duplicado) {
    return NextResponse.json(
      { error: `Ya hay un tripulante con el DNI ${datos.dni} en este buque` },
      { status: 409 }
    );
  }

  const tripulante = await prisma.tripulante.create({
    data: {
      ...datos,
      buqueId: buque.id,
      pinHash: pin ? await hashPin(pin) : null,
    },
    select: SELECT,
  });

  return NextResponse.json({ data: sinHash(tripulante) }, { status: 201 });
}
