"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SignaturePad } from "@/components/SignaturePad";
import { ESTADO_LABEL, type TipoZafarrancho, type Tripulante, type ZafarranchoEjercicioCompleto } from "@/lib/types";

type ParticipanteForm = {
  tripulanteId: string;
  dni: string;
  puesto: string;
  firma: string | null;
};

const ESTADO_BADGE: Record<string, string> = {
  pendiente_revision: "bg-amber-100 text-amber-800",
  aprobado: "bg-green-100 text-green-800",
  observado: "bg-red-100 text-red-800",
  borrador: "bg-neutral-100 text-neutral-700",
};

function emptyForm() {
  return {
    tipoZafarranchoId: "",
    marea: "",
    singladura: "",
    fecha: new Date().toISOString().slice(0, 10),
    hora: new Date().toTimeString().slice(0, 5),
    temasDesarrollados: "",
    libroNavegacionFoja: "",
    observaciones: "",
  };
}

export default function BordoZafarranchoPage() {
  const [tipos, setTipos] = useState<TipoZafarrancho[]>([]);
  const [tripulantes, setTripulantes] = useState<Tripulante[]>([]);
  const [ejercicios, setEjercicios] = useState<ZafarranchoEjercicioCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm());
  const [firmaCapitan, setFirmaCapitan] = useState<string | null>(null);
  const [participantes, setParticipantes] = useState<ParticipanteForm[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  async function cargarTodo() {
    setLoading(true);
    const [catalogosRes, ejerciciosRes] = await Promise.all([
      fetch("/api/catalogos").then((r) => r.json()),
      fetch("/api/zafarrancho").then((r) => r.json()),
    ]);
    setTipos(catalogosRes.data.tiposZafarrancho);
    setTripulantes(catalogosRes.data.tripulantes);
    setEjercicios(ejerciciosRes.data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos al montar
    cargarTodo();
  }, []);

  const tripulantesDisponibles = useMemo(
    () => tripulantes.filter((t) => !participantes.some((p) => p.tripulanteId === t.id)),
    [tripulantes, participantes]
  );

  function agregarParticipante() {
    const siguiente = tripulantesDisponibles[0];
    if (!siguiente) return;
    setParticipantes((prev) => [
      ...prev,
      { tripulanteId: siguiente.id, dni: siguiente.dni, puesto: siguiente.puesto, firma: null },
    ]);
  }

  function actualizarParticipante(index: number, tripulanteId: string) {
    const t = tripulantes.find((x) => x.id === tripulanteId);
    if (!t) return;
    setParticipantes((prev) =>
      prev.map((p, i) => (i === index ? { tripulanteId: t.id, dni: t.dni, puesto: t.puesto, firma: null } : p))
    );
  }

  function quitarParticipante(index: number) {
    setParticipantes((prev) => prev.filter((_, i) => i !== index));
  }

  function cargarParaEditar(ej: ZafarranchoEjercicioCompleto) {
    setEditingId(ej.id);
    setForm({
      tipoZafarranchoId: ej.tipoZafarranchoId,
      marea: ej.marea ?? "",
      singladura: ej.singladura ?? "",
      fecha: new Date(ej.fecha).toISOString().slice(0, 10),
      hora: ej.hora,
      temasDesarrollados: ej.temasDesarrollados,
      libroNavegacionFoja: ej.libroNavegacionFoja ?? "",
      observaciones: ej.observaciones ?? "",
    });
    setFirmaCapitan(ej.firmaCapitan ?? null);
    setParticipantes(
      ej.participantes.map((p) => ({
        tripulanteId: p.tripulanteId,
        dni: p.dni,
        puesto: p.puesto,
        firma: p.firma ?? null,
      }))
    );
    setErrors([]);
    setOkMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicion() {
    setEditingId(null);
    setForm(emptyForm());
    setFirmaCapitan(null);
    setParticipantes([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setOkMessage(null);

    if (participantes.length === 0) {
      setErrors(["Cargá al menos un participante del zafarrancho."]);
      return;
    }

    setSubmitting(true);
    const payload = { ...form, firmaCapitan, participantes };
    const res = await fetch(editingId ? `/api/zafarrancho/${editingId}` : "/api/zafarrancho", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      const flat = json?.error?.formErrors ? json.error.formErrors.concat(
        Object.values(json.error.fieldErrors ?? {}).flat()
      ) : [json?.error ?? "Ocurrió un error al guardar el registro"];
      setErrors(flat as string[]);
      return;
    }

    setOkMessage(
      editingId
        ? "Registro corregido y reenviado a tierra para revisión."
        : "Registro enviado a tierra para revisión."
    );
    cancelarEdicion();
    cargarTodo();
  }

  if (loading) {
    return <p className="p-8 text-neutral-500">Cargando…</p>;
  }

  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-blue-700 underline">
            ← Inicio
          </Link>
          <h1 className="mt-2 text-xl font-semibold">
            RE-01 A — Registro de Ejercicio de Zafarrancho
          </h1>
        </div>
      </div>

      {tipos.length === 0 && (
        <p className="mb-6 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          No hay tipos de zafarrancho cargados. Corré <code>npm run db:seed</code>.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        {editingId && (
          <p className="rounded bg-blue-50 p-2 text-sm text-blue-800">
            Corrigiendo un registro observado por tierra. Al reenviar vuelve a quedar pendiente de revisión.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Tipo de zafarrancho
            <select
              required
              value={form.tipoZafarranchoId}
              onChange={(e) => setForm({ ...form, tipoZafarranchoId: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            >
              <option value="">Seleccioná…</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} (cada {t.periodicidadDias} días)
                </option>
              ))}
            </select>
          </label>

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

          <label className="block text-sm">
            Foja del libro de navegación
            <input
              value={form.libroNavegacionFoja}
              onChange={(e) => setForm({ ...form, libroNavegacionFoja: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
        </div>

        <label className="block text-sm">
          Temas desarrollados
          <textarea
            required
            rows={3}
            value={form.temasDesarrollados}
            onChange={(e) => setForm({ ...form, temasDesarrollados: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 p-2"
          />
        </label>

        <label className="block text-sm">
          Observaciones
          <textarea
            rows={2}
            value={form.observaciones}
            onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 p-2"
          />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800">Participantes</h2>
            <button
              type="button"
              onClick={agregarParticipante}
              disabled={tripulantesDisponibles.length === 0}
              className="rounded border border-blue-600 px-2 py-1 text-xs text-blue-700 disabled:opacity-40"
            >
              + Agregar tripulante
            </button>
          </div>

          {participantes.length === 0 && (
            <p className="text-sm text-neutral-500">Todavía no agregaste participantes.</p>
          )}

          <div className="space-y-4">
            {participantes.map((p, i) => (
              <div key={i} className="rounded border border-neutral-200 p-3">
                <div className="flex items-center gap-2">
                  <select
                    value={p.tripulanteId}
                    onChange={(e) => actualizarParticipante(i, e.target.value)}
                    className="flex-1 rounded border border-neutral-300 p-2 text-sm"
                  >
                    <option value={p.tripulanteId}>
                      {tripulantes.find((t) => t.id === p.tripulanteId)?.apellidoNombre}
                    </option>
                    {tripulantesDisponibles.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.apellidoNombre}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-neutral-500">{p.puesto} · DNI {p.dni}</span>
                  <button
                    type="button"
                    onClick={() => quitarParticipante(i)}
                    className="text-xs text-red-600 underline"
                  >
                    Quitar
                  </button>
                </div>
                <div className="mt-2">
                  <SignaturePad
                    label="Firma"
                    value={p.firma}
                    onChange={(dataUrl) =>
                      setParticipantes((prev) =>
                        prev.map((pp, ii) => (ii === i ? { ...pp, firma: dataUrl } : pp))
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <SignaturePad label="Firma del Capitán" value={firmaCapitan} onChange={setFirmaCapitan} />

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
          {ejercicios.map((ej) => (
            <div
              key={ej.id}
              className="flex items-center justify-between rounded border border-neutral-200 bg-white p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {ej.tipoZafarrancho.nombre} — {new Date(ej.fecha).toLocaleDateString("es-AR")}
                </p>
                <span className={`inline-block rounded px-2 py-0.5 text-xs ${ESTADO_BADGE[ej.estado]}`}>
                  {ESTADO_LABEL[ej.estado as keyof typeof ESTADO_LABEL]}
                </span>
                {ej.estado === "observado" && ej.revisiones[0]?.comentario && (
                  <p className="mt-1 text-xs text-red-700">Observación: {ej.revisiones[0].comentario}</p>
                )}
              </div>
              {ej.estado === "observado" && (
                <button
                  onClick={() => cargarParaEditar(ej)}
                  className="rounded border border-blue-600 px-3 py-1 text-xs text-blue-700"
                >
                  Corregir y reenviar
                </button>
              )}
            </div>
          ))}
          {ejercicios.length === 0 && <p className="text-sm text-neutral-500">Todavía no hay registros.</p>}
        </div>
      </section>
    </main>
  );
}
