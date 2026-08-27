import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_SESION } from "@/lib/auth";

/**
 * Redirección de conveniencia: si no hay cookie de sesión, manda al login en
 * vez de mostrar una pantalla vacía.
 *
 * IMPORTANTE — esto NO es el control de acceso. Acá sólo se mira si la cookie
 * existe, no si es válida ni qué rol tiene: el proxy corre en el runtime Edge
 * y no puede consultar la base. La autorización real (sesión vigente + rol)
 * se hace en cada ruta de API con `requireUsuario()`, que es lo que un
 * atacante no puede saltear falsificando una cookie cualquiera.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get(COOKIE_SESION)) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("destino", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/bordo/:path*", "/tierra/:path*"],
};
