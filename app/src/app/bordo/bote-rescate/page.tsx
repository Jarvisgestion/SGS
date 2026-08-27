"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ESTADO_LABEL,
  TIPO_CHECKLIST_BOTE_LABEL,
  type BoteRescateCompleto,
  type ChecklistConfigItem,
} from "@/lib/types";
import { itemNoConformeSinObservacion } from "@/lib/validation";

type Tripulante = { id: string; apellidoNombre: string; puesto: string };
type ItemEstado = { estado: "OK" | "NO_OK"; observacion: string };

const ESTADO_BADGE: Record<string, string> = {
  pendiente_revision: "bg-amber-100 text-amber-800",
  aprobado: "bg-green-100 text-green-800",
  observado: "bg-red-100 text-red-800",
  borrador: "bg-neutral-100 text-neutral-700",
};

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function BordoBoteRescatePage() {
  const [checklist, setChecklist] = useState<ChecklistConfigItem[]>([]);
  const [tripulantes, setTripulantes] = useState<Tripulante[]>([]);
  const [controles, setControles] = useState<BoteRescateCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    marea: "",
    singladura: "",
    fechaHora: nowLocal(),
    ubicacionPosicion: "",
    observaciones: "",
  });
  const [items, setItems] = useState<Record<string, ItemEstado>>({});
  const [confirmadoPorId, setConfirmadoPorId] = useState("");
  const [pin, setPin] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  // Recién después de un intento de envío se marcan en rojo los ítems que
  // faltan: señalarlos mientras se completa el checklist sería ruido.
  const [intentoEnvio, setIntentoEnvio] = useState(false);

  async function cargar() {
    setLoading(true);
    const [cat, ctrl] = await Promise.all([
      fetch("/api/catalogos").then((r) => r.json()),
      fetch("/api/bote-rescate").then((r) => r.json()),
    ]);
    setChecklist(cat.data.checklistBote);
    setTripulantes(cat.data.tripulantes);
    setControles(ctrl.data);
    setItems((prev) =>
      Object.keys(prev).length
        ? prev
        : Object.fromEntries(
            cat.data.checklistBote.map((c: ChecklistConfigItem) => [
              c.id,
              { estado: "OK" as const, observacion: "" },
            ])
          )
    );
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos al montar
    cargar();
  }, []);

  const grupos = useMemo(() => {
    const out: Record<string, ChecklistConfigItem[]> = {};
    for (const c of checklist) (out[c.tipo] ??= []).push(c);
    return out;
  }, [checklist]);

  const hayNoConformes = useMemo(
    () => Object.values(items).some((i) => i.estado === "NO_OK"),
    [items]
  );

  function resetForm() {
    setEditingId(null);
    setForm({
      marea: "",
      singladura: "",
      fechaHora: nowLocal(),
      ubicacionPosicion: "",
      observaciones: "",
    });
    setItems(
      Object.fromEntries(checklist.map((c) => [c.id, { estado: "OK" as const, observacion: "" }]))
    );
    setConfirmadoPorId("");
    setPin("");
    setIntentoEnvio(false);
  }

  function cargarParaEditar(ctrl: BoteRescateCompleto) {
    setEditingId(ctrl.id);
    const d = new Date(ctrl.fechaHora);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setForm({
      marea: ctrl.marea ?? "",
      singladura: ctrl.singladura ?? "",
      fechaHora: d.toISOString().slice(0, 16),
      ubicacionPosicion: ctrl.ubicacionPosicion ?? "",
      observaciones: ctrl.observaciones ?? "",
    });
    const cargados: Record<string, ItemEstado> = Object.fromEntries(
      checklist.map((c) => [c.id, { estado: "OK" as const, observacion: "" }])
    );
    for (const r of ctrl.checklistRegistros) {
      cargados[r.checklistConfigId] = {
        estado: r.estado as "OK" | "NO_OK",
        observacion: r.observacion ?? "",
      };
    }
    setItems(cargados);
    setConfirmadoPorId(ctrl.confirmadoPor?.id ?? "");
    setPin("");
    setErrors([]);
    setOkMessage(null);
    setIntentoEnvio(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setOkMessage(null);
    setIntentoEnvio(true);

    // Todo ítem "No OK" tiene que explicar el desvío. Se valida acá para poder
    // nombrar los ítems concretos; el servidor lo revalida igual.
    const sinObservacion = checklist.filter((c) =>
      itemNoConformeSinObservacion(items[c.id] ?? { estado: "OK", observacion: "" })
    );
    if (sinObservacion.length > 0) {
      setErrors([
        `Falta la observación en ${sinObservacion.length} ítem(s) marcados "No OK": ${sinObservacion
          .map((c) => c.item)
          .join(", ")}.`,
      ]);
      return;
    }

    setSubmitting(true);

    const payload = {
      ...form,
      items: checklist.map((c) => ({
        checklistConfigId: c.id,
        estado: items[c.id]?.estado ?? "OK",
        observacion: items[c.id]?.observacion?.trim() || null,
      })),
      confirmadoPorId,
      pin,
    };

    const res = await fetch(editingId ? `/api/bote-rescate/${editingId}` : "/api/bote-rescate", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      const flat = json?.error?.formErrors
        ? json.error.formErrors.concat(Object.values(json.error.fieldErrors ?? {}).flat())
        : [json?.error ?? "Ocurrió un error al guardar el control"];
      setErrors(flat as string[]);
      setPin("");
      return;
    }

    setOkMessage(
      editingId ? "Control corregido y reenviado a tierra." : "Control enviado a tierra para revisión."
    );
    resetForm();
    cargar();
  }

  if (loading) return <p className="p-8 text-neutral-500">Cargando…</p>;

  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-10">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← Inicio
      </Link>
      <h1 className="mt-2 mb-6 text-xl font-semibold">RE-01 F — Control del bote de rescate</h1>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        {editingId && (
          <p className="rounded bg-blue-50 p-2 text-sm text-blue-800">
            Corrigiendo un control observado por tierra. Hay que volver a confirmarlo con PIN.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Fecha y hora
            <input
              type="datetime-local"
              required
              value={form.fechaHora}
              onChange={(e) => setForm({ ...form, fechaHora: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            Ubicación / posición
            <input
              value={form.ubicacionPosicion}
              onChange={(e) => setForm({ ...form, ubicacionPosicion: e.target.value })}
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

        {Object.entries(grupos).map(([tipo, configs]) => (
          <div key={tipo} className="border-t border-neutral-200 pt-4">
            <h2 className="mb-2 text-sm font-semibold text-neutral-800">
              {TIPO_CHECKLIST_BOTE_LABEL[tipo] ?? tipo}
            </h2>
            <div className="space-y-2">
              {configs.map((c) => {
                const it = items[c.id] ?? { estado: "OK" as const, observacion: "" };
                const faltaObservacion = itemNoConformeSinObservacion(it);
                return (
                  <div
                    key={c.id}
                    className={`rounded border p-2 ${
                      faltaObservacion && intentoEnvio ? "border-red-400 bg-red-50" : "border-neutral-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">
                        {c.item}
                        {c.cantidadEsperada != null && (
                          <span className="ml-1 text-xs text-neutral-500">
                            (esperado: {c.cantidadEsperada})
                          </span>
                        )}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        {(["OK", "NO_OK"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setItems({ ...items, [c.id]: { ...it, estado: v } })}
                            className={`rounded px-2 py-1 text-xs ${
                              it.estado === v
                                ? v === "OK"
                                  ? "bg-green-600 text-white"
                                  : "bg-red-600 text-white"
                                : "border border-neutral-300 text-neutral-600"
                            }`}
                          >
                            {v === "OK" ? "OK" : "No OK"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Siempre visible: en "No OK" es obligatoria, en "OK" opcional. */}
                    <input
                      value={it.observacion}
                      onChange={(e) =>
                        setItems({ ...items, [c.id]: { ...it, observacion: e.target.value } })
                      }
                      placeholder={
                        it.estado === "NO_OK"
                          ? "Observación del ítem no conforme (obligatoria)"
                          : "Observación (opcional)"
                      }
                      aria-invalid={faltaObservacion && intentoEnvio}
                      className={`mt-2 w-full rounded border p-2 text-sm ${
                        it.estado === "NO_OK" ? "border-red-300" : "border-neutral-300"
                      }`}
                    />
                    {faltaObservacion && intentoEnvio && (
                      <p className="mt-1 text-xs text-red-700">
                        Explicá el desvío para poder enviar el control.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <label className="block text-sm">
          Observaciones generales
          <textarea
            rows={2}
            value={form.observaciones}
            onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 p-2"
          />
        </label>

        {hayNoConformes && (
          <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
            Hay ítems no conformes. Tierra los va a ver destacados al revisar el control.
          </p>
        )}

        <div className="border-t border-neutral-200 pt-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-800">Confirmación por PIN</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Confirma
              <select
                required
                value={confirmadoPorId}
                onChange={(e) => setConfirmadoPorId(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 p-2"
              >
                <option value="">Seleccioná…</option>
                {tripulantes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.apellidoNombre} — {t.puesto}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 p-2"
              />
            </label>
          </div>
        </div>

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
            <button type="button" onClick={resetForm} className="text-sm text-neutral-600 underline">
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-neutral-800">Controles cargados</h2>
        <div className="space-y-2">
          {controles.map((c) => {
            const noOk = c.checklistRegistros.filter((r) => r.estado === "NO_OK").length;
            return (
              <div
                key={c.id}
                className="flex items-center justify-between rounded border border-neutral-200 bg-white p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{new Date(c.fechaHora).toLocaleString("es-AR")}</p>
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${ESTADO_BADGE[c.estado]}`}>
                    {ESTADO_LABEL[c.estado as keyof typeof ESTADO_LABEL]}
                  </span>
                  {noOk > 0 && <span className="ml-2 text-xs text-red-700">{noOk} ítem(s) no conforme(s)</span>}
                  {c.estado === "observado" && c.revisiones[0]?.comentario && (
                    <p className="mt-1 text-xs text-red-700">Observación: {c.revisiones[0].comentario}</p>
                  )}
                </div>
                {c.estado === "observado" && (
                  <button
                    onClick={() => cargarParaEditar(c)}
                    className="rounded border border-blue-600 px-3 py-1 text-xs text-blue-700"
                  >
                    Corregir y reenviar
                  </button>
                )}
              </div>
            );
          })}
          {controles.length === 0 && <p className="text-sm text-neutral-500">Todavía no hay controles.</p>}
        </div>
      </section>
    </main>
  );
}
