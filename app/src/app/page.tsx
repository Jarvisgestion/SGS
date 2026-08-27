import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-medium text-blue-700">Pesantar 1 — PE-01</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Preparación para Emergencias a Bordo
        </h1>
        <p className="mt-2 text-neutral-600">
          MVP piloto de la plataforma SGS digital. Elegí desde dónde vas a trabajar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/bordo/zafarrancho"
          className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-blue-400 hover:shadow"
        >
          <h2 className="text-lg font-semibold">A bordo</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Cargar el Registro de Ejercicio de Zafarrancho (RE-01 A) y firmar.
          </p>
        </Link>

        <Link
          href="/tierra/zafarrancho"
          className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-blue-400 hover:shadow"
        >
          <h2 className="text-lg font-semibold">Tierra</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Revisar los registros sincronizados y aprobarlos u observarlos.
          </p>
        </Link>
      </div>
    </main>
  );
}
