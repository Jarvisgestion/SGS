# Piloto PE-01 — alcance, respaldo en papel e impresión

Esta etapa valida el sistema completo —carga a bordo, sincronización, revisión en
tierra, trazabilidad— con **un solo procedimiento: PE-01, Preparación para
Emergencias a Bordo**. Recién con esto probado en uso real se decide si conviene
seguir con la administración del catálogo o con el resto del manual.

## 1. Qué entra y qué queda en pausa

**En el piloto:** los 7 registros de PE-01.

| Código | Registro | Respaldo |
|---|---|---|
| RE-01A | Ejercicio de Zafarrancho | **PDF del formulario firmado, obligatorio** |
| RE-01A-ANEXO | Cronograma anual de ejercicios | Se completa e imprime |
| RE-01B | Buque sin Gobierno | Se completa e imprime |
| RE-01C | Colisión | Se completa e imprime |
| RE-01D | Incendio | Se completa e imprime |
| RE-01E | Varadura | Se completa e imprime |
| RE-01R | Remolque de emergencia | Se completa e imprime |

**En pausa** (desarrollado o decidido, pero fuera de prioridad hasta evaluar el
piloto): los otros 9 procedimientos del catálogo, la administración del catálogo,
la pantalla de empresa activa para asesores multi-empresa, y la decisión del
catálogo semilla para Xeitosiño y Pesantar. Nada se descartó: el catálogo completo
sigue cargado en la base y el código sigue en el repositorio.

El recorte es una variable de entorno, no una migración:

```
PILOT_PROCEDURES=PE-01     # vaciarla vuelve a habilitar todo el catálogo
```

Se aplica al **catálogo** (qué se puede crear) y al **reporte de cumplimiento**
(qué se espera). No se aplica a la bandeja de revisión ni al listado de registros:
esconder trabajo que alguien tiene que revisar sería peor que mostrarlo.

## 2. El respaldo en papel

La firma digital no está habilitada por disposición de PNA. Por eso, la evidencia
válida del zafarrancho es **el formulario en papel completado y firmado a mano**,
escaneado o fotografiado y adjuntado al registro. Los datos cargados en la
plataforma corren en paralelo: sirven para operar, controlar vencimientos y
reportar, pero no acreditan por sí solos.

Consecuencia de diseño, y es la decisión importante de esta etapa: **un RE-01A no
se puede aprobar sin ese adjunto.** Aprobarlo sin él dejaría un registro sin
evidencia válida, que es justamente lo que hay que evitar. Se puede *observar* sin
adjunto — es la forma de pedirlo —, pero no aprobar.

La regla no está en el código: es la columna `record_type_versions
.requires_signed_attachment`, declarada por tipo de registro y por versión. El día
que PNA habilite la firma digital se apaga desde el catálogo, sin migrar el
esquema ni tocar la aplicación.

Qué se hace cumplir, verificado en las pruebas:

- No se aprueba un RE-01A sin un adjunto `kind = formulario_firmado`.
- Una evidencia de otro tipo (una foto suelta) no lo reemplaza.
- Ya aprobado, el respaldo no se puede quitar ni agregar: es parte de la evidencia.
- Se aceptan PDF y fotos (JPEG, PNG, HEIC, WebP), hasta 25 MB.
- De cada archivo se guarda el **SHA-256**: si hay que demostrar que el archivo
  exhibido es el mismo que se subió a bordo, el checksum lo prueba.

## 3. La impresión

Los otros seis registros de PE-01 se completan en el sistema y **se imprimen si PNA
lo requiere**. La vista de impresión reproduce el formulario del manual, no un
volcado de datos:

- Encabezado del MGS: empresa, "MGS Ord. PNA 05/18", N° de revisión, fecha de
  vigencia, procedimiento, código del registro y versión del formulario.
- Identificación: buque, matrícula, marea/singladura, fecha y hora.
- Cuerpo armado desde el mismo `field_schema` con el que se cargó: los checklists
  salen como casillas ☑/☐ y las tablas como tablas, con renglones en blanco de más
  por si hay que completarlas a mano.
- Pie de firmas con la línea, el rol y la aclaración.
- Al pie, la trazabilidad (quién cargó, quién revisó, qué observó) y la leyenda de
  que la firma digital no está habilitada, para que nadie confunda el impreso con
  un documento ya firmado.

Se imprime desde el navegador (Ctrl+P → guardar como PDF). Si más adelante hace
falta generar los PDF en el servidor —para enviarlos por correo o exportar en
lote— es un paso aparte que no cambia esta vista.

## 4. Sobre los campos de RE-01C, RE-01E, RE-01R y el cronograma

El relevamiento (`docs/01`) describe estos cuatro formularios pero no detalla sus
campos. Se derivaron del patrón de RE-01B, que sí está relevado, más los datos
propios de cada caso (el otro buque en una colisión; naturaleza del fondo y estado
de marea en una varadura; buque remolcador o remolcado y posiciones en un
remolque).

**Hay que contrastarlos contra el formulario real antes de usarlos a bordo.** Cada
uno lo dice en su `change_description`, visible en la base:

```sql
SELECT rt.code, rtv.change_description
FROM record_types rt
JOIN record_type_versions rtv ON rtv.id = rt.current_version_id
WHERE rt.code LIKE 'RE-01%';
```

Corregirlos es cargar una versión nueva del formulario; los registros ya cargados
conservan la versión con la que se completaron.

## 5. Limitación conocida que el piloto va a tocar de cerca

El manual fija periodicidad **por tipo de ejercicio**: incendio y abandono cada 30
días; colisión, varadura, hombre al agua, buque sin gobierno y espacios confinados
cada 60; comunicación buque-tierra cada 365. El modelo soporta una sola recurrencia
por tipo de registro, y RE-01A quedó con la más exigente (30 días), así que el
reporte de cumplimiento **va a marcar como vencidos ejercicios de 60 y 365 días
antes de tiempo**.

Es la primera cosa que el uso real va a exponer, y conviene resolverla con el dato
del piloto en la mano. Las dos salidas están en `docs/03`, punto abierto 1.

## 6. Cómo probarlo

```bash
export DATABASE_URL="postgres://usuario@localhost/sgs_dev"
db/scripts/test.sh                                    # 44 reglas del esquema
db/scripts/create-app-role.sh
cd app && npm install && npm run build
DATABASE_URL="postgres://sgs_web@localhost/sgs_dev" node dist/scripts/seed-credenciales.js
DATABASE_URL="postgres://sgs_web@localhost/sgs_dev" SESSION_SECRET=algo npm start
npm run smoke      # 47 comprobaciones de API, incluido el circuito con PDF
npm run ui-check   # 10 pasos de interfaz en un navegador real
```

El circuito que recorren las pruebas es el del piloto: el capitán carga el
zafarrancho y lo envía; el PD intenta aprobarlo y el sistema lo rechaza porque falta
el papel; el capitán adjunta el PDF firmado; el PD descarga exactamente el mismo
archivo y recién ahí aprueba; el registro queda cerrado y su respaldo, inmodificable.
