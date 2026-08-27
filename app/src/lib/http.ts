import { NextResponse } from "next/server";

/**
 * Lee el body JSON de un request sin explotar si viene vacío, truncado o
 * malformado. `request.json()` lanza una excepción no controlada en ese caso,
 * que Next.js traduce a un 500 con stack trace.
 *
 * Es un escenario esperable acá, no un caso de borde: la carga se hace a bordo
 * sobre un enlace satelital, y un corte a mitad del envío deja el body cortado.
 * Ante eso el buque tiene que recibir un error claro y poder reintentar, no un
 * 500 opaco.
 */
export async function readJsonBody(
  request: Request
): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "El cuerpo del pedido no es JSON válido o llegó incompleto. Reintentá el envío." },
        { status: 400 }
      ),
    };
  }
}
