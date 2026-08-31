# Prototipo de aplicación — qué demuestra y qué falta

Acompaña al código de `app/`. La puesta en marcha y el detalle técnico están en
`app/README.md`; acá va lo que el prototipo **prueba** sobre el modelo, y lo que
quedó sin resolver.

Stack: Node 20+ con TypeScript y PostgreSQL, sin ORM. El cliente es JavaScript de
módulos ES, sin framework ni compilación. Esa elección es del prototipo, no del
producto: la API es el contrato, y un frontend React puede reemplazar al cliente de
referencia sin tocar el backend.

## 1. Lo que quedó demostrado

### El catálogo dinámico funciona de punta a punta

`public/form.js` no menciona ni un código de registro. Recibe el `field_schema` del
catálogo de la empresa y arma el formulario: texto, número, fechas, selección,
casillas, checklists, **tablas de filas dinámicas**, bloques de firma y referencias
a la matriz de riesgo o a usuarios.

La consecuencia práctica: cuando Xeitosiño cargue un formulario que Chiarmar no
tenía, la aplicación ya lo sabe mostrar. No hay despliegue de por medio.

Lo mismo con los registros que disparan otros: un campo booleano marcado con
`triggers_record_type` (por ejemplo "hubo heridos" en un incendio) hace que la
interfaz ofrezca crear el RO-07A enlazado. Esa regla vive en el catálogo, no en el
código.

### Las reglas se hacen cumplir una sola vez

La API no repite ninguna validación del esquema. Traduce los errores de Postgres a
códigos HTTP y pasa el mensaje tal cual, porque los mensajes del esquema ya están
escritos para que los lea una persona. Verificado en `app/scripts/smoke.js`:

| Intento | Respuesta |
|---|---|
| El guardia crea un RE-01D | 403 — no tiene rol habilitado |
| Se manda un campo ajeno al formulario | 422 — no existe en el field_schema |
| Se envía a revisión sin los obligatorios | 422 — nombra cuáles faltan |
| El capitán aprueba su propio registro | 403 — no tiene rol de revisor |
| Se observa sin escribir el motivo | 422 |
| Se edita un registro ya aprobado | 422 |
| Se reenvía el mismo `client_uuid` | 409 — no se duplica |

Si mañana el backend se reescribe en Python, esas reglas siguen valiendo.

### El aislamiento entre empresas no depende del backend

Ninguna consulta de la aplicación filtra por `company_id`. Toda lectura y escritura
pasa por `withTenant()`, que abre la transacción fijando la empresa y el usuario, y
RLS hace el resto. Un `SELECT` mal escrito no filtra datos de otra empresa: no
devuelve nada.

## 2. Lo que apareció al construirlo

**El login no funcionaba, y estaba bien que no funcionara.** Buscar un usuario por
correo ocurre *antes* de saber a qué empresa pertenece, así que RLS lo dejaba
invisible. Se resolvió con dos funciones `SECURITY DEFINER` acotadas
(`sgs_auth_by_email`, `sgs_auth_by_id`, migración `0008`) que devuelven el mínimo
necesario para autenticar. La puerta de entrada quedó explícita y auditable, en vez
de diluida en permisos amplios.

Nota de endurecimiento: esas funciones quedan a nombre del dueño del esquema. En
producción conviene que ese dueño sea un rol dedicado sin superusuario.

**Preseleccionar el buque no es un detalle cosmético.** El selector arrancaba vacío
y el capitán descubría que faltaba elegirlo recién al recibir un error del servidor.
En una tablet, en el puente, con mala señal, eso es una funcionalidad rota. Ahora se
preselecciona.

## 3. Lo que falta

1. **Administración del catálogo.** Hoy los tipos de registro se cargan por SQL. La
   plataforma necesita una pantalla para que una empresa defina y versione sus
   propios formularios; es lo que vuelve al producto vendible sin nosotros en el
   medio. Es el desarrollo más grande que queda.
2. **`signature_requirement` no se hace cumplir.** Nada impide aprobar un registro
   al que le falta una firma exigida. Depende de qué evidencia acepta PNA.
3. **Adjuntos.** La tabla `attachments` existe; la carga de archivos no está hecha.
   Hace falta decidir dónde se guardan (disco, S3) y con qué retención.
4. **Asesores externos multi-empresa.** El modelo los soporta; falta la pantalla
   para elegir empresa activa. Hoy la API los rechaza con un mensaje explícito.
5. **Impresión / exportación a PDF.** Ante una inspección hay que poder mostrar el
   registro con su formato de formulario, sus firmas y su historial. No está hecho
   y es requisito, no adorno.
6. **Offline de verdad.** Hay borradores locales con reenvío idempotente, que es lo
   que pedía el requisito. Un service worker y una app instalable serían el paso
   siguiente si el uso a bordo lo pide.
7. **Firmas como data URL.** Hoy la imagen va embebida en la columna. En producción
   corresponde subirla a un almacenamiento de objetos y guardar la referencia.
