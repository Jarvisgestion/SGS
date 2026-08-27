"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SignaturePad } from "@/components/SignaturePad";
import {
  ESTADO_LABEL,
  TIPO_EMERGENCIA_LABEL,
  type RegistroEmergenciaCompleto,
  type TipoRegistroEmergencia,
} from "@/lib/types";
import { EXT_FIELDS, TIPOS_EMERGENCIA } from "@/lib/registroEmergenciaFields";

type ExtValues = Record<string, string | boolean>;

function defaultExt(tipo: TipoRegistroEmergencia): ExtValues {
  const values: ExtValues = {};
  for (const f of EXT_FIELDS[tipo]) values[f.key] = f.type === "boolean" ? false : "";
  return values;
}

function extFromRegistro(reg: RegistroEmergenciaCompleto): ExtValues {
  const source =
    reg.extSinGobierno ?? reg.extColision ?? reg.extIncendio ?? reg.extVaradura ?? reg.extRemolque ?? {};
  const values: ExtValues = {};
  for (const f of EXT_FIELDS[reg.tipo as TipoRegistroEmergencia]) {
    const raw = (source as Record<string, unknown>)[f.key];
    if (f.type === "boolean") values[f.key] = Boolean(raw);
    else if (f.type === "date") values[f.key] = raw ? new Date(raw as string).toISOString().slice(0, 10) : "";
    else values[f.key] = (raw as string) ?? "";
  }
  return values;
}

function emptyForm() {
  return {
    marea: "",
    singladura: "",
    fecha: new Date().toISOString().slice(0, 10),
    hora: new Date().toTimeString().slice(0, 5),
    descripcion: "",
    condicionesHidrometeorologicas: "",
    seInformaCompania: false,
    seInformaPna: false,
    huboHeridos: false,
    necesitaRemolque: false,
  };
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente_revision: "bg-amber-100 text-amber-800",
  aprobado: "bg-green-100 text-green-800",
  observado: "bg-red-100 text-red-800",
  borrador: "bg-neutral-100 text-neutral-700",
};

