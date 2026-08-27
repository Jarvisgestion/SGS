import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { crearUsuarioSchema } from "@/lib/validation";
import { hashSecret } from "@/lib/hash";

/** `select` explícito: `passwordHash` nunca sale del servidor. */
const SELECT = {
  id: true,
  email: true,
  nombre: true,
  rol: true,
  activo: true,
  tripulanteId: true,
  createdAt: true,
} as const;

export async function GET() {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const usuarios = await prisma.usuario.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    select: SELECT,
  });

  return NextResponse.json({ data: usuarios });
}

export async function POST(request: NextRequest) {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = crearUsuarioSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { password, email, rol, tripulanteId, ...datos } = parsed.data;

  const emailNormalizado = email.toLowerCase().trim();
  const duplicado = await prisma.usuario.findUnique({ where: { email: emailNormalizado } });
  if (duplicado) {
    return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
  }

  const buque = await getBuqueActivo();

  const usuario = await prisma.usuario.create({
    data: {
      ...datos,
      email: emailNormalizado,
      rol,
      passwordHash: await hashSecret(password),
      // Los usuarios de a bordo pertenecen a un buque; los de tierra operan
      // sobre toda la flota, así que no se atan a ninguno.
      buqueId: rol === "bordo" ? buque.id : null,
      tripulanteId: tripulanteId || null,
    },
    select: SELECT,
  });

  return NextResponse.json({ data: usuario }, { status: 201 });
}
