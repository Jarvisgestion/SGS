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
puede abrir un registro nuevo, completarlo, **sacarle una foto** y guardarlo; el
borrador y sus archivos sobreviven a cerrar la app o apagar el equipo. Cuando
vuelve la señal se suben solos, y el archivo se suelta del dispositivo recién
cuando está confirmado en tierra.

**Firmar y enviar exigen conexión**, a propósito: la firma queda del lado del
servidor con su evidencia, y el envío dispara la validación completa contra la
base. Es lo que pedía el requisito original — no perder lo cargado si se corta
la señal a mitad de carga — sin inventar un modo offline con firma diferida.

**Lo que rechaza tierra se muestra tal cual.** La API devuelve el mensaje que
escribió la base ("Falta el campo obligatorio descripcion", "El usuario no tiene
un rol habilitado para emitir RE-01D") y el cliente lo muestra sin reinterpretarlo.
La validación local es sólo para no hacer viajar un formulario que ya se sabe
incompleto.

## La empresa edita su propio manual

Con un rol habilitado (`roles.can_manage_catalog` o `can_manage_risk`) aparece
la solapa **Catálogo**, con lo que ese rol puede editar y nada más:

- **Matriz de riesgo** — los cuadros de PO-08, con su valoración y sus medidas
  de control. Es lo que citan los acaecimientos y los siniestros. La mantiene el
  Responsable de Seguridad e Higiene, que entra sólo a esta solapa.
- **Manual** — revisiones del MGS y sus procedimientos. Poner una revisión en
  vigencia deja la anterior superada, y sus formularios dejan de ofrecerse a
  bordo; los registros ya cargados se siguen leyendo con el suyo.
- **Formularios** — el editor de campos: se agregan, se ordenan y se configuran
  los quince tipos de campo del esquema, con **vista previa** de cómo lo va a
  ver la tripulación. Guardar sube la versión del formulario y congela la
  anterior.
- **Flota** y **Personas** — buques, altas de personal, asignación y cierre de
  roles (que es como se documenta un cambio de mando).

## Decisiones que conviene conocer

- **El borrador se sube al salir del formulario**, no sólo al enviarlo: si no,
  en un equipo que nunca pierde señal lo cargado no llegaba a tierra hasta el
  envío, y quien revisa no veía que el trabajo estaba en curso.
- **Un hecho puede obligar a cargar otro registro.** El formulario lo avisa
  mientras se completa, el registro enviado lo muestra con un botón para
  cargarlo enlazado, y tierra lo ve en el tablero hasta que exista.
- **Los borradores son de cada persona, no del equipo.** IndexedDB es del
  dispositivo: en una tablet compartida a bordo, sin separarlos el borrador del
  capitán le aparecería al siguiente que entre, y al sincronizarlo tierra lo
  rechazaría por rol.
- **Los booleanos arrancan sin contestar**, no en "No". Un registro no puede
  afirmar "no se informó a PNA" porque nadie tocó ese campo.
- **Un registro observado vuelve a bordo como borrador** con sus datos y sus
  firmas: cada bloque admite una sola firma y las firmas no se borran, así que
  la del capitán sigue valiendo sobre el registro corregido. Si PNA exigiera
  volver a firmar tras una corrección, hay que cambiar el esquema (hoy lo impide
  un índice único), no el cliente.
- **La firma se sube como archivo PNG**, igual que cualquier otro adjunto: no
  queda incrustada en el registro.
- **Las fotos también se sacan sin señal.** El archivo queda en el dispositivo
  referenciado como `local:<id>` y se sube junto con el borrador cuando hay
  cobertura; recién ahí se suelta del equipo. Mientras tanto la foto se ve igual,
  con el aviso de que todavía está pendiente.
- **El service worker sólo cachea el armazón de la app.** Los datos viven en
  IndexedDB; `/api` nunca se cachea, para no mostrar un estado viejo como si
  fuera el actual.

## Pendientes

1. **Duplicar una revisión del manual** para no arrancar de cero al crear la
   siguiente.
2. **Elegir buque cuando la persona tiene rol en varios** está resuelto con un
   desplegable; falta el caso del asesor externo que opera varias empresas
   (la API ya lo soporta con `X-Company-Id`).
