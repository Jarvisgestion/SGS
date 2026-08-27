"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const destino = searchParams.get("destino") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    setEnviando(false);

    if (!res.ok) {
      setError(typeof json?.error === "string" ? json.error : "No se pudo iniciar sesión");
      setPassword("");
      return;
    }

    // Recarga completa a propósito, no `router.push`: el layout raíz lee la
    // sesión en el servidor y el router del cliente conserva el layout previo
    // al login, así que la cabecera con el usuario no aparecería hasta la
    // siguiente recarga. Un cambio de sesión invalida todo el árbol.
    window.location.href = destino;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div>
        <p className="text-sm font-medium text-blue-700">Pesantar 1 — PE-01</p>
        <h1 className="mt-1 text-xl font-semibold">Iniciar sesión</h1>
      </div>

      <label className="block text-sm">
        Email
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 p-2"
        />
      </label>

      <label className="block text-sm">
        Contraseña
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 p-2"
        />
      </label>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {enviando ? "Ingresando…" : "Ingresar"}
      </button>

      <p className="text-xs text-neutral-500">
        Usuarios de demo: <code>capitan@pesantar.test</code> (a bordo) y{" "}
        <code>asesor@pesantar.test</code> (tierra). Contraseña <code>demo1234</code> en ambos.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-1 items-center justify-center px-6 py-16">
      <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
