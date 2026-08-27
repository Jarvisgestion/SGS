"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ESTADO_LABEL, type Estado, type ZafarranchoEjercicioCompleto } from "@/lib/types";

const ESTADO_BADGE: Record<string, string> = {
  pendiente_revision: "bg-amber-100 text-amber-800",
  aprobado: "bg-green-100 text-green-800",
  observado: "bg-red-100 text-red-800",
  borrador: "bg-neutral-100 text-neutral-700",
};

const FILTROS: { value: Estado | "todos"; label: string }[] = [
  { value: "pendiente_revision", label: "Pendientes" },
  { value: "aprobado", label: "Aprobados" },
  { value: "observado", label: "Observados" },
  { value: "todos", label: "Todos" },
];

export default function TierraZafarranchoPage() {
  const [filtro, setFiltro] = useState<Estado | "todos">("pendiente_revision");
  const [ejercicios, setEjercicios] = useState<ZafarranchoEjercicioCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [seleccionado, setSeleccionado] = useState<ZafarranchoEjercicioCompleto | null>(null);

  const [decision, setDecision] = useState<"aprobado" | "observado">("aprobado");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    const qs = filtro === "todos" ? "" : `?estado=${filtro}`;
    const res = await fetch(`/api/zafarrancho${qs}`);
    const json = await res.json();
    setEjercicios(json.data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recarga al cambiar el filtro
    cargar();
    setSeleccionado(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  function seleccionar(ej: ZafarranchoEjercicioCompleto) {
    setSeleccionado(ej);
    setDecision("aprobado");
    setComentario("");
    setError(null);
  }

  async function enviarRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!seleccionado) return;
    setError(null);

    if (decision === "observado" && !comentario.trim()) {
      setError("El comentario es obligatorio para observar un registro.");
      return;
    }

    setEnviando(true);
    const res = await fetch(`/api/zafarrancho/${seleccionado.id}/revision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comentario }),
    });
    const json = await res.json();
    setEnviando(false);

    if (!res.ok) {
      setError(json?.error?.fieldErrors?.comentario?.[0] ?? json?.error ?? "No se pudo guardar la revisión.");
      return;
    }

    setSeleccionado(null);
    cargar();
  }

  return (
    <main className="mx-auto max-w-5xl flex-1 px-6 py-10">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← Inicio
      </Link>
      <h1 className="mt-2 mb-6 text-xl font-semibold">Tierra — Revisión de registros PE-01</h1>

      <div className="mb-4 flex gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`rounded px-3 py-1 text-sm ${
              filtro === f.value ? "bg-blue-700 text-white" : "bg-white text-neutral-700 border border-neutral-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          {loading && <p className="text-sm text-neutral-500">Cargando…</p>}
          {!loading && ejercicios.length === 0 && (
            <p className="text-sm text-neutral-500">No hay registros en este filtro.</p>
          )}
          {ejercicios.map((ej) => (
            <button
              key={ej.id}
              onClick={() => seleccionar(ej)}
              className={`block w-full rounded border p-3 text-left text-sm shadow-sm ${
                seleccionado?.id === ej.id ? "border-blue-600 bg-blue-50" : "border-neutral-200 bg-white"
              }`}
            >
              <p className="font-medium">
                {ej.tipoZafarrancho.nombre} — {new Date(ej.fecha).toLocaleDateString("es-AR")} {ej.hora}
              </p>
              <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${ESTADO_BADGE[ej.estado]}`}>
                {ESTADO_LABEL[ej.estado as keyof typeof ESTADO_LABEL]}
              </span>
              <p className="mt-1 text-xs text-neutral-500">{ej.participantes.length} participante(s)</p>
            </button>
          ))}
        </div>

        <div>
          {!seleccionado && <p className="text-sm text-neutral-500">Elegí un registro para ver el detalle.</p>}
          {seleccionado && (
            <div className="rounded border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">{seleccionado.tipoZafarrancho.nombre}</h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-neutral-500">Fecha</dt>
                <dd>{new Date(seleccionado.fecha).toLocaleDateString("es-AR")} {seleccionado.hora}</dd>
                <dt className="text-neutral-500">Marea / Singladura</dt>
                <dd>{seleccionado.marea || "—"} / {seleccionado.singladura || "—"}</dd>
                <dt className="text-neutral-500">Foja libro navegación</dt>
                <dd>{seleccionado.libroNavegacionFoja || "—"}</dd>
                <dt className="text-neutral-500">Cargado por</dt>
                <dd>{seleccionado.creadoPor?.nombre ?? "—"}</dd>
              </dl>

              <p className="mt-3 text-sm font-medium text-neutral-700">Temas desarrollados</p>
              <p className="text-sm text-neutral-800 whitespace-pre-wrap">{seleccionado.temasDesarrollados}</p>

              {seleccionado.observaciones && (
                <>
                  <p className="mt-3 text-sm font-medium text-neutral-700">Observaciones</p>
                  <p className="text-sm text-neutral-800 whitespace-pre-wrap">{seleccionado.observaciones}</p>
                </>
              )}

              <p className="mt-3 text-sm font-medium text-neutral-700">
                Participantes ({seleccionado.participantes.length})
              </p>
              <ul className="text-sm text-neutral-800">
                {seleccionado.participantes.map((p) => (
                  <li key={p.id}>
                    {p.puesto} — DNI {p.dni} {p.firma ? "✓ firmado" : "(sin firma)"}
                  </li>
                ))}
              </ul>

              {seleccionado.firmaCapitan && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-neutral-700">Firma del Capitán</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={seleccionado.firmaCapitan} alt="Firma del capitán" className="h-20" />
                </div>
              )}

              {seleccionado.revisiones.length > 0 && (
                <div className="mt-4 border-t border-neutral-200 pt-3">
                  <p className="text-sm font-medium text-neutral-700">Historial de revisión</p>
                  <ul className="mt-1 space-y-1 text-xs text-neutral-600">
                    {seleccionado.revisiones.map((r) => (
                      <li key={r.id}>
                        {new Date(r.revisadoAt).toLocaleString("es-AR")} — {r.revisadoPor}: {r.decision}
                        {r.comentario ? ` (${r.comentario})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {seleccionado.estado === "pendiente_revision" && (
                <form onSubmit={enviarRevision} className="mt-4 space-y-3 border-t border-neutral-200 pt-4">
                  <label className="block text-sm">
                    Decisión
                    <select
                      value={decision}
                      onChange={(e) => setDecision(e.target.value as "aprobado" | "observado")}
                      className="mt-1 w-full rounded border border-neutral-300 p-2"
                    >
                      <option value="aprobado">Aprobar</option>
                      <option value="observado">Observar</option>
                    </select>
                  </label>

                  <label className="block text-sm">
                    Comentario {decision === "observado" && <span className="text-red-600">(obligatorio)</span>}
                    <textarea
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded border border-neutral-300 p-2"
                    />
                  </label>


                  {error && <p className="text-sm text-red-700">{error}</p>}

                  <button
                    type="submit"
                    disabled={enviando}
                    className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {enviando ? "Guardando…" : "Guardar revisión"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
