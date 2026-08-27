"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ESTADO_LABEL,
  TIPO_CHECKLIST_BOTE_LABEL,
  type BoteRescateCompleto,
  type Estado,
} from "@/lib/types";

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

export default function TierraBoteRescatePage() {
  const [filtro, setFiltro] = useState<Estado | "todos">("pendiente_revision");
  const [controles, setControles] = useState<BoteRescateCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [seleccionado, setSeleccionado] = useState<BoteRescateCompleto | null>(null);

  const [decision, setDecision] = useState<"aprobado" | "observado">("aprobado");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    const qs = filtro === "todos" ? "" : `?estado=${filtro}`;
    const res = await fetch(`/api/bote-rescate${qs}`);
    const json = await res.json();
    setControles(json.data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recarga al cambiar el filtro
    cargar();
    setSeleccionado(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  const grupos = useMemo(() => {
    if (!seleccionado) return {};
    const out: Record<string, BoteRescateCompleto["checklistRegistros"]> = {};
    for (const r of seleccionado.checklistRegistros) {
      (out[r.checklistConfig.tipo] ??= []).push(r);
    }
    for (const arr of Object.values(out)) {
      arr.sort((a, b) => a.checklistConfig.orden - b.checklistConfig.orden);
    }
    return out;
  }, [seleccionado]);

  async function enviarRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!seleccionado) return;
    setError(null);

    if (decision === "observado" && !comentario.trim()) {
      setError("El comentario es obligatorio para observar un control.");
      return;
    }

    setEnviando(true);
    const res = await fetch(`/api/bote-rescate/${seleccionado.id}/revision`, {
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
      <h1 className="mt-2 mb-6 text-xl font-semibold">Tierra — Control del bote de rescate (RE-01 F)</h1>

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
          {!loading && controles.length === 0 && (
            <p className="text-sm text-neutral-500">No hay controles en este filtro.</p>
          )}
          {controles.map((c) => {
            const noOk = c.checklistRegistros.filter((r) => r.estado === "NO_OK").length;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSeleccionado(c);
                  setDecision("aprobado");
                  setComentario("");
                  setError(null);
                }}
                className={`block w-full rounded border p-3 text-left text-sm shadow-sm ${
                  seleccionado?.id === c.id ? "border-blue-600 bg-blue-50" : "border-neutral-200 bg-white"
                }`}
              >
                <p className="font-medium">{new Date(c.fechaHora).toLocaleString("es-AR")}</p>
                <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${ESTADO_BADGE[c.estado]}`}>
                  {ESTADO_LABEL[c.estado as keyof typeof ESTADO_LABEL]}
                </span>
                {noOk > 0 && (
                  <p className="mt-1 text-xs font-semibold text-red-700">{noOk} ítem(s) no conforme(s)</p>
                )}
              </button>
            );
          })}
        </div>

        <div>
          {!seleccionado && <p className="text-sm text-neutral-500">Elegí un control para ver el detalle.</p>}
          {seleccionado && (
            <div className="rounded border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">{new Date(seleccionado.fechaHora).toLocaleString("es-AR")}</h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-neutral-500">Cargado por</dt>
                <dd>{seleccionado.creadoPor?.nombre ?? "—"}</dd>
                <dt className="text-neutral-500">Ubicación / posición</dt>
                <dd>{seleccionado.ubicacionPosicion || "—"}</dd>
                <dt className="text-neutral-500">Marea / Singladura</dt>
                <dd>
                  {seleccionado.marea || "—"} / {seleccionado.singladura || "—"}
                </dd>
                <dt className="text-neutral-500">Confirmado por</dt>
                <dd>
                  {seleccionado.confirmadoPor
                    ? `${seleccionado.confirmadoPor.apellidoNombre} (${seleccionado.confirmadoPor.puesto})`
                    : "—"}
                  {seleccionado.confirmadoAt && (
                    <span className="block text-xs text-neutral-500">
                      PIN validado el {new Date(seleccionado.confirmadoAt).toLocaleString("es-AR")}
                    </span>
                  )}
                </dd>
              </dl>

              {Object.entries(grupos).map(([tipo, registros]) => (
                <div key={tipo} className="mt-3">
                  <p className="text-sm font-medium text-neutral-700">
                    {TIPO_CHECKLIST_BOTE_LABEL[tipo] ?? tipo}
                  </p>
                  <ul className="text-sm">
                    {registros.map((r) => (
                      <li
                        key={r.id}
                        className={r.estado === "NO_OK" ? "text-red-700" : "text-neutral-800"}
                      >
                        {r.estado === "NO_OK" ? "✗" : "✓"} {r.checklistConfig.item}
                        {r.checklistConfig.cantidadEsperada != null && (
                          <span className="text-xs text-neutral-500">
                            {" "}
                            (esperado: {r.checklistConfig.cantidadEsperada})
                          </span>
                        )}
                        {r.observacion && <span className="text-xs"> — {r.observacion}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {seleccionado.observaciones && (
                <>
                  <p className="mt-3 text-sm font-medium text-neutral-700">Observaciones generales</p>
                  <p className="text-sm text-neutral-800 whitespace-pre-wrap">{seleccionado.observaciones}</p>
                </>
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
