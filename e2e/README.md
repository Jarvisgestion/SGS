# Pruebas de punta a punta

Levantan la base, la API y la app, y recorren el circuito completo en un
navegador real.

```bash
cd e2e && npm install
npm test
```

Qué cubre:

- **`ciclo.spec.ts`** — el capitán carga un incendio desde el catálogo, marca un
  desvío en el checklist, firma con trazo y PIN y lo envía; tierra lo observa;
  vuelve a bordo con la observación a la vista; se corrige, se reenvía y se
  aprueba. Verifica que el historial conserve las dos decisiones y la firma.
- **Sin señal** — corre contra el build de producción, que es donde está activo
  el service worker: se abre un formulario nuevo fuera de cobertura, se
  completa, se reabre la app todavía sin señal y el borrador sigue ahí; al
  volver la conexión se sube solo.
- **Tablero** — cumplimiento (RA-06C) y certificados vencidos.
- **`capturas.spec.ts`** — no verifica nada: genera las imágenes de `capturas/`.

`setup.ts` crea una base descartable (`sgs_e2e`) con el esquema, el catálogo de
demostración y los usuarios de prueba. Corre antes de levantar la API.
