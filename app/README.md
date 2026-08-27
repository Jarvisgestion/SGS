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

No hay autenticación todavía (ver "Próximos pasos"): las vistas `/bordo` y
`/tierra` son públicas dentro de este MVP piloto.

## Cómo correrlo

```bash
npm install
npm run db:migrate   # crea prisma/dev.db y aplica el schema
npm run db:seed       # carga el buque Pesantar 1, tripulación demo y catálogos de referencia
npm run dev
```

Abrí:
- [http://localhost:3000/bordo/zafarrancho](http://localhost:3000/bordo/zafarrancho) — carga a bordo
- [http://localhost:3000/tierra/zafarrancho](http://localhost:3000/tierra/zafarrancho) — revisión en tierra

Otros comandos útiles:

```bash
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

Ambos flujos están verificados de punta a punta en navegador: alta con
firma → revisión en tierra → observación con comentario → corrección a
bordo → aprobación, con el historial de revisiones completo.

### Decisión de diseño no explícita en la especificación

La especificación (sección 5.3) no define una tabla de revisión para
`zafarrancho_ejercicio`. Se agregó `zafarrancho_revision` (y su equivalente
`registro_emergencia_revision` para B/C/D/E/R) porque, sin ella, cada nueva
revisión pisaría el comentario/decisión anterior — y la sección 2.5 exige
trazabilidad completa de "el historial de idas y vueltas si hubo
observaciones". Queda documentado en `prisma/schema.prisma`.

## Próximos pasos sugeridos

1. **Completar PE-01 con los checklists** (RE-01 F — bote de rescate — y
   PM-04 Anexo A/B), reutilizando el mismo patrón de API + UI. El schema
   (`bote_rescate_control`, `checklist_registro`, `checklist_config`) ya está
   modelado y el catálogo de ítems del Anexo A ya viene en el seed.
   Nota: `checklist_registro` tiene hoy un `registroPadreTipo` /
   `registroPadreId` genérico previendo los padres de PM-04, que todavía no
   tienen tabla de cabecera propia definida en la especificación — conviene
   resolver eso al encarar este paso.
2. **Autenticación y roles reales.** Hoy no hay login: cualquiera puede
   entrar a `/bordo` o `/tierra`. Definir cómo se identifica quién carga y
   quién revisa (afecta `createdBy` / `revisadoPor`, hoy texto libre).
3. **Pantalla de administración de catálogos** (tipos de zafarrancho, ítems
   de checklist, tripulación) — hoy se cargan solo por seed/Prisma Studio.
   Sección 3 de la especificación deja pendiente si este rol lo maneja el
   asesor directamente o hace falta un admin separado.
4. **Migrar a Postgres** en cuanto haya un entorno de despliegue real.
5. Ajustar el catálogo de referencia (`prisma/seed.ts`) con los datos reales
   de Pesantar 1 cuando estén disponibles (REGINAVE actualizado, ordenanza
   PNA vigente, exigencias por eslora +75 m).
