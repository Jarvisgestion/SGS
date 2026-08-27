import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";

/**
 * Guard de rol para toda la sección de tierra. El proxy sólo mira que exista
 * la cookie (corre en Edge y no llega a la base), así que sin esto un usuario
 * de a bordo abría la pantalla de revisión y veía el botón "Guardar revisión"
 * para recibir un 403 al usarlo. La API igual rechaza — esto evita ofrecer
 * una acción que la persona no puede hacer.
 */
export default async function TierraLayout({ children }: LayoutProps<"/tierra">) {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login?destino=/tierra");
  if (usuario.rol !== "tierra") redirect("/");

  return <>{children}</>;
}
