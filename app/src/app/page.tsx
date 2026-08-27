import Link from "next/link";

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
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-medium text-blue-700">Pesantar 1 — PE-01</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Preparación para Emergencias a Bordo
        </h1>
        <p className="mt-2 text-neutral-600">
          MVP piloto de la plataforma SGS digital. Elegí un registro y desde dónde vas a trabajar.
        </p>
      </div>

      <div className="space-y-4">
        {REGISTROS.map((r) => (
          <div key={r.nombre} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">{r.nombre}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Link
                href={r.bordo}
                className="rounded border border-blue-600 px-3 py-2 text-center text-sm font-medium text-blue-700 transition hover:bg-blue-50"
              >
                A bordo — carga y firma
              </Link>
              <Link
                href={r.tierra}
                className="rounded border border-neutral-300 px-3 py-2 text-center text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
              >
                Tierra — revisión
              </Link>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
