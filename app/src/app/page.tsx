import Link from "next/link";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";

const REGISTROS = [
  {
    nombre: "RE-01 A — Ejercicio de Zafarrancho",
    bordo: "/bordo/zafarrancho",
    tierra: "/tierra/zafarrancho",
  },
  {
    nombre: "RE-01 B/C/D/E/R — Registros de emergencia",
    bordo: "/bordo/emergencia",
    tierra: "/tierra/emergencia",
  },
  {
    nombre: "RE-01 F — Control del bote de rescate",
    bordo: "/bordo/bote-rescate",
    tierra: "/tierra/bote-rescate",
  },
];

export default async function Home() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");

  const esBordo = usuario.rol === "bordo";

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-medium text-blue-700">Pesantar 1 — PE-01</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Preparación para Emergencias a Bordo
        </h1>
        <p className="mt-2 text-neutral-600">
          {esBordo
            ? "Elegí el registro que vas a cargar."
            : "Elegí el registro que vas a revisar."}
        </p>
      </div>

      <div className="space-y-3">
        {REGISTROS.map((r) => (
          <Link
            key={r.nombre}
            href={esBordo ? r.bordo : r.tierra}
            className="block rounded-lg border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-blue-400 hover:shadow"
          >
            <h2 className="font-semibold">{r.nombre}</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {esBordo ? "Cargar y firmar" : "Revisar, aprobar u observar"}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
