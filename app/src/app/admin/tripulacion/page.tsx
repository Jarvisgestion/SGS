"use client";

import { useEffect, useState } from "react";

type Tripulante = {
  id: string;
  apellidoNombre: string;
  dni: string;
  puesto: string;
  activo: boolean;
  tienePin: boolean;
};

export default function AdminTripulacionPage() {
  const [tripulantes, setTripulantes] = useState<Tripulante[]>([]);
  const [loading, setLoading] = useState(true);
  const [errores, setErrores] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const [nuevo, setNuevo] = useState({ apellidoNombre: "", dni: "", puesto: "", pin: "" });
  const [pinEditando, setPinEditando] = useState<Record<string, string>>({});

  async function cargar() {
    setLoading(true);
    const res = await fetch("/api/admin/tripulantes");
    const json = await res.json();
    setTripulantes(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial al montar
    cargar();
  }, []);

  function mostrarError(json: unknown) {
    const e = json as { error?: unknown };
    if (typeof e.error === "string") return setErrores([e.error]);
    const f = e.error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    setErrores([...(f?.formErrors ?? []), ...Object.values(f?.fieldErrors ?? {}).flat()]);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setErrores([]);
    setAviso(null);
    const res = await fetch("/api/admin/tripulantes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...nuevo, pin: nuevo.pin || null }),
    });
    const json = await res.json();
    if (!res.ok) return mostrarError(json);
    setNuevo({ apellidoNombre: "", dni: "", puesto: "", pin: "" });
    setAviso("Tripulante dado de alta.");
    cargar();
  }

  async function actualizar(id: string, cambios: Record<string, unknown>, mensaje: string) {
    setErrores([]);
    setAviso(null);
    const res = await fetch(`/api/admin/tripulantes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    const json = await res.json();
    if (!res.ok) return mostrarError(json);
    setAviso(mensaje);
    cargar();
  }

  if (loading) return <p className="text-sm text-neutral-500">Cargando…</p>;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-800">Alta de tripulante</h2>
        <form
          onSubmit={crear}
          className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2"
        >
          <label className="block text-sm">
            Apellido y nombre
            <input
              required
              value={nuevo.apellidoNombre}
              onChange={(e) => setNuevo({ ...nuevo, apellidoNombre: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            DNI
            <input
              required
              inputMode="numeric"
              value={nuevo.dni}
              onChange={(e) => setNuevo({ ...nuevo, dni: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            Puesto
            <input
              required
              value={nuevo.puesto}
              onChange={(e) => setNuevo({ ...nuevo, puesto: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            PIN de confirmación <span className="text-neutral-500">(4 a 8 dígitos, opcional)</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={nuevo.pin}
              onChange={(e) => setNuevo({ ...nuevo, pin: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <div className="sm:col-span-2">
            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white">
              Dar de alta
            </button>
          </div>
        </form>
      </section>

      {errores.length > 0 && (
        <ul className="list-inside list-disc rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {errores.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {aviso && (
        <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{aviso}</p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-800">
          Tripulación ({tripulantes.filter((t) => t.activo).length} activo/s)
        </h2>
        <div className="space-y-2">
          {tripulantes.map((t) => (
            <div
              key={t.id}
              className={`rounded border p-3 text-sm ${
                t.activo ? "border-neutral-200 bg-white" : "border-neutral-200 bg-neutral-50 opacity-70"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{t.apellidoNombre}</span>
                  <span className="ml-2 text-neutral-500">
                    {t.puesto} · DNI {t.dni}
                  </span>
                  {!t.activo && (
                    <span className="ml-2 rounded bg-neutral-200 px-2 py-0.5 text-xs">Dado de baja</span>
                  )}
                  <span
                    className={`ml-2 rounded px-2 py-0.5 text-xs ${
                      t.tienePin ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {t.tienePin ? "Con PIN" : "Sin PIN"}
                  </span>
                </div>
                <button
                  onClick={() =>
                    actualizar(
                      t.id,
                      { activo: !t.activo },
                      t.activo ? "Tripulante dado de baja." : "Tripulante reactivado."
                    )
                  }
                  className="rounded border border-neutral-400 px-2 py-1 text-xs text-neutral-700"
                >
                  {t.activo ? "Dar de baja" : "Reactivar"}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={t.tienePin ? "Nuevo PIN" : "Asignar PIN"}
                  value={pinEditando[t.id] ?? ""}
                  onChange={(e) => setPinEditando({ ...pinEditando, [t.id]: e.target.value })}
                  className="w-36 rounded border border-neutral-300 p-1.5 text-sm"
                />
                <button
                  disabled={!pinEditando[t.id]}
                  onClick={() => {
                    actualizar(t.id, { pin: pinEditando[t.id] }, `PIN actualizado para ${t.apellidoNombre}.`);
                    setPinEditando({ ...pinEditando, [t.id]: "" });
                  }}
                  className="rounded border border-blue-600 px-2 py-1 text-xs text-blue-700 disabled:opacity-40"
                >
                  Guardar PIN
                </button>
                {t.tienePin && (
                  <button
                    onClick={() =>
                      actualizar(t.id, { pin: null }, `PIN quitado a ${t.apellidoNombre}.`)
                    }
                    className="text-xs text-red-700 underline"
                  >
                    Quitar PIN
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          La baja no borra al tripulante: los registros ya firmados lo referencian y deben seguir
          siendo legibles para una inspección. Deja de aparecer en los formularios nuevos.
        </p>
      </section>
    </div>
  );
}
