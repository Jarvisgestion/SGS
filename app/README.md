# Plataforma SGS — Pesantar 1 (MVP PE-01)

Prueba de concepto de la plataforma que reemplaza el Manual de Gestión de la
Seguridad (MGS) en papel. Alcance de este MVP: el procedimiento **PE-01
(Preparación para Emergencias a Bordo)**, con el flujo completo de punta a
punta implementado para el **Registro de Ejercicio de Zafarrancho (RE-01 A)**:

```
a bordo (carga + firma) → sincroniza → tierra revisa → aprueba u observa
                                              ↑                  │
                                              └── corrige y reenvía ←┘
```

Ver `docs/especificacion-plataforma-sgs.md` para la especificación funcional
completa (roles, firma electrónica, alcance del MVP, próximos pasos) y
`docs/01-catalogo-registros-chiarmar.md` / `docs/02-modelo-de-datos.md` para
el relevamiento más amplio que sirvió de base.

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind** — un solo proyecto para
  UI y API (Route Handlers), sencillo de desplegar (Vercel u otro hosting
  Node) sin mantener un backend aparte.
- **Prisma 6 + SQLite** en desarrollo (cero setup: un archivo `dev.db`).
  Migrar a **Postgres** para producción es cambiar un `provider` en
  `prisma/schema.prisma` y la `DATABASE_URL` — ver `.env.example`. Postgres
  es la opción recomendada apenas haya un entorno real (Supabase, Neon,
  Railway, etc.), porque además habilita features usadas más adelante
  (arrays, enums nativos).
- **Zod** para validar los payloads de la API.
- **react-signature-canvas** para la firma manuscrita en pantalla.
- **Autenticación propia**, sin librería externa: hashing con `scrypt` del
  módulo `crypto` de Node y sesión con token opaco en base. Ver
  "Autenticación y roles" más abajo.

## Cómo correrlo

