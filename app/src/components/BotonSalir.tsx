"use client";

import { useState } from "react";

export function BotonSalir() {
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    await fetch("/api/auth/logout", { method: "POST" });
    // Recarga completa a propósito: todo el árbol renderizado en servidor
    // (incluida la cabecera del layout raíz) depende de la cookie de sesión, y
    // `router.push` reutiliza el layout ya cacheado, dejando la cabecera del
    // usuario que acaba de salir. Un cambio de sesión invalida todo el árbol.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ver comentario
    window.location.href = "/login";
  }

  return (
    <button
      onClick={salir}
      disabled={saliendo}
      className="text-xs text-neutral-600 underline disabled:opacity-50"
    >
      {saliendo ? "Saliendo…" : "Salir"}
    </button>
  );
}
