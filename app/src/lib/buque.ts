import { prisma } from "@/lib/prisma";

/**
 * El MVP es de una sola empresa y un solo buque (Pesantar 1) — sección 7 de
 * la especificación. En vez de hardcodear el id en cada endpoint, se resuelve
 * el único `Buque` existente. Cuando la plataforma escale a más de un buque,
 * este es el único lugar a tocar para pasar a resolver el buque por sesión/
 * usuario en lugar de "el primero que exista".
 */
export async function getBuqueActivo() {
  const buque = await prisma.buque.findFirst({ orderBy: { createdAt: "asc" } });
  if (!buque) {
    throw new Error(
      "No hay ningún buque cargado. Corré `npm run db:seed` para crear el buque de referencia (Pesantar 1)."
    );
  }
  return buque;
}
