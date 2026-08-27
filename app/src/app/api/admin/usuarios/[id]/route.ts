import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { getBuqueActivo } from "@/lib/buque";
import { editarUsuarioSchema } from "@/lib/validation";
import { hashSecret } from "@/lib/hash";

type RouteContext = { params: Promise<{ id: string }> };

const SELECT = {
  id: true,
  email: true,
  nombre: true,
  rol: true,
  activo: true,
  tripulanteId: true,
  createdAt: true,
} as const;

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireUsuario("tierra");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existente = await prisma.usuario.findUnique({ where: { id } });
  if (!existente) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = editarUsuarioSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { password, rol, tripulanteId, ...datos } = parsed.data;

  // Nadie puede dejar la plataforma sin administrador: si esta edición saca al
  // último usuario de tierra activo (dándolo de baja o pasándolo a bordo), ya
  // no habría forma de volver a entrar a administrar.
  const dejaDeSerTierra = (rol && rol !== "tierra") || datos.activo === false;
  if (existente.rol === "tierra" && dejaDeSerTierra) {
    const otrosTierra = await prisma.usuario.count({
      where: { rol: "tierra", activo: true, id: { not: id } },
    });
    if (otrosTierra === 0) {
      return NextResponse.json(
        {
          error:
            "Es el último usuario de tierra activo. Creá o activá otro antes de darlo de baja o cambiarle el rol.",
        },
        { status: 409 }
      );
    }
  }

  const buque = await getBuqueActivo();
  const rolFinal = rol ?? existente.rol;

  const usuario = await prisma.usuario.update({
    where: { id },
    data: {
      ...datos,
      ...(rol ? { rol } : {}),
      ...(password ? { passwordHash: await hashSecret(password) } : {}),
      ...(rol ? { buqueId: rolFinal === "bordo" ? buque.id : null } : {}),
      ...(tripulanteId !== undefined ? { tripulanteId: tripulanteId || null } : {}),
    },
    select: SELECT,
  });

  // Cambiar la contraseña o dar de baja cierra las sesiones abiertas: si no,
  // quien ya estaba adentro seguiría trabajando con la credencial revocada.
  if (password || datos.activo === false) {
    await prisma.sesion.deleteMany({ where: { usuarioId: id } });
  }

  return NextResponse.json({ data: usuario });
}
