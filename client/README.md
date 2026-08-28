# Cliente SGS

Aplicación web para el buque y para tierra. React + TypeScript + Vite, sin
framework de estado ni de ruteo: la app tiene pocas pantallas y la lógica que
importa está en módulos puros, probados aparte.

## Arranque

```bash
cd client && npm install
npm run dev          # http://localhost:5173, con /api hacia la API en :3000
```

```bash
npm test             # lógica de formularios y de sincronización
npm run typecheck
npm run build        # build de producción (es donde corre el service worker)
```

La prueba del circuito completo en un navegador real está en `e2e/`.

## Cómo funciona a bordo

**Ningún formulario está escrito en el código.** La pantalla se arma a partir
del `field_schema` que la empresa definió en su catálogo: si Xeitosiño agrega un
registro nuevo o le cambia un campo, la app lo muestra sin tocar el cliente.
`src/lib/schema.ts` traduce cada tipo de campo a un control y valida lo cargado.

**Se puede cargar sin señal.** Al entrar, la app baja el catálogo *y el
formulario de cada tipo de registro* a IndexedDB. Con eso, fuera de cobertura se
puede abrir un registro nuevo, completarlo y guardarlo; el borrador sobrevive a
cerrar la app o apagar el equipo. Cuando vuelve la señal, los borradores se
suben solos.

**Firmar y enviar exigen conexión**, a propósito: la firma queda del lado del
servidor con su evidencia, y el envío dispara la validación completa contra la
base. Es lo que pedía el requisito original — no perder lo cargado si se corta
la señal a mitad de carga — sin inventar un modo offline con firma diferida.

**Lo que rechaza tierra se muestra tal cual.** La API devuelve el mensaje que
escribió la base ("Falta el campo obligatorio descripcion", "El usuario no tiene
un rol habilitado para emitir RE-01D") y el cliente lo muestra sin reinterpretarlo.
La validación local es sólo para no hacer viajar un formulario que ya se sabe
incompleto.

## Decisiones que conviene conocer

- **Los booleanos arrancan sin contestar**, no en "No". Un registro no puede
  afirmar "no se informó a PNA" porque nadie tocó ese campo.
- **Un registro observado vuelve a bordo como borrador** con sus datos y sus
  firmas: cada bloque admite una sola firma y las firmas no se borran, así que
  la del capitán sigue valiendo sobre el registro corregido. Si PNA exigiera
  volver a firmar tras una corrección, hay que cambiar el esquema (hoy lo impide
  un índice único), no el cliente.
- **La imagen de la firma viaja como data URL** hasta que haya almacenamiento de
  archivos (ver `api/README.md`).
- **El service worker sólo cachea el armazón de la app.** Los datos viven en
  IndexedDB; `/api` nunca se cachea, para no mostrar un estado viejo como si
  fuera el actual.

## Pendientes

1. **Adjuntar fotos** desde la cámara (el campo `file` del esquema todavía no
   tiene control propio en el formulario).
2. **Campos `risk_reference` y `user_reference`**: hoy se editan como texto;
   falta el selector contra la matriz de riesgo y contra la tripulación.
3. **Crear el registro hijo** que dispara otro registro (hoy la app avisa cuál
   corresponde cargar, pero no lo encadena solo).
4. **Elegir buque cuando la persona tiene rol en varios** está resuelto con un
   desplegable; falta el caso del asesor externo que opera varias empresas
   (la API ya lo soporta con `X-Company-Id`).
