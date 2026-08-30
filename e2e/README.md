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
- **`catalogo.spec.ts`** — también: la revisión siguiente armada copiando la
  anterior, y el catálogo bajado como archivo y vuelto a cargar. Y la tesis del
  proyecto: la Persona Designada crea un
  procedimiento y un formulario nuevos desde la pantalla (con campo obligatorio,
  lista de opciones y bloque de firma), y el capitán lo carga y lo firma a
  bordo, sin que cambie una línea de código. Después verifica que editar el
  formulario suba la versión sin alterar lo ya cargado.
- **Foto sin señal** — se saca una foto fuera de cobertura, se reabre la app
  todavía sin señal y la foto sigue ahí; al volver la conexión se sube sola.
- **`encadenados.spec.ts`** — un incendio con heridos exige el acaecimiento
  médico: la obligación queda asentada sobre el hecho, se cumple desde ahí
  enlazada, y la cadena se ve desde los dos lados.
- **`impresion.spec.ts`** — carga y aprueba un registro, y genera su PDF
  comprobando que lleve el encabezado del formulario, las firmas y el historial,
  y que no salgan la navegación ni los botones de la aplicación.
- **Tablero** — cumplimiento (RA-06C) y certificados vencidos.
- **`capturas.spec.ts`** — no verifica nada: genera las imágenes de `capturas/`.

`setup.ts` crea una base descartable (`sgs_e2e`) con el esquema, el catálogo de
demostración y los usuarios de prueba. Corre antes de levantar la API.
