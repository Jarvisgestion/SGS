# Despliegue en Railway

El repositorio trae un `Dockerfile` en la raíz. Railway lo detecta solo: no hace
falta configurar comandos de build ni de arranque.

## 1. Lo que hay que crear en Railway

Un proyecto con **dos servicios**:

| Servicio | Qué es |
|---|---|
| PostgreSQL | Base de datos. Railway la ofrece como servicio listo. |
| La aplicación | Desde el repositorio de GitHub. |

**Repositorio:** `Jarvisgestion/SGS`
**Rama:** `claude/session-continuation-00xn6o`

La rama importa: la rama por defecto del repositorio es anterior y solo tiene los
documentos de relevamiento, sin código.

El directorio raíz se deja como viene (la raíz del repositorio), porque el
`Dockerfile` necesita tanto `app/` como `db/`.

## 2. Variables de entorno

En el servicio de la aplicación:

| Variable | Valor | Para qué |
|---|---|---|
| `DATABASE_URL` | referencia a la base del proyecto | Railway la ofrece como variable de referencia al servicio PostgreSQL |
| `SESSION_SECRET` | cadena larga y aleatoria | Firma las sesiones. **Obligatoria**: la aplicación no arranca sin ella. |
| `APP_DB_USER` | `sgs_web` | El rol acotado con el que se conecta la aplicación |
| `APP_DB_PASSWORD` | cadena aleatoria | Contraseña de ese rol |
| `PILOT_PROCEDURES` | `PE-01` | Recorta la carga al piloto. Vaciarla habilita todo el catálogo. |
| `ATTACHMENTS_DIR` | `/data/attachments` | Ya viene puesta en el `Dockerfile` |
| `DEMO_PASSWORD` | opcional | Contraseña de los usuarios de demostración. Si no se define, se genera una al azar y aparece **una sola vez** en el log del primer despliegue. |
| `SEED_DEMO` | `false`, opcional | Impide cargar los datos de demostración en una base vacía |

`PORT` la inyecta Railway y la aplicación la respeta; no hay que definirla.

### Por qué `APP_DB_USER` no es opcional en la práctica

Railway entrega una sola credencial de PostgreSQL, y es la del **dueño** de las
tablas. El dueño saltea Row Level Security, que es lo que impide que una empresa
vea los datos de otra.

El arranque usa esa credencial solo para lo indispensable —aplicar migraciones y
crear el rol `sgs_web`— y después la aplicación se conecta con ese rol acotado,
que sí queda sujeto a las políticas. Si `APP_DB_USER` no está definida, la
aplicación arranca igual pero deja un aviso en el log: sirve para una prueba, no
para datos reales.

## 3. Volumen para los adjuntos

**Hace falta montar un volumen en `/data`.** El sistema de archivos de un
contenedor es efímero: sin volumen, los PDF de los formularios firmados —que son
la evidencia válida ante PNA— se pierden en cada redespliegue.

## 4. Qué pasa en el primer arranque

El contenedor ejecuta `deploy-bootstrap` antes de levantar el servidor. Es
idempotente: corre en cada despliegue y no hace nada si ya está todo.

1. Aplica las migraciones pendientes.
2. Crea el rol `sgs_web` y le da los permisos de `sgs_app`.
3. Si la base está vacía, carga el catálogo de referencia (44 tipos de registro),
   los datos de demostración y las credenciales de los usuarios de prueba.
4. Crea el directorio de adjuntos.

La contraseña de los usuarios de demostración se imprime **una sola vez** en el
log del despliegue. Conviene anotarla.

## 5. Usuarios de prueba

| Correo | Rol | PIN |
|---|---|---|
| `capitan@demo.local` | Capitán | 2345 |
| `pd@demo.local` | Persona Designada | 1234 |
| `jm@demo.local` | Jefe de Máquinas | 3456 |
| `guardia@demo.local` | Guardia de puerto | 4567 |

La empresa que se carga se llama *"Empresa Demo (catálogo de referencia)"* con un
buque *"Demo I"*. Para el piloto real hay que dar de alta la empresa y el buque
verdaderos; se puede hacer con `SEED_DEMO=false` y cargando los datos a mano, o
adaptando `db/seed/02_demo_operacion.sql`.

## 6. Antes de usarlo con datos reales

- **HTTPS**: Railway lo da por defecto en el dominio que asigna.
- **Copias de seguridad**: hay que configurarlas en el servicio PostgreSQL. Los
  registros aprobados son evidencia ante PNA; perderlos no es una molestia, es un
  problema regulatorio.
- **El volumen es parte de la evidencia**: el respaldo de `/data` importa tanto
  como el de la base. Un registro aprobado sin su PDF firmado queda incompleto.
- **Cambiar las contraseñas de demostración** y dar de alta usuarios reales.
- **`SESSION_SECRET` no se rota sin costo**: cambiarla cierra todas las sesiones
  abiertas.

## 7. Lo que no está verificado

El `Dockerfile` se escribió con cuidado y cada paso se probó por separado fuera
del contenedor —instalación de dependencias, compilación, arranque de la base
desde cero, arranque del servidor y las 47 comprobaciones del circuito—, pero **la
construcción de la imagen en sí no se pudo probar**: el entorno de desarrollo no
tiene Docker disponible. Si el primer build falla, el log de Railway va a decir en
qué paso, y se corrige.
