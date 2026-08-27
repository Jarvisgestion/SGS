import Link from "next/link";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { getBuqueActivo } from "@/lib/buque";
import { obtenerCumplimiento } from "@/lib/cumplimientoQuery";

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

  const buque = await getBuqueActivo();
  const cumplimiento = await obtenerCumplimiento(buque.id);
  const vencidos = cumplimiento.filter((c) => c.estado === "vencido").length;
  const porVencer = cumplimiento.filter((c) => c.estado === "por_vencer").length;
  const pendiente = vencidos + porVencer;

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

      <Link
        href="/cumplimiento"
        className={`block rounded-lg border p-5 shadow-sm transition hover:shadow ${
          pendiente > 0
            ? "border-amber-300 bg-amber-50 hover:border-amber-400"
            : "border-neutral-200 bg-white hover:border-blue-400"
        }`}
      >
        <h2 className="font-semibold">Cumplimiento de zafarranchos</h2>
        <p className="mt-1 text-sm text-neutral-700">
          {vencidos > 0 && <strong>{vencidos} vencido(s). </strong>}
          {porVencer > 0 && <>{porVencer} por vencer. </>}
          {pendiente === 0 && "Todos los zafarranchos están al día."}
        </p>
      </Link>

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

      {!esBordo && (
        <Link href="/admin" className="text-sm text-blue-700 underline">
          Administración — tripulación, catálogos y usuarios
        </Link>
      )}
    </main>
  );
}
