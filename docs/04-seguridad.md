# Repaso de seguridad

Estado del repaso hecho sobre el código de `api/`, `client/` y `db/`. No es una
auditoría externa: es lo que encontramos mirando el propio trabajo con esa
lente, con lo corregido, lo que queda abierto y lo que decidimos no hacer.

## Corregido

| Qué | Por qué importaba |
|---|---|
| **El login delataba qué cuentas existen.** `verifySecret` devolvía `false` al instante cuando el email no existía, sin derivar la clave. Un email inexistente respondía en 1,7 ms contra 45 ms de uno real. | Permite armar la lista de usuarios de una empresa antes de intentar entrar. Ahora se deriva igual contra una sal de descarte; hay un test que mide los dos tiempos. |
| **El PIN se podía probar a la fuerza.** La ruta de firma no tenía límite de intentos y el PIN es de 4 a 8 dígitos. | Quien consiguiera una sesión ajena podía firmar en nombre de otro probando 10 000 combinaciones. Ahora hay límite por usuario (no por IP: a bordo todos salen por la misma). |
| **El nombre del archivo iba casi tal cual a la cabecera HTTP.** | Se reduce a un conjunto seguro de caracteres en vez de sacarle unos pocos. |
| **`z.coerce.boolean()` hacía `Boolean("false") === true`.** | `?todas_las_revisiones=false` mostraba a bordo los formularios de todas las revisiones, incluidas las superadas. |

## Lo que ya estaba bien y conviene no romper

- **Todas las consultas son parametrizadas.** No hay concatenación de SQL en
  ninguna ruta.
- **Aislamiento entre empresas en dos capas:** las consultas filtran por
  `company_id` y la base lo impone con FKs compuestas `(id, company_id)`. Hay un
  test que recorre todas las rutas de lectura con un usuario de otra empresa y
  verifica que no se filtre nada.
- **Los permisos que importan viven en la base**, no sólo en la API: quién puede
  emitir, revisar, editar el catálogo y mantener la matriz de riesgo. Escribir
  por SQL con un usuario sin el rol también falla.
- **Los adjuntos no son públicos:** se descargan por la API con sesión y
  filtrados por empresa. El tipo se verifica contra los primeros bytes del
  archivo, no contra lo que declara el navegador, y la clave de almacenamiento
  es el hash del contenido (nada de nombres elegidos por quien sube).
- **Firmas, revisiones y bitácora son append-only a nivel de base.**
- **El registro de actividad no guarda la contraseña, el PIN ni el token**, y
  anota quién hizo cada pedido.

## Abierto, con la decisión pendiente

1. **Cualquiera con sesión puede firmar un bloque declarado para otro rol.** La
   firma queda a su nombre, pero nada impide que el Capitán firme el bloque de
   la Persona Designada. No se resolvió porque varios `signer_role` no son
   puestos sino roles del acto de firmar (entrega, recibe, conforme), que nadie
   tiene asignados. Hace falta una definición antes de poner la regla.
2. **Separación de funciones.** Una persona con rol de Capitán y de Persona
   Designada a la vez puede aprobar sus propios registros. Es válido en empresas
   chicas; si no debe serlo, es una regla más en la base.
3. **El token de sesión no se puede revocar.** Es un HMAC con vencimiento: no
   hay lista de sesiones activas, así que cambiar la contraseña no cierra las
   sesiones abiertas. Se cierran todas de golpe rotando `SGS_SESSION_SECRET`.
4. **El token vive en `localStorage`.** Es vulnerable a XSS; hoy lo contiene la
   política de contenido (todo del mismo origen, sin scripts externos). Pasar a
   una cookie `HttpOnly` implica manejar CSRF, y conviene decidirlo junto con el
   proveedor de identidad.
5. **Los borradores del dispositivo son de la aplicación, no del sistema
   operativo.** Se separan por usuario, pero quien tenga el equipo desbloqueado
   puede leerlos con las herramientas del navegador. Para una tablet compartida,
   la protección real es el bloqueo del equipo.
6. **No hay reglas de complejidad de contraseña** más allá de 8 caracteres, ni
   bloqueo de cuenta tras N fallos (sí límite de intentos por minuto).

## Decidido no hacer, por ahora

- **Row Level Security.** El esquema ya tiene `company_id` en todas las tablas
  operativas para poder activarlo, pero hoy la API se conecta con un solo rol de
  base y el filtrado por empresa está cubierto por las FKs compuestas y los
  tests. Tiene sentido si en algún momento se conecta algo más a la base.
- **Cifrado de los adjuntos en reposo.** Corresponde resolverlo en el disco o el
  almacenamiento de objetos, no en la aplicación.