```bash
npm install
npm run db:migrate   # crea prisma/dev.db y aplica el schema
npm run db:seed       # carga el buque Pesantar 1, tripulación demo y catálogos de referencia
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). Pide iniciar sesión y
después muestra sólo los registros que corresponden al rol.

**Usuarios de demo** (contraseña `demo1234` en ambos):
`capitan@pesantar.test` (rol *bordo*: carga y firma) y
`asesor@pesantar.test` (rol *tierra*: revisa, aprueba u observa).

**PIN de demo** para confirmar el control del bote de rescate (RE-01 F):
Fernández `1234`, Gómez `2345`, Pérez `3456`, Suárez `4567`. Están en
`prisma/seed.ts` y son sólo para el piloto local — en un entorno real hay que
asignar PIN por tripulante y no sembrar ninguno.

Otros comandos útiles:

```bash
npm test           # tests unitarios (node:test, sin dependencias extra)
npm run db:studio  # explorador visual de la base (Prisma Studio)
npm run lint
npm run build
```

## Qué incluye este MVP

- **Schema completo de la sección 5** de la especificación: `buque`,
  `tripulante`, catálogos configurables (`procedimiento_config`,
  `tipo_zafarrancho`, `checklist_config`), el ejercicio de zafarrancho
  (RE-01 A) y los registros de emergencia B/C/D/E/R con sus tablas de
  extensión — ver `prisma/schema.prisma`.
- **API + UI de punta a punta para RE-01 A** (ejercicio de zafarrancho):
  - `POST /api/zafarrancho` — carga a bordo
  - `GET /api/zafarrancho` — listado (con filtro `?estado=`)
  - `GET /api/zafarrancho/[id]` — detalle
  - `PATCH /api/zafarrancho/[id]` — corrección a bordo tras una observación
  - `POST /api/zafarrancho/[id]/revision` — decisión de tierra (aprobado /
    observado, con comentario obligatorio si observa)
  - `GET /api/catalogos` — tipos de zafarrancho y tripulación activa, para
    poblar los selects del formulario
- **API + UI de punta a punta para RE-01 B/C/D/E/R** (registros de
  emergencia), con los mismos endpoints bajo
  `/api/registros-emergencia`. El formulario a bordo es *tipo-aware*: al
  elegir el tipo (sin gobierno / colisión / incendio / varadura / remolque)
  se muestran únicamente los campos de la tabla de extensión que
  corresponde. El tipo no se puede cambiar al corregir un registro ya
  cargado, para no dejar huérfanos los datos de la extensión anterior.

- **API + UI de punta a punta para RE-01 F** (control del bote de rescate),
  bajo `/api/bote-rescate`. Es el primer registro tipo *checklist*: los
  ítems salen de `checklist_config` (catálogo editable por buque, agrupado
  en inspección exterior / interior / pescante / inventario), se marcan
  OK / No OK con observación por ítem, y tierra ve los no conformes
  destacados.
  A diferencia de los anteriores, **se confirma por PIN y no con firma
  manuscrita**, como pide la sección 4 de la especificación para los
  checklists rutinarios. El PIN se valida contra `Tripulante.pinHash`
  (scrypt, ver `src/lib/pin.ts`) y nunca se persiste ni viaja de vuelta al
  navegador. Corregir un control observado exige volver a confirmarlo con
  PIN: es un acto nuevo, no un arrastre del anterior.

Los tres flujos están verificados de punta a punta en navegador: carga →
revisión en tierra → observación con comentario → corrección a bordo →
aprobación, con el historial de revisiones completo.

## Cumplimiento de zafarranchos (`/cumplimiento`)

Cada tipo de zafarrancho guarda su periodicidad; esta pantalla es lo que le
da sentido a ese dato: por tipo muestra el último ejercicio aprobado, cuándo
vence el próximo y si está al día, por vencer, vencido o sin registros. La
home muestra el conteo, así que al entrar se ve si hay algo pendiente.
Accesible para los dos roles: a bordo para saber qué toca, en tierra para
ver el estado de la flota.

Dos criterios definidos acá, no en la especificación:

- **Sólo cuentan los ejercicios `aprobado`.** Uno cargado y todavía sin
  revisar no es evidencia ante una inspección. Igual se muestran aparte
  ("N esperando revisión de tierra") para no dar por vencido sin más algo
  que ya se hizo.
- **El aviso de "por vencer" salta al 20% restante del período** — 6 días
  para uno de 30, 73 para uno anual. Escala con la periodicidad en vez de
  usar un número fijo que sería inútil en un extremo u otro.

La lógica vive en `src/lib/cumplimiento.ts`, es pura (recibe la fecha "hoy"
por parámetro) y está cubierta por `src/lib/cumplimiento.test.ts`.

## Autenticación y roles (sección 3 de la especificación)

Login con email y contraseña, sesión en cookie `httpOnly` + `sameSite=lax`
con token opaco guardado en base (revocable al salir, no un JWT). Dos roles,
los que define la especificación:

| Rol | Puede |
|---|---|
| `bordo` | Cargar registros, firmar, corregir los observados |
| `tierra` | Revisar (aprobar u observar) y administrar (`/admin`) |

El control es **en capas**, y la capa que importa es la del servidor:

- `src/proxy.ts` sólo mira que exista la cookie, para redirigir al login en
  vez de mostrar una pantalla vacía. Corre en el runtime Edge y no puede
  consultar la base, así que **no** valida la sesión ni el rol.
- Los layouts de `/bordo` y `/tierra` validan sesión y rol contra la base, y
  redirigen si no corresponde — así nadie ve un botón que no puede usar.
- Cada ruta de API llama a `requireUsuario(rol)`. Ésta es la que realmente
  autoriza: ocultar un botón no impide llamar al endpoint a mano.

Quién carga y quién revisa salen de la sesión, nunca del body del request:
si el nombre del revisor viniera del cliente, cualquiera podría firmar una
revisión con el nombre de otro. Las tablas de revisión guardan el nombre
como *snapshot* además del id, para que la auditoría de PNA siga siendo
legible aunque después el usuario cambie de nombre o se dé de baja.

### Alcance y límites de lo que hay hoy

- **El PIN de checklist no es autenticación.** Dice *quién de la tripulación
  da por hecho un control*; la sesión dice *quién está usando la aplicación*.
  Son cosas distintas y conviven a propósito.
- **Rate limit del PIN en memoria del proceso** (`src/lib/rateLimit.ts`): 5
  intentos fallidos y 15 minutos de bloqueo. Alcanza para un despliegue de un
  solo proceso, pero se pierde al reiniciar y no se comparte entre réplicas —
  al escalar hay que moverlo a la base o a Redis.
- **No hay recuperación de contraseña por email.** Si alguien la olvida, la
  restablece un usuario de tierra desde `/admin/usuarios`.

### Decisión de diseño no explícita en la especificación

La especificación (sección 5.3) no define una tabla de revisión para
`zafarrancho_ejercicio`. Se agregó `zafarrancho_revision` (y sus equivalentes
`registro_emergencia_revision` y `bote_rescate_control_revision`) porque, sin
ella, cada nueva revisión pisaría el comentario/decisión anterior — y la
sección 2.5 exige trazabilidad completa de "el historial de idas y vueltas si
hubo observaciones". Queda documentado en `prisma/schema.prisma`.

## Administración (`/admin`)

La especificación (sección 3) deja abierto si los catálogos los administra el
asesor o hace falta un rol aparte. **Para este piloto los administra `tierra`
directamente**: un tercer rol para un buque y dos usuarios es burocracia sin
beneficio. Separarlo después es agregar el rol y cambiar dos condiciones
(el layout de `/admin` y el `requireUsuario` de `/api/admin/*`).

Tres pantallas:

- **Tripulación** — alta, baja y asignación/rotación de PIN.
- **Catálogos** — periodicidad y alta/baja de tipos de zafarrancho, e ítems
  del checklist del bote. Es lo que cumple la promesa de "no hardcodear" de
  la especificación: lo que se edita acá cambia los formularios de a bordo
  sin tocar código.
- **Usuarios** — alta, baja, restablecer contraseña de otro, y cambiar la
  propia (pidiendo la actual).

Dos decisiones que conviene conocer:

- **Nada se borra, se da de baja.** Los registros firmados apuntan a
  tripulantes, tipos de zafarrancho e ítems de checklist. Borrarlos rompería
  la trazabilidad que exige la sección 2.5; `activo=false` los saca de los
  formularios nuevos y deja el historial legible.
- **No se puede dejar la plataforma sin administrador.** Dar de baja o
  cambiarle el rol al último usuario de tierra activo devuelve 409: si no,
  nadie podría volver a entrar a administrar.

Cambiar una contraseña o dar de baja a un usuario cierra sus sesiones
abiertas. El cambio de la contraseña propia conserva la sesión actual y
cierra las demás.

## Reglas de negocio definidas fuera de la especificación

- **Un ítem "No OK" exige observación; uno "OK" la tiene opcional.** Un ítem
  no conforme sin explicación no le sirve a tierra para revisar. Se valida
  en el cliente (nombrando los ítems que faltan) y de nuevo en el servidor
  (`crearBoteRescateSchema`, en `src/lib/validation.ts`).

## Próximos pasos sugeridos

1. **PM-04 Anexo A/B** (los checklists de equipos críticos que PE-01
   referencia). Queda fuera del alcance actual por ser otro procedimiento.
   Dos datos ya relevados para cuando se encare:
   - **Periodicidad: mensual en casi todos los casos.** Es el criterio de
     agrupación de un control de PM-04 (uno por mes, no por marea). Queda
     acá sólo como referencia — no está implementado ni modelado.
   - `checklist_registro` ya tiene un `registroPadreTipo` /
     `registroPadreId` genérico previendo esos padres, y los ítems del
     Anexo A ya vienen en el seed. Falta la tabla de cabecera de PM-04, que
     la especificación todavía no define.
2. **Migrar a Postgres** en cuanto haya un entorno de despliegue real, y
   mover a la base el rate limit del PIN (hoy en memoria del proceso).
3. Ajustar el catálogo de referencia (ahora editable desde `/admin/catalogos`)
   con los datos reales de Pesantar 1 cuando estén disponibles (REGINAVE
   actualizado, ordenanza PNA vigente, exigencias por eslora +75 m).
