import Link from "next/link";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";

/**
 * La especificación (sección 3) deja abierto si la administración de catálogos
 * la maneja el asesor directamente o hace falta un rol aparte. Para un piloto
 * de un buque y dos usuarios, un tercer rol es burocracia sin beneficio, así
 * que la administra `tierra`.
 *
 * Si más adelante hace falta separarlo, el cambio es acotado: agregar el rol
 * `admin` y cambiar esta condición y la de `requireUsuario` en `/api/admin/*`.
 */
const TABS = [
  { href: "/admin/tripulacion", label: "Tripulación" },
  { href: "/admin/catalogos", label: "Catálogos" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login?destino=/admin");
  if (usuario.rol !== "tierra") redirect("/");

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-10">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← Inicio
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Administración</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Catálogos, tripulación y usuarios de Pesantar 1.
      </p>

      <nav className="mt-5 mb-6 flex gap-2 border-b border-neutral-200">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="border-b-2 border-transparent px-3 py-2 text-sm text-neutral-700 hover:border-blue-400"
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {children}
    </main>
  );
}
