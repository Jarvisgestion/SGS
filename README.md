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
| API HTTP | `api/` | Ciclo de registro y ABM del catálogo |
| Cliente a bordo y de tierra | `client/` | Carga sin señal, firma, revisión, tablero y edición del manual |
| Despliegue | `Dockerfile`, `DEPLOY.md` | Un solo contenedor: API y app en el mismo origen |
| Prueba del circuito completo | `e2e/` | En navegador real, sobre la base real |
| Catálogo real de Xeitosiño / Pesantar | — | Pendiente del relevamiento |

## Puesta en marcha

Requiere **PostgreSQL 15 o mayor** (el esquema usa `ON DELETE SET NULL` por
columna) y **Node 22 o mayor**.

```bash
# 1. base de datos, con el catálogo de demostración
createdb sgs_dev
PGDATABASE=sgs_dev ./scripts/db-apply.sh --with-seed

# 2. API
cd api
npm install
cp .env.example .env
#    completar en .env:
#      DATABASE_URL=postgres:///sgs_dev
#      SGS_SESSION_SECRET=$(openssl rand -hex 32)

# 3. usuarios (el seed carga el catálogo, no las personas)
DATABASE_URL=postgres:///sgs_dev npm run credentials -- --crear \
  --email capitan@demo.test --nombre "Juan Pérez" \
  --password 'demo1234' --pin 4821 --rol capitan --buque M-0827

DATABASE_URL=postgres:///sgs_dev npm run credentials -- --crear \
  --email pd@demo.test --nombre "Ana Gómez" \
  --password 'demo1234' --pin 9134 --rol persona_designada

npm start                    # API en :3000

# 4. app
cd ../client
npm install
npm run dev                  # http://localhost:5173
```

Entrando como `capitan@demo.test` se ve la app de a bordo; como `pd@demo.test`,
la bandeja de revisión y el tablero. El PIN es el que se firma en pantalla.

`npm run credentials -- --listar` muestra los usuarios cargados y si tienen
clave y PIN.

## En producción

Se despliega como un solo contenedor: un proceso sirve la API bajo `/api` y la
aplicación en el resto. Los pasos, las variables y lo que falta resolver antes
de ponerlo en manos de un cliente están en [`DEPLOY.md`](DEPLOY.md).

## Verificación

```bash
./scripts/db-test.sh          # aserciones del esquema sobre una base descartable
cd api    && npm test         # ciclo del registro contra la base real
cd client && npm test         # formularios dinámicos y sincronización
cd e2e    && npm test         # circuito completo en un navegador real
```

Las pruebas de punta a punta levantan el mismo proceso que se despliega —API y
app en un solo servicio— así que lo que se verifica es el artefacto real, no una
aproximación de desarrollo.

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
y formularios son datos, y se editan desde la propia plataforma. Hay una prueba
de punta a punta que lo demuestra: la Persona Designada crea un formulario nuevo
desde la pantalla y el capitán lo carga a bordo, sin que cambie una línea de
código. El catálogo de Chiarmar que trae el seed es una demostración para probar
que el esquema aguanta los formularios difíciles — no es el catálogo de ningún
cliente.
