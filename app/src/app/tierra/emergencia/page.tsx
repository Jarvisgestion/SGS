"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import {
  ESTADO_LABEL,
  TIPO_EMERGENCIA_LABEL,
  type Estado,
  type RegistroEmergenciaCompleto,
  type TipoRegistroEmergencia,
} from "@/lib/types";
import { EXT_FIELDS } from "@/lib/registroEmergenciaFields";

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

function extDeRegistro(reg: RegistroEmergenciaCompleto) {
  return reg.extSinGobierno ?? reg.extColision ?? reg.extIncendio ?? reg.extVaradura ?? reg.extRemolque ?? {};
}

export default function TierraEmergenciaPage() {
  const [filtro, setFiltro] = useState<Estado | "todos">("pendiente_revision");
  const [registros, setRegistros] = useState<RegistroEmergenciaCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [seleccionado, setSeleccionado] = useState<RegistroEmergenciaCompleto | null>(null);

  const [decision, setDecision] = useState<"aprobado" | "observado">("aprobado");
  const [comentario, setComentario] = useState("");
  const [revisadoPor, setRevisadoPor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    const qs = filtro === "todos" ? "" : `?estado=${filtro}`;
    const res = await fetch(`/api/registros-emergencia${qs}`);
    const json = await res.json();
    setRegistros(json.data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recarga al cambiar el filtro
    cargar();
    setSeleccionado(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  function seleccionar(reg: RegistroEmergenciaCompleto) {
    setSeleccionado(reg);
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
    if (!revisadoPor.trim()) {
      setError("Indicá quién realiza la revisión.");
      return;
    }

    setEnviando(true);
    const res = await fetch(`/api/registros-emergencia/${seleccionado.id}/revision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comentario, revisadoPor }),
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
      <h1 className="mt-2 mb-6 text-xl font-semibold">Tierra — Registros de emergencia (RE-01 B/C/D/E/R)</h1>

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
          {!loading && registros.length === 0 && (
            <p className="text-sm text-neutral-500">No hay registros en este filtro.</p>
          )}
          {registros.map((reg) => (
            <button
              key={reg.id}
              onClick={() => seleccionar(reg)}
              className={`block w-full rounded border p-3 text-left text-sm shadow-sm ${
                seleccionado?.id === reg.id ? "border-blue-600 bg-blue-50" : "border-neutral-200 bg-white"
              }`}
            >
              <p className="font-medium">
                {TIPO_EMERGENCIA_LABEL[reg.tipo as TipoRegistroEmergencia]} —{" "}
                {new Date(reg.fecha).toLocaleDateString("es-AR")} {reg.hora}
              </p>
              <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${ESTADO_BADGE[reg.estado]}`}>
                {ESTADO_LABEL[reg.estado as keyof typeof ESTADO_LABEL]}
              </span>
              {(reg.huboHeridos || reg.necesitaRemolque) && (
                <p className="mt-1 text-xs text-red-600">
                  {reg.huboHeridos ? "Hubo heridos. " : ""}
                  {reg.necesitaRemolque ? "Necesitó remolque." : ""}
                </p>
              )}
            </button>
          ))}
        </div>

        <div>
          {!seleccionado && <p className="text-sm text-neutral-500">Elegí un registro para ver el detalle.</p>}
          {seleccionado && (
            <div className="rounded border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">{TIPO_EMERGENCIA_LABEL[seleccionado.tipo as TipoRegistroEmergencia]}</h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-neutral-500">Fecha</dt>
                <dd>
                  {new Date(seleccionado.fecha).toLocaleDateString("es-AR")} {seleccionado.hora}
                </dd>
                <dt className="text-neutral-500">Marea / Singladura</dt>
                <dd>
                  {seleccionado.marea || "—"} / {seleccionado.singladura || "—"}
                </dd>
                <dt className="text-neutral-500">Condiciones hidrometeorológicas</dt>
                <dd>{seleccionado.condicionesHidrometeorologicas || "—"}</dd>
              </dl>

              <p className="mt-3 text-sm font-medium text-neutral-700">Descripción</p>
              <p className="text-sm text-neutral-800 whitespace-pre-wrap">{seleccionado.descripcion}</p>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                <span>Informa a Compañía: {seleccionado.seInformaCompania ? "Sí" : "No"}</span>
                <span>Informa a PNA: {seleccionado.seInformaPna ? "Sí" : "No"}</span>
                <span className={seleccionado.huboHeridos ? "font-semibold text-red-700" : ""}>
                  Hubo heridos: {seleccionado.huboHeridos ? "Sí" : "No"}
                </span>
                <span className={seleccionado.necesitaRemolque ? "font-semibold text-red-700" : ""}>
                  Necesita remolque: {seleccionado.necesitaRemolque ? "Sí" : "No"}
                </span>
              </div>

              <p className="mt-3 text-sm font-medium text-neutral-700">
                Detalle específico — {TIPO_EMERGENCIA_LABEL[seleccionado.tipo as TipoRegistroEmergencia]}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {EXT_FIELDS[seleccionado.tipo as TipoRegistroEmergencia].map((f) => {
                  const raw = (extDeRegistro(seleccionado) as Record<string, unknown>)[f.key];
                  let value: string;
                  if (f.type === "boolean") value = raw ? "Sí" : "No";
                  else if (raw == null || raw === "") value = "—";
                  // Solo las fechas se recortan (llegan como ISO y se muestra YYYY-MM-DD);
                  // el texto libre se muestra completo — es lo que tierra tiene que revisar.
                  else if (f.type === "date") value = new Date(String(raw)).toLocaleDateString("es-AR");
                  else value = String(raw);
                  return (
                    <Fragment key={f.key}>
                      <dt className="text-neutral-500">{f.label}</dt>
                      <dd>{value}</dd>
                    </Fragment>
                  );
                })}
              </dl>

              {seleccionado.firmaCapitanPd && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-neutral-700">Firma del Capitán / PD</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={seleccionado.firmaCapitanPd} alt="Firma" className="h-20" />
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

                  <label className="block text-sm">
                    Revisado por
                    <input
                      value={revisadoPor}
                      onChange={(e) => setRevisadoPor(e.target.value)}
                      placeholder="Nombre del asesor / Persona Designada"
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
