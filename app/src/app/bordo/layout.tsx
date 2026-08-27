import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";

/** Ver la nota en `tierra/layout.tsx`: mismo guard, para la carga a bordo. */
export default async function BordoLayout({ children }: LayoutProps<"/bordo">) {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login?destino=/bordo");
  if (usuario.rol !== "bordo") redirect("/");

  return <>{children}</>;
}
