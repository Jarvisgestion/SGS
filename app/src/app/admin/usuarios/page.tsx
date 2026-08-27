"use client";

import { useEffect, useState } from "react";

type Usuario = {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
  tripulanteId: string | null;
};

type Tripulante = { id: string; apellidoNombre: string; puesto: string; activo: boolean };

const ROL_LABEL: Record<string, string> = { bordo: "A bordo", tierra: "Tierra" };

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [tripulantes, setTripulantes] = useState<Tripulante[]>([]);
  const [loading, setLoading] = useState(true);
  const [errores, setErrores] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const [nuevo, setNuevo] = useState({
    email: "",
    nombre: "",
    rol: "bordo",
    password: "",
    tripulanteId: "",
  });
  const [passEditando, setPassEditando] = useState<Record<string, string>>({});

  // Cambio de la contraseña propia
  const [propia, setPropia] = useState({ passwordActual: "", passwordNueva: "" });
  const [avisoPropia, setAvisoPropia] = useState<string | null>(null);
  const [errorPropia, setErrorPropia] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    const [u, t] = await Promise.all([
      fetch("/api/admin/usuarios").then((r) => r.json()),
      fetch("/api/admin/tripulantes").then((r) => r.json()),
    ]);
    setUsuarios(u.data ?? []);
    setTripulantes((t.data ?? []).filter((x: Tripulante) => x.activo));
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

  async function cambiarPropia(e: React.FormEvent) {
    e.preventDefault();
    setErrorPropia(null);
    setAvisoPropia(null);
    const res = await fetch("/api/auth/cambiar-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(propia),
    });
    const json = await res.json();
    if (!res.ok) {
      const e2 = json as { error?: unknown };
      const f = e2.error as { fieldErrors?: Record<string, string[]> } | string;
      setErrorPropia(
        typeof f === "string"
          ? f
          : Object.values(f?.fieldErrors ?? {}).flat()[0] ?? "No se pudo cambiar la contraseña"
      );
      return;
    }
    setPropia({ passwordActual: "", passwordNueva: "" });
    setAvisoPropia("Contraseña cambiada. Se cerraron tus otras sesiones.");
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
        <h2 className="mb-3 text-sm font-semibold text-neutral-800">Usuarios</h2>
        <div className="space-y-2">
          {usuarios.map((u) => (
            <div
              key={u.id}
              className={`rounded border p-3 text-sm ${
                u.activo ? "border-neutral-200 bg-white" : "border-neutral-200 bg-neutral-50 opacity-70"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{u.nombre}</span>
                  <span className="ml-2 text-neutral-500">{u.email}</span>
                  <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {ROL_LABEL[u.rol] ?? u.rol}
                  </span>
                  {!u.activo && (
                    <span className="ml-2 rounded bg-neutral-200 px-2 py-0.5 text-xs">Dado de baja</span>
                  )}
                </div>
                <button
                  onClick={() =>
                    llamar(
                      `/api/admin/usuarios/${u.id}`,
                      "PATCH",
                      { activo: !u.activo },
                      u.activo ? "Usuario dado de baja." : "Usuario reactivado."
                    )
                  }
                  className="rounded border border-neutral-400 px-2 py-1 text-xs text-neutral-700"
                >
                  {u.activo ? "Dar de baja" : "Reactivar"}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Nueva contraseña"
                  value={passEditando[u.id] ?? ""}
                  onChange={(e) => setPassEditando({ ...passEditando, [u.id]: e.target.value })}
                  className="w-48 rounded border border-neutral-300 p-1.5 text-sm"
                />
                <button
                  disabled={!passEditando[u.id]}
                  onClick={() => {
                    llamar(
                      `/api/admin/usuarios/${u.id}`,
                      "PATCH",
                      { password: passEditando[u.id] },
                      `Contraseña restablecida para ${u.nombre}. Se cerraron sus sesiones.`
                    );
                    setPassEditando({ ...passEditando, [u.id]: "" });
                  }}
                  className="rounded border border-blue-600 px-2 py-1 text-xs text-blue-700 disabled:opacity-40"
                >
                  Restablecer contraseña
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-800">Alta de usuario</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            llamar(
              "/api/admin/usuarios",
              "POST",
              { ...nuevo, tripulanteId: nuevo.tripulanteId || null },
              "Usuario creado."
            );
            setNuevo({ email: "", nombre: "", rol: "bordo", password: "", tripulanteId: "" });
          }}
          className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2"
        >
          <label className="block text-sm">
            Email
            <input
              type="email"
              required
              value={nuevo.email}
              onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            Nombre
            <input
              required
              value={nuevo.nombre}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            Rol
            <select
              value={nuevo.rol}
              onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            >
              <option value="bordo">A bordo — carga y firma</option>
              <option value="tierra">Tierra — revisa y administra</option>
            </select>
          </label>
          <label className="block text-sm">
            Contraseña <span className="text-neutral-500">(mínimo 8 caracteres)</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={nuevo.password}
              onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            Tripulante vinculado <span className="text-neutral-500">(opcional)</span>
            <select
              value={nuevo.tripulanteId}
              onChange={(e) => setNuevo({ ...nuevo, tripulanteId: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            >
              <option value="">Sin vincular</option>
              {tripulantes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.apellidoNombre} — {t.puesto}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white">
              Crear usuario
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-800">Cambiar mi contraseña</h2>
        <form
          onSubmit={cambiarPropia}
          className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2"
        >
          <label className="block text-sm">
            Contraseña actual
            <input
              type="password"
              required
              autoComplete="current-password"
              value={propia.passwordActual}
              onChange={(e) => setPropia({ ...propia, passwordActual: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            Contraseña nueva
            <input
              type="password"
              required
              autoComplete="new-password"
              value={propia.passwordNueva}
              onChange={(e) => setPropia({ ...propia, passwordNueva: e.target.value })}
              className="mt-1 w-full rounded border border-neutral-300 p-2"
            />
          </label>
          {errorPropia && (
            <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700 sm:col-span-2">
              {errorPropia}
            </p>
          )}
          {avisoPropia && (
            <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800 sm:col-span-2">
              {avisoPropia}
            </p>
          )}
          <div className="sm:col-span-2">
            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white">
              Cambiar contraseña
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
