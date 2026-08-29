# Puesta en producción

La aplicación se despliega como **un solo contenedor**: un proceso Node sirve la
API bajo `/api` y la aplicación en el resto de las rutas. Mismo origen, sin
CORS, y con el service worker funcionando — que es lo que permite seguir
cargando registros sin señal.

Hace falta además **una base PostgreSQL 15 o mayor** y **HTTPS**: sin HTTPS el
service worker no se registra y la app deja de funcionar fuera de cobertura.

## Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | sí | `postgres://usuario:clave@host:5432/base` |
| `SGS_SESSION_SECRET` | sí | Firma de los tokens de sesión, mínimo 32 caracteres (`openssl rand -hex 32`). Cambiarla cierra todas las sesiones abiertas. |
| `SGS_TRUST_PROXY` | detrás de un proxy | `true` para que el IP del cliente sea el real y no el del balanceador. Sin esto, el freno al sondeo de contraseñas no distingue de dónde vienen los intentos. |
| `PORT` | no | 3000 por defecto. |
| `SGS_SESSION_TTL` | no | Duración de la sesión en segundos (12 horas por defecto). |
| `SGS_LOGIN_RATE_LIMIT` | no | Intentos de login por minuto por IP + cuenta (10 por defecto). |
| `SGS_STORAGE_DIR` | no | Carpeta de los adjuntos. En la imagen es `/app/var/attachments`, y **tiene que ser un volumen persistente**. |
| `SGS_MAX_UPLOAD_BYTES` | no | Tamaño máximo de un adjunto (10 MB por defecto). |
| `SGS_CLIENT_DIR` | no | Dónde está el build de la app. En la imagen ya viene resuelto. |

## En un servidor propio

```bash
git clone <repo> && cd SGS
cp .env.example .env      # completar POSTGRES_PASSWORD y SGS_SESSION_SECRET

docker compose up -d --build
```

El contenedor queda escuchando en `127.0.0.1:3000`; adelante va un proxy con
certificado. Con Caddy alcanzan tres líneas:

```
sgs.tuempresa.com {
  reverse_proxy 127.0.0.1:3000
}
```

## En un servicio administrado (Fly, Render, Railway)

Los tres toman el `Dockerfile` tal cual, y el procedimiento es el mismo:

1. Crear una base PostgreSQL administrada y copiar su `DATABASE_URL`.
2. Crear el servicio apuntando a este repositorio, con build por Dockerfile.
3. Cargar las variables de la tabla de arriba, con `SGS_TRUST_PROXY=true`
   (los tres ponen un balanceador adelante).
4. Configurar el chequeo de salud en `GET /health`.

En Fly, `fly launch --no-deploy` genera el `fly.toml`: hay que dejar
`internal_port = 3000` y agregarle el chequeo a `/health`. No dejamos un
`fly.toml` en el repositorio a propósito — cambia con la región y el tamaño de
máquina, y uno equivocado cuesta más tiempo que no tenerlo.

## Los adjuntos necesitan un volumen

Las fotos, las copias de mail y las imágenes de firma se guardan en disco, no
en la base. `docker-compose.yml` ya define el volumen; en un servicio
administrado hay que crearlo y montarlo en `/app/var/attachments` — el disco de
un contenedor es efímero y sin volumen los adjuntos desaparecen en el siguiente
despliegue, con los registros quedando firmados pero sin la evidencia.

Entra en el backup igual que la base: un registro aprobado sin su foto adjunta
está incompleto ante una inspección.

> Para varias instancias corriendo a la vez, un volumen de disco no alcanza: ahí
> hace falta un almacenamiento de objetos (S3 o compatible). La interfaz para
> agregarlo está en `api/src/storage.ts`; hoy hay una sola implementación.

## Las migraciones corren solas

El contenedor aplica las migraciones pendientes al arrancar. Son idempotentes y
verifican el checksum de cada archivo: volver a desplegar la misma versión no
toca la base, y una migración editada después de haber sido aplicada corta el
arranque en vez de dejar la base en un estado incierto.

El seed **no** corre solo. `db/seed/001_platform_roles.sql` es el catálogo base
de roles y hay que aplicarlo una vez; el de Chiarmar es una demostración y no
va en la base de un cliente.

```bash
# base de un cliente real: sólo los roles
docker compose exec -T db psql -U sgs -d sgs < db/seed/001_platform_roles.sql

# entorno de prueba: roles + catálogo de demostración
docker compose exec app node --experimental-strip-types api/src/cli/migrate.ts --seed
```

## El primer usuario

No hay registro público: las personas las da de alta la empresa. El primero se
crea por línea de comandos y de ahí en más todo se administra desde la propia
aplicación.

```bash
docker compose exec app node --experimental-strip-types api/src/cli/credentials.ts \
  --crear --email pd@tuempresa.com --nombre "Nombre Apellido" \
  --password 'una-clave-larga' --pin 4821 --rol persona_designada
```

Ese rol habilita la solapa **Catálogo**, desde donde se cargan el manual, los
formularios, la flota y el resto del personal.

## Antes de ponerlo en manos de un cliente

1. **Backups de la base.** Es el registro que se muestra ante una inspección de
   PNA: si se pierde, no hay sistema que valga. Verificá que los backups
   automáticos estén encendidos y probá una restauración antes de cargar datos
   reales.
2. **Confirmar `signature_requirement` con PNA.** Qué evidencia de firma acepta
   para cada tipo de registro sigue sin definirse; los valores actuales son un
   supuesto nuestro (`docs/03-esquema-sql.md` §6).
3. **Backup del volumen de adjuntos**, junto con el de la base. Son parte del
   mismo registro.
4. **Retención.** Definir cuánto se conserva un registro aprobado y qué pasa al
   dar de baja una empresa.
