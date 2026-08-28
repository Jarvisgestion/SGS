# SGS — Plataforma de Sistema de Gestión de Seguridad

Digitalización del Sistema de Gestión de Seguridad (Ord. PNA 05/18) de empresas
pesqueras: carga de registros a bordo, firma, revisión desde tierra y control de
cumplimiento, con el catálogo de procedimientos y formularios configurable por
empresa.

## Estado

| Pieza | Dónde | Estado |
|---|---|---|
| Relevamiento de un MGS real (Chiarmar) | `docs/01-catalogo-registros-chiarmar.md` | Hecho |
| Modelo de datos genérico | `docs/02-modelo-de-datos.md` | Hecho |
| Esquema PostgreSQL + migraciones | `db/`, `docs/03-esquema-sql.md` | Hecho, con aserciones |
| API HTTP | `api/` | Ciclo de registro completo; ABM de catálogo pendiente |
| Cliente a bordo y de tierra | `client/` | Carga sin señal, firma, revisión y tablero |
| Prueba del circuito completo | `e2e/` | En navegador real, sobre la base real |
| Catálogo real de Xeitosiño / Pesantar | — | Pendiente del relevamiento |

## Puesta en marcha

```bash
createdb sgs_dev
PGDATABASE=sgs_dev ./scripts/db-apply.sh --with-seed

cd api && npm install && cp .env.example .env   # completar SGS_SESSION_SECRET
npm start

cd ../client && npm install && npm run dev      # http://localhost:5173
```

## Verificación

```bash
./scripts/db-test.sh          # aserciones del esquema sobre una base descartable
cd api    && npm test         # ciclo del registro contra la base real
cd client && npm test         # formularios dinámicos y sincronización
cd e2e    && npm test         # circuito completo en un navegador real
```

`e2e/` levanta la base, la API y la app, y recorre el circuito entero: el
capitán carga un incendio, lo firma con trazo y PIN, lo envía; tierra lo
observa; vuelve a bordo con la observación; se corrige, se reenvía y se aprueba.
También verifica que el formulario se pueda completar sin señal y que el
borrador sobreviva a reabrir la app.

## Criterio de diseño

Las reglas del dominio viven en la base de datos, no en el código de la
aplicación: aislamiento entre empresas, validación del formulario contra su
versión congelada, quién puede emitir y quién revisar, registro aprobado de
sólo lectura, y firmas y revisiones que no se pueden borrar. El detalle está en
`docs/03-esquema-sql.md`.

Nada del dominio de una empresa concreta está en el código: los procedimientos
y formularios son datos. El catálogo de Chiarmar que trae el seed es una
demostración para probar que el esquema aguanta los formularios difíciles — no
es el catálogo de ningún cliente.
