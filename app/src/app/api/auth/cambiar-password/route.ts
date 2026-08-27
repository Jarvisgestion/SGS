import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COOKIE_SESION, requireUsuario } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { cambiarPasswordSchema } from "@/lib/validation";
import { hashSecret, verifySecret } from "@/lib/hash";

/**
 * Cambio de la contraseña propia. Pide la actual a propósito: sin eso, una
 * sesión olvidada abierta en el puente alcanzaría para quedarse con la cuenta.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUsuario();
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = cambiarPasswordSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: auth.usuario.id } });
  if (!usuario || !(await verifySecret(parsed.data.passwordActual, usuario.passwordHash))) {
    return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 401 });
  }

  const tokenActual = request.cookies.get(COOKIE_SESION)?.value;

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuario.id },
      data: { passwordHash: await hashSecret(parsed.data.passwordNueva) },
    }),
    // Cierra las otras sesiones (otro dispositivo, alguien más adentro) pero
    // conserva la actual, para no expulsar a quien acaba de cambiarla.
    prisma.sesion.deleteMany({
      where: { usuarioId: usuario.id, ...(tokenActual ? { token: { not: tokenActual } } : {}) },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
