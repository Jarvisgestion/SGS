import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySecret } from "@/lib/hash";

export const COOKIE_SESION = "sgs_sesion";
const DURACION_SESION_HORAS = 12;

export type Rol = "bordo" | "tierra";

export type UsuarioSesion = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  buqueId: string | null;
  tripulanteId: string | null;
};

/**
 * Valida credenciales y abre una sesión. Devuelve null si el usuario no
 * existe, está inactivo o la contraseña no coincide — el mismo resultado en
 * los tres casos, para no filtrar qué emails existen.
 */
export async function login(email: string, password: string): Promise<string | null> {
  const usuario = await prisma.usuario.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!usuario || !usuario.activo) {
    // Se hace igual el trabajo de hashing contra un valor descartable para que
    // un email inexistente no responda notablemente más rápido que uno real.
    await verifySecret(password, "00:00");
    return null;
  }
  if (!(await verifySecret(password, usuario.passwordHash))) return null;

  const token = randomBytes(32).toString("hex");
  await prisma.sesion.create({
    data: {
      token,
      usuarioId: usuario.id,
      expiraAt: new Date(Date.now() + DURACION_SESION_HORAS * 3600 * 1000),
    },
  });
  return token;
}

export async function logout(token: string | undefined) {
  if (token) await prisma.sesion.deleteMany({ where: { token } });
}

/** Usuario de la sesión actual, o null si no hay sesión válida. */
export async function getUsuarioActual(): Promise<UsuarioSesion | null> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!token) return null;

  const sesion = await prisma.sesion.findUnique({
    where: { token },
    include: { usuario: true },
  });
  if (!sesion || sesion.expiraAt < new Date() || !sesion.usuario.activo) return null;

  const u = sesion.usuario;
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol as Rol,
    buqueId: u.buqueId,
    tripulanteId: u.tripulanteId,
  };
}

type Guard = { ok: true; usuario: UsuarioSesion } | { ok: false; response: NextResponse };

/**
 * Guarda para las rutas de API: exige sesión y, opcionalmente, un rol.
 *
 * El chequeo de rol vive acá, en el servidor, y no sólo en la UI: ocultar un
 * botón no impide que alguien llame el endpoint directamente.
 */
export async function requireUsuario(rol?: Rol): Promise<Guard> {
  const usuario = await getUsuarioActual();
  if (!usuario) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Necesitás iniciar sesión" }, { status: 401 }),
    };
  }
  if (rol && usuario.rol !== rol) {
    const queHace = rol === "bordo" ? "cargar registros" : "revisar registros";
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Tu rol (${usuario.rol}) no puede ${queHace}.` },
        { status: 403 }
      ),
    };
  }
  return { ok: true, usuario };
}

/** Borra sesiones ya vencidas. Se llama al iniciar sesión, sin cron aparte. */
export async function limpiarSesionesVencidas() {
  await prisma.sesion.deleteMany({ where: { expiraAt: { lt: new Date() } } });
}
