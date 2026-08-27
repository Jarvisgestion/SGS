"use client";

import { useEffect, useMemo, useState } from "react";
import { TIPO_CHECKLIST_BOTE_LABEL } from "@/lib/types";

type TipoZafarrancho = {
  id: string;
  codigo: string;
  nombre: string;
  periodicidadDias: number;
  activo: boolean;
};

type ChecklistItem = {
  id: string;
  tipo: string;
  item: string;
  cantidadEsperada: number | null;
  orden: number;
  activo: boolean;
};

const GRUPOS_BOTE = ["bote_exterior", "bote_interior", "bote_pescante", "bote_inventario"];

export default function AdminCatalogosPage() {
  const [tipos, setTipos] = useState<TipoZafarrancho[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errores, setErrores] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const [nuevoTipo, setNuevoTipo] = useState({ codigo: "", nombre: "", periodicidadDias: "30" });
  const [nuevoItem, setNuevoItem] = useState({ tipo: GRUPOS_BOTE[0], item: "", cantidadEsperada: "" });
  const [periodicidades, setPeriodicidades] = useState<Record<string, string>>({});

  async function cargar() {
    setLoading(true);
    const [t, i] = await Promise.all([
      fetch("/api/admin/tipos-zafarrancho").then((r) => r.json()),
      fetch("/api/admin/checklist-config").then((r) => r.json()),
    ]);
    setTipos(t.data ?? []);
    setItems(i.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial al montar
    cargar();
  }, []);

  const itemsPorGrupo = useMemo(() => {
    const out: Record<string, ChecklistItem[]> = {};
    for (const i of items) (out[i.tipo] ??= []).push(i);
    return out;
  }, [items]);

  function mostrarError(json: unknown) {
    const e = json as { error?: unknown };
    if (typeof e.error === "string") return setErrores([e.error]);
    const f = e.error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    setErrores([...(f?.formErrors ?? []), ...Object.values(f?.fieldErrors ?? {}).flat()]);
  }

  async function llamar(url: string, method: string, body: unknown, mensaje: string) {
    setErrores([]);
    setAviso(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) return mostrarError(json);
    setAviso(mensaje);
    cargar();
  }

  if (loading) return <p className="text-sm text-neutral-500">Cargando…</p>;

  return (
    <div className="space-y-10">
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
        <h2 className="text-sm font-semibold text-neutral-800">Tipos de zafarrancho y periodicidad</h2>
        <p className="mt-1 mb-3 text-xs text-neutral-500">
          Los valores que vinieron del manual de referencia (Xeitosiño Rev. 15) son un punto de
          partida. Ajustalos a lo que defina el manual de Pesantar.
        </p>

        <div className="space-y-2">
          {tipos.map((t) => (
            <div
              key={t.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm ${
                t.activo ? "border-neutral-200 bg-white" : "border-neutral-200 bg-neutral-50 opacity-70"
              }`}
            >
              <div>
                <span className="font-medium">{t.nombre}</span>
                <code className="ml-2 text-xs text-neutral-500">{t.codigo}</code>
                {!t.activo && (
                  <span className="ml-2 rounded bg-neutral-200 px-2 py-0.5 text-xs">Inactivo</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-neutral-600">
                  cada
                  <input
                    type="number"
                    min={1}
                    value={periodicidades[t.id] ?? String(t.periodicidadDias)}
                    onChange={(e) => setPeriodicidades({ ...periodicidades, [t.id]: e.target.value })}
                    className="mx-1 w-20 rounded border border-neutral-300 p-1 text-sm"
                  />
                  días
                </label>
                <button
                  disabled={(periodicidades[t.id] ?? String(t.periodicidadDias)) === String(t.periodicidadDias)}
                  onClick={() =>
                    llamar(
                      `/api/admin/tipos-zafarrancho/${t.id}`,
                      "PATCH",
                      { periodicidadDias: Number(periodicidades[t.id]) },
                      `Periodicidad de "${t.nombre}" actualizada.`
                    )
                  }
                  className="rounded border border-blue-600 px-2 py-1 text-xs text-blue-700 disabled:opacity-40"
                >
                  Guardar
                </button>
                <button
                  onClick={() =>
                    llamar(
                      `/api/admin/tipos-zafarrancho/${t.id}`,
                      "PATCH",
                      { activo: !t.activo },
                      t.activo ? `"${t.nombre}" desactivado.` : `"${t.nombre}" reactivado.`
                    )
                  }
                  className="rounded border border-neutral-400 px-2 py-1 text-xs text-neutral-700"
                >
                  {t.activo ? "Desactivar" : "Reactivar"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            llamar(
              "/api/admin/tipos-zafarrancho",
              "POST",
              { ...nuevoTipo, periodicidadDias: Number(nuevoTipo.periodicidadDias) },
              "Tipo de zafarrancho agregado."
            );
            setNuevoTipo({ codigo: "", nombre: "", periodicidadDias: "30" });
          }}
          className="mt-4 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-4"
        >
          <label className="block text-sm sm:col-span-1">
            Código
            <input
              required
              placeholder="hombre_al_agua"
              value={nuevoTipo.codigo}
              onChange={(e) => setNuevoTipo({ ...nuevoTipo, codigo: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            Nombre
            <input
              required
              value={nuevoTipo.nombre}
              onChange={(e) => setNuevoTipo({ ...nuevoTipo, nombre: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            Cada (días)
            <input
              type="number"
              min={1}
              required
              value={nuevoTipo.periodicidadDias}
              onChange={(e) => setNuevoTipo({ ...nuevoTipo, periodicidadDias: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <div className="sm:col-span-4">
            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white">
              Agregar tipo
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-neutral-800">
          Ítems del checklist del bote de rescate (RE-01 F)
        </h2>
        <p className="mt-1 mb-3 text-xs text-neutral-500">
          Lo que se agregue acá aparece en el checklist a bordo. La cantidad esperada sólo tiene
          sentido en el inventario.
        </p>

        {GRUPOS_BOTE.map((grupo) => (
          <div key={grupo} className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {TIPO_CHECKLIST_BOTE_LABEL[grupo] ?? grupo}
            </h3>
            <div className="space-y-1">
              {(itemsPorGrupo[grupo] ?? []).map((i) => (
                <div
                  key={i.id}
                  className={`flex items-center justify-between gap-2 rounded border p-2 text-sm ${
                    i.activo ? "border-neutral-200 bg-white" : "border-neutral-200 bg-neutral-50 opacity-70"
                  }`}
                >
                  <span>
                    {i.item}
                    {i.cantidadEsperada != null && (
                      <span className="ml-1 text-xs text-neutral-500">
                        (esperado: {i.cantidadEsperada})
                      </span>
                    )}
                    {!i.activo && (
                      <span className="ml-2 rounded bg-neutral-200 px-2 py-0.5 text-xs">Inactivo</span>
                    )}
                  </span>
                  <button
                    onClick={() =>
                      llamar(
                        `/api/admin/checklist-config/${i.id}`,
                        "PATCH",
                        { activo: !i.activo },
                        i.activo ? "Ítem desactivado." : "Ítem reactivado."
                      )
                    }
                    className="shrink-0 rounded border border-neutral-400 px-2 py-1 text-xs text-neutral-700"
                  >
                    {i.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </div>
              ))}
              {(itemsPorGrupo[grupo] ?? []).length === 0 && (
                <p className="text-xs text-neutral-500">Sin ítems en este grupo.</p>
              )}
            </div>
          </div>
        ))}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            llamar(
              "/api/admin/checklist-config",
              "POST",
              {
                tipo: nuevoItem.tipo,
                item: nuevoItem.item,
                cantidadEsperada: nuevoItem.cantidadEsperada
                  ? Number(nuevoItem.cantidadEsperada)
                  : null,
              },
              "Ítem agregado al checklist."
            );
            setNuevoItem({ ...nuevoItem, item: "", cantidadEsperada: "" });
          }}
          className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-4"
        >
          <label className="block text-sm">
            Grupo
            <select
              value={nuevoItem.tipo}
              onChange={(e) => setNuevoItem({ ...nuevoItem, tipo: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            >
              {GRUPOS_BOTE.map((g) => (
                <option key={g} value={g}>
                  {TIPO_CHECKLIST_BOTE_LABEL[g] ?? g}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            Ítem a verificar
            <input
              required
              value={nuevoItem.item}
              onChange={(e) => setNuevoItem({ ...nuevoItem, item: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            Cantidad esperada
            <input
              type="number"
              min={1}
              value={nuevoItem.cantidadEsperada}
              onChange={(e) => setNuevoItem({ ...nuevoItem, cantidadEsperada: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <div className="sm:col-span-4">
            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white">
              Agregar ítem
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
