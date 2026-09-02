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
| `RESET_DEMO_PASSWORD` | opcional, temporal | Reasigna la contraseña de las cuentas `@demo.local` sobre una base que ya tiene datos. Ver abajo. |
| `FORCE_HTTPS` | `true`, opcional | Redirige http a https. Ver la advertencia de abajo antes de activarla. |

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

### Recuperar el acceso cuando la base ya tiene datos

La semilla y su contraseña solo se generan si la base está **vacía**. Si un
despliegue anterior ya la cargó, el arranque no la toca —correcto: no debe pisar
datos— y la contraseña de aquel momento quedó en el log de aquel despliegue.

Para asignar una nueva sin perder nada:

1. Agregar la variable `RESET_DEMO_PASSWORD` con la contraseña deseada.
2. Redesplegar. El log confirma qué cuentas se actualizaron.
3. **Quitar la variable** y volver a desplegar.

Solo reescribe la contraseña y el PIN de las cuatro cuentas `@demo.local`. No
toca registros, adjuntos, revisiones ni ningún otro usuario. Está acotada a esas
cuentas a propósito: así no puede usarse para apropiarse de la cuenta de una
persona real.

El tercer paso importa. Mientras la variable esté puesta, la contraseña se
reescribe en cada despliegue —con lo cual no se puede cambiar desde ningún otro
lado— y queda a la vista de cualquiera que abra la configuración del servicio.

Si el log dice que no encontró ninguna cuenta `@demo.local`, la base tiene datos
de otra procedencia y conviene revisar qué usuarios hay cargados antes de seguir.

### Sobre `FORCE_HTTPS`

Viene apagada a propósito. Railway ya sirve el dominio público por HTTPS, y su
chequeo de salud llega por http sin la cabecera de proxy: si la redirección
estuviera activa, ese chequeo entraría en un bucle y el despliegue quedaría
marcado como caído. La cabecera HSTS, que sí está siempre, cubre el lado del
navegador, que es donde importa. `/api/health` queda exento en cualquier caso.

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

## 6. Qué trae de fábrica en materia de seguridad

- **Aislamiento entre empresas** en el motor de la base, no en el código: la
  aplicación se conecta con un rol que no es dueño de las tablas, y las políticas
  no devuelven ninguna fila sin contexto de empresa.
- **Límite de intentos** de ingreso (10 cada 10 minutos por dirección) y de firma
  por PIN (20). Es un contador en memoria: alcanza para una sola instancia, que es
  lo que el piloto necesita. Con más de una instancia hay que moverlo a la base.
- **Cabeceras**: política de contenido estricta (la aplicación no carga nada de
  terceros), `nosniff`, sin posibilidad de embeberla en otro sitio, y HSTS.
- **Contraseñas y PIN** con scrypt y sal por usuario.
- **Bitácora de auditoría** append-only de cada alta, cambio, firma y revisión.

Lo que todavía **no** tiene, y conviene saberlo:

- **Las sesiones no se pueden revocar.** El token dura 12 horas y vale hasta que
  vence. Si se pierde una tablet a bordo, hoy la única salida es desactivar al
  usuario o rotar `SESSION_SECRET`, que cierra todas las sesiones de todos.
- **No hay segundo factor** ni política de contraseñas.
- **El límite de intentos no distingue usuarios**, solo direcciones de origen.

## 7. Antes de usarlo con datos reales

- **HTTPS**: Railway lo da por defecto en el dominio que asigna.
- **Copias de seguridad**: hay que configurarlas en el servicio PostgreSQL. Los
  registros aprobados son evidencia ante PNA; perderlos no es una molestia, es un
  problema regulatorio.
- **El volumen es parte de la evidencia**: el respaldo de `/data` importa tanto
  como el de la base. Un registro aprobado sin su PDF firmado queda incompleto.
- **Cambiar las contraseñas de demostración** y dar de alta usuarios reales.
- **`SESSION_SECRET` no se rota sin costo**: cambiarla cierra todas las sesiones
  abiertas.

## 8. Lo que está verificado y lo que no

Se reprodujo el `Dockerfile` paso por paso fuera del contenedor: instalación de
dependencias con `npm ci --omit=dev`, copia del código respetando `.dockerignore`,
compilación, `npm prune` y arranque del árbol resultante contra una base
PostgreSQL creada desde cero. Sobre ese árbol —el mismo que va a quedar dentro de
la imagen— corren las 52 comprobaciones del circuito y los 11 pasos de interfaz.

Lo único que **no** se pudo probar es la construcción de la imagen en sí, porque
el entorno de desarrollo no tiene Docker. Lo que queda sin verificar es la
mecánica de capas de Docker, no el contenido. Si el primer build falla, el log de
Railway va a decir en qué paso, y se corrige.