export default function BordoEmergenciaPage() {
  const [registros, setRegistros] = useState<RegistroEmergenciaCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoRegistroEmergencia>("incendio");
  const [form, setForm] = useState(emptyForm());
  const [ext, setExt] = useState<ExtValues>(defaultExt("incendio"));
  const [firmaCapitanPd, setFirmaCapitanPd] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    const res = await fetch("/api/registros-emergencia");
    const json = await res.json();
    setRegistros(json.data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos al montar
    cargar();
  }, []);

  function cambiarTipo(nuevo: TipoRegistroEmergencia) {
    setTipo(nuevo);
    setExt(defaultExt(nuevo));
  }

  function cargarParaEditar(reg: RegistroEmergenciaCompleto) {
    setEditingId(reg.id);
    setTipo(reg.tipo as TipoRegistroEmergencia);
    setForm({
      marea: reg.marea ?? "",
      singladura: reg.singladura ?? "",
      fecha: new Date(reg.fecha).toISOString().slice(0, 10),
      hora: reg.hora,
      descripcion: reg.descripcion,
      condicionesHidrometeorologicas: reg.condicionesHidrometeorologicas ?? "",
      seInformaCompania: reg.seInformaCompania,
      seInformaPna: reg.seInformaPna,
      huboHeridos: reg.huboHeridos,
      necesitaRemolque: reg.necesitaRemolque,
    });
    setExt(extFromRegistro(reg));
    setFirmaCapitanPd(reg.firmaCapitanPd ?? null);
    setErrors([]);
    setOkMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicion() {
    setEditingId(null);
    setForm(emptyForm());
    cambiarTipo("incendio");
    setFirmaCapitanPd(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setOkMessage(null);
    setSubmitting(true);

    const extLimpio: Record<string, string | boolean | null> = {};
    for (const [k, v] of Object.entries(ext)) {
      extLimpio[k] = typeof v === "string" && v.trim() === "" ? null : v;
    }

    const payload = { tipo, ...form, firmaCapitanPd, ext: extLimpio };
    const res = await fetch(
      editingId ? `/api/registros-emergencia/${editingId}` : "/api/registros-emergencia",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      const flat = json?.error?.formErrors
        ? json.error.formErrors.concat(Object.values(json.error.fieldErrors ?? {}).flat())
        : [json?.error ?? "Ocurrió un error al guardar el registro"];
      setErrors(flat as string[]);
      return;
    }

    setOkMessage(
      editingId ? "Registro corregido y reenviado a tierra para revisión." : "Registro enviado a tierra para revisión."
    );
    cancelarEdicion();
    cargar();
  }

  if (loading) {
    return <p className="p-8 text-neutral-500">Cargando…</p>;
  }

  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-10">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← Inicio
      </Link>
      <h1 className="mt-2 mb-6 text-xl font-semibold">RE-01 B/C/D/E/R — Registros de emergencia</h1>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        {editingId && (
          <p className="rounded bg-blue-50 p-2 text-sm text-blue-800">
            Corrigiendo un registro observado por tierra. Al reenviar vuelve a quedar pendiente de revisión.
          </p>
        )}

        <label className="block text-sm">
          Tipo de registro
          <select
            required
            disabled={!!editingId}
            value={tipo}
            onChange={(e) => cambiarTipo(e.target.value as TipoRegistroEmergencia)}
            className="mt-1 w-full rounded border border-neutral-300 p-2 disabled:bg-neutral-100"
          >
            {TIPOS_EMERGENCIA.map((t) => (
              <option key={t} value={t}>
                {TIPO_EMERGENCIA_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Fecha
            <input
              type="date"
              required
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            Hora
            <input
              type="time"
              required
              value={form.hora}
              onChange={(e) => setForm({ ...form, hora: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            Marea
            <input
              value={form.marea}
              onChange={(e) => setForm({ ...form, marea: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            Singladura
            <input
              value={form.singladura}
              onChange={(e) => setForm({ ...form, singladura: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
        </div>

        <label className="block text-sm">
          Descripción del acontecimiento
          <textarea
            required
            rows={3}
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 p-2"
          />
        </label>

        <label className="block text-sm">
          Condiciones hidrometeorológicas
          <input
            value={form.condicionesHidrometeorologicas}
            onChange={(e) => setForm({ ...form, condicionesHidrometeorologicas: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 p-2"
          />
        </label>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ["seInformaCompania", "Se informa a Compañía"],
            ["seInformaPna", "Se informa a PNA"],
            ["huboHeridos", "Hubo heridos"],
            ["necesitaRemolque", "Necesita remolque"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>

        <div className="border-t border-neutral-200 pt-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-800">
            Detalle específico — {TIPO_EMERGENCIA_LABEL[tipo]}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {EXT_FIELDS[tipo].map((f) => (
              <label
                key={f.key}
                className={`block text-sm ${f.type === "boolean" ? "flex items-center gap-2 sm:col-span-1" : ""}`}
              >
                {f.type === "boolean" ? (
                  <>
                    <input
                      type="checkbox"
                      checked={Boolean(ext[f.key])}
                      onChange={(e) => setExt({ ...ext, [f.key]: e.target.checked })}
                    />
                    {f.label}
                  </>
                ) : (
                  <>
                    {f.label}
                    <input
                      type={f.type === "date" ? "date" : "text"}
                      value={(ext[f.key] as string) ?? ""}
                      onChange={(e) => setExt({ ...ext, [f.key]: e.target.value })}
                      className="mt-1 w-full rounded border border-neutral-300 p-2"
                    />
                  </>
                )}
              </label>
            ))}
          </div>
        </div>

        <SignaturePad label="Firma del Capitán / PD" value={firmaCapitanPd} onChange={setFirmaCapitanPd} />

        {errors.length > 0 && (
          <ul className="list-inside list-disc rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}
        {okMessage && (
          <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{okMessage}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Enviando…" : editingId ? "Reenviar a tierra" : "Enviar a tierra"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelarEdicion} className="text-sm text-neutral-600 underline">
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-neutral-800">Registros cargados desde este buque</h2>
        <div className="space-y-2">
          {registros.map((reg) => (
            <div
              key={reg.id}
              className="flex items-center justify-between rounded border border-neutral-200 bg-white p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {TIPO_EMERGENCIA_LABEL[reg.tipo as TipoRegistroEmergencia]} —{" "}
                  {new Date(reg.fecha).toLocaleDateString("es-AR")}
                </p>
                <span className={`inline-block rounded px-2 py-0.5 text-xs ${ESTADO_BADGE[reg.estado]}`}>
                  {ESTADO_LABEL[reg.estado as keyof typeof ESTADO_LABEL]}
                </span>
                {reg.estado === "observado" && reg.revisiones[0]?.comentario && (
                  <p className="mt-1 text-xs text-red-700">Observación: {reg.revisiones[0].comentario}</p>
                )}
              </div>
              {reg.estado === "observado" && (
                <button
                  onClick={() => cargarParaEditar(reg)}
                  className="rounded border border-blue-600 px-3 py-1 text-xs text-blue-700"
                >
                  Corregir y reenviar
                </button>
              )}
            </div>
          ))}
          {registros.length === 0 && <p className="text-sm text-neutral-500">Todavía no hay registros.</p>}
        </div>
      </section>
    </main>
  );
}
