import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/http";
import { COOKIE_SESION, limpiarSesionesVencidas, login } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().min(1, "Ingresá tu email"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export async function POST(request: NextRequest) {
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = loginSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const token = await login(parsed.data.email, parsed.data.password);
  if (!token) {
    // Mensaje único: no distingue "no existe" de "contraseña incorrecta".
    return NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
  }

  await limpiarSesionesVencidas();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_SESION, token, {
    httpOnly: true, // inaccesible desde JavaScript: acota el robo por XSS
    sameSite: "lax", // corta el CSRF básico desde otros sitios
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 3600,
  });
  return response;
}
