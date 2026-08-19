# Catálogo de registros — MGS "Pesquera Chiarmar S.A." (Rev. 04)

> **Uso de este documento:** este catálogo se releva a partir del manual real de
> Pesquera Chiarmar S.A. (MGS Rev. 04, Ord. PNA 05/18), pero se usa **exclusivamente
> como modelo estructural de referencia**. Las empresas objetivo del desarrollo son
> **Xeitosiño S.A.** y **Pesantar**, cuyos manuales están desactualizados y van a ser
> revisados/reformateados. El objetivo de este relevamiento es identificar los
> *patrones* de registro (qué tipos de formularios existen, qué campos repiten, qué
> firmas y periodicidades tienen) para poder construir un modelo de datos genérico
> (ver `02-modelo-de-datos.md`) que sirva para cualquier compañía, no para clonar el
> contenido de Chiarmar.

## Estructura común a todos los registros

Todos los formularios del manual comparten un encabezado y variantes de pie fijos:

- **Encabezado:** logo empresa, "MGS ORD. PNA 05/18", "SISTEMA DE GESTIÓN DE
  SEGURIDAD", N° de Revisión, Fecha de vigencia, Código/procedimiento, Empresa.
- **Identificación del registro:** Buque, Matrícula, Marea/Singladura, Fecha, Hora
  (variable según el registro).
- **Pie:** una o dos firmas con aclaración (ej. "Entrega/Recibe", "Capitán/PD",
  "Informa/Recibe"), y en varios procedimientos un cuadro **"Historial del
  procedimiento"** (Fecha / Revisión / Descripción / Responsable) que trazabiliza
  cambios del formulario mismo ante PNA.

Esto es clave para el modelo de datos: el encabezado y el pie **no deberían
modelarse como campos propios de cada tipo de registro**, sino como metadatos
comunes de la instancia del registro (empresa, buque, fecha, firmantes), y el
"Historial del procedimiento" corresponde al versionado del *tipo de registro/
procedimiento*, no a cada instancia cargada.

## Códigos del SGS (prefijos)

| Prefijo | Significado |
|---|---|
| MGS | Manual de Gestión de Seguridad |
| PE | Procedimiento de Emergencias |
| PO | Procedimiento Operativo |
| PM | Procedimiento de Mantenimiento |
| PA | Procedimiento de Auditoría |
| R + (código) | Registro asociado a ese procedimiento (ej. RE, RO, RM, RA, RMGS) |

## 1. Nivel Compañía (RMGS-XX)

| Código | Nombre | Tipo | Firmantes | Periodicidad / disparador | Notas para el modelo |
|---|---|---|---|---|---|
| RMGS-01 | Políticas de la Empresa | Documento maestro | Apoderado | Se actualiza ante cambio de política | Es contenido, no un formulario a completar por tripulación; se referencia desde RO-03A/C/D como "aceptación" |
| RMGS-02 | Cambio de Mando Capitán/Jefe de Máquinas/PD | Formulario evento (2 bloques: saliente/entrante) | Mando saliente + mando entrante | Cada relevo de capitán o jefe de máquinas | Campo "novedades" es texto largo estructurado en dos columnas (Capitán / Jefe de Máquinas) |
| RMGS-03 | Entrega de documentación | Formulario tabular (checklist de qué se entrega) | Entrega + Recibe | Al arribo a puerto | Lista fija de ~18 códigos de documentos con casillero "cantidad"; útil como ejemplo de campo tipo tabla de checkboxes+cantidad |
| RMGS-04 | Flota de Buques y matrículas | Maestro (ficha por buque) | PD (al modificar) | Alta/baja/modificación de flota | Es prácticamente la tabla `vessels`; incluye ficha técnica completa (tipo, eslora, manga, motor, potencia, etc.) |
| RMGS-05 | Verificación de documentación (certificados) | Registro periódico de vencimientos | — | Mensual | Lista fija de ~25 certificados con N°, vencimiento, próxima renovación — candidato a tabla `vessel_certificates` con alertas de vencimiento |
| RMGS-06 | Organigrama y medios de contacto | Maestro | PD | Ante cambio de organigrama | Ficha de personal de tierra por área + tabla de contacto (nombre, teléfono, DNI, mail) |
| RMGS-07 | Nombramiento de PD | Formulario evento | Apoderado | Al designar/cambiar PD | Simple, casi un acta |

## 2. PE-01 — Preparación para Emergencias a Bordo

| Código | Nombre | Tipo | Firmantes | Periodicidad | Notas |
|---|---|---|---|---|---|
| RE-01 A (+ anexo) | Ejercicio de Zafarrancho | Checklist recurrente | Capitán | Variable por tipo: Incendio/Abandono 30 días; Colisión/Varadura/Hombre al agua/Sin gobierno/Espacios confinados 60 días; Buque-Tierra 365 días | El "anexo" es un cronograma anual mensual (12 filas x tipo de ejercicio); el RE-01A en sí es la planilla de asistencia/tema tratado con firma de cada tripulante — **buen caso de "record_type" con recurrencia programada por sub-tipo** |
| RE-01 B | Buque sin Gobierno | Formulario evento | Capitán/PD | Ante el siniestro | Incluye sub-flags booleanos (informa compañía, informa PNA, hubo heridos, necesita remolque) que **disparan la creación de otros registros** (RO-07A, RE-01R) — patrón de "registro que engancha otro registro" |
| RE-01 C | Colisión | Formulario evento | Capitán/PD | Ante el siniestro | Igual patrón de flags condicionales |
| RE-01 D | Incendio | Formulario evento (con checklist de medidas + elementos usados) | Capitán/PD | Ante el siniestro | Incluye checklist de medidas preventivas tomadas (multi-select) y elementos de lucha contra incendio empleados |
| RE-01 E | Varadura | Formulario evento | Capitán/PD | Ante el siniestro | — |
| RE-01 R | Remolque de emergencia | Formulario evento | Capitán/PD | Ante remolque | Incluye posición geográfica y datos del buque remolcador/remolcado |

## 3. PO-02 — Contratación del Personal

No define registros propios: referencia **RO-09** (entrega EPP) y **RO-03A**
(familiarización), ambos definidos en PO-03/PO-09. Confirma el patrón de que un
mismo `record_type` puede estar asociado conceptualmente a más de un procedimiento.

## 4. PO-03 — Entrenamiento del Personal

| Código | Nombre | Tipo | Firmantes | Periodicidad | Notas |
|---|---|---|---|---|---|
| RO-03 A | Políticas y Familiarización con SGS — Tripulante | Formulario evento + checklist de temas | Tripulante + responsable de familiarizar | Cada embarco nuevo o cambio de puesto | Combina "aceptación de políticas" (firma) + checklist de ~9 temas de familiarización |
| RO-03 B | Registro de Capacitación | Formulario evento | Capacitador + asistentes | Ad hoc | Mencionado pero la planilla específica no se adjuntó en el cuerpo provisto |
| RO-03 C | Políticas y Familiarización — Personal de tierra | Igual a RO-03A, para personal de tierra | Personal de tierra | Al ingresar | Mismo patrón que RO-03A, distinto colectivo |
| RO-03 D | Políticas de la Empresa — Personal Tercerizado | Formulario evento (listado múltiple) | Cada contratista | Cada prestación de servicio a bordo | Es una **lista de N personas** en un mismo registro (nombre, DNI, fecha, firma) — otro caso de campo tipo tabla repetible |

## 5. PM-04 — Mantenimiento del Buque y del Equipo

| Código | Nombre | Tipo | Firmantes | Periodicidad | Notas |
|---|---|---|---|---|---|
| RM-04 A | Pedido de reparaciones y/o mantenimiento — Puente/Cubierta | Formulario tabular | Pedido/Recibido/Conforme (3 firmas) | Al arribo a puerto | Filas: tipo trabajo (rep./mant.), criticidad (crítico/no crítico), descripción |
| RM-04 B | Pedido de Materiales | Formulario tabular (hasta 17 ítems) | Pedido/Recibido/Conforme | Al arribo a puerto | Ítem, cantidad pedida, normal/urgente, descripción, cantidad recibida |
| RM-04 C | Pedido de reparaciones y/o mantenimiento — Máquinas/Técnica | Formulario tabular + contadores | Pedido/Recibido/Conforme | Al arribo a puerto | Incluye combustible/aceite a bordo y horómetros por motor (principal, auxiliares) — variante de RM-04A con más campos numéricos |
| Anexo A (Plan mantenimiento — equipos críticos) | — | Checklist maestro | Jefe de máquinas | Frecuencia definida por equipo | Lista fija de ~20 equipos críticos (VHF, radar, balsas, extintores, etc.) |
| Anexo B (Plan mantenimiento preventivo — motores/equipos varios) | — | Checklist recurrente | Jefe de máquinas / 1er of. máquinas | Mensual | Lista de tareas + frecuencia por equipo crítico y equipo vario |

## 6. PO-05 — Operaciones de a Bordo

| Código | Nombre | Tipo | Firmantes | Periodicidad | Notas |
|---|---|---|---|---|---|
| RO-05 A | Cambio de guardia Puente/Sala de Máquinas | Checklist (8 ítems) | Oficial de guardia | Cada cambio de guardia | — |
| RO-05 B | Controles durante la navegación | Checklist (13 ítems, separados Puente/Máquinas) | Oficial de guardia | Periódico en navegación | — |
| RO-05 C | Controles previos a zarpada y arribo | Checklist (15 ítems) | Capitán | Cada zarpada/arribo | — |
| RO-05 D | Maniobra de atraque/desatraque | Checklist (10 ítems) | Capitán | Cada maniobra | — |
| RO-05 E | Desembarco y trasbordo de tripulantes | Checklist (10 ítems) | Capitán | Cada desembarco/trasbordo | Puede disparar RO-07A si hay acaecimiento médico |
| RO-05 F | Navegación en condiciones climáticas normales/adversas | Checklist (fondeo + navegación + mal tiempo, ~15 ítems) | Capitán | Continuo / ante alerta meteorológico | El más largo y con más sub-secciones |
| RO-05 G | Control de tareas operacionales en alistamiento (carga/descarga) | Checklist (12 ítems, HC vs víveres/agua/captura) | Capitán / empresa prestadora | Cada operación de carga/descarga | — |
| RO-05 R | Controles remolque de emergencia | Checklist (9 ítems) | Capitán | Ante remolque | Vinculado a RE-01R |
| RO-05 Anexo | Registro de desvíos de cualquier checklist RO-05 | Formulario evento (texto libre) | Informa/Recibe | Cuando una lista de comprobación detecta incumplimiento | **Patrón clave**: es un registro "hijo" genérico para cualquier checklist de PO-05 que tuvo un ítem no conforme — sugiere modelar un campo `non_conformities` embebido o un `record_type` de excepción vinculado por FK a la instancia padre |

## 7. PA-06 — Informe de Auditorías, Revisiones y NNC

| Código | Nombre | Tipo | Firmantes | Periodicidad | Notas |
|---|---|---|---|---|---|
| RA-06 A | Auditoría Interna | Formulario largo (texto libre + presentes) | Autoridades presentes + auditores | ≤ 12 meses por sector/buque | — |
| RA-06 B | Informe de Revisión Anual del SGS | Formulario largo con checklist de cumplimiento por cada procedimiento (PE-01...PO-10) | Responsables | ≤ 12 meses | Contiene una tabla "Sí/No" de eficacia por cada procedimiento del manual — es literalmente un review del propio catálogo de procedimientos |
| RA-06 C | Monitoreo y Control del SGS | Checklist de verificación de qué otros registros están al día (ok/no ok) por área técnica y por PD | Área técnica + PD | Mensual | **Meta-registro**: verifica el estado de otros registros (RMGS-02, RM-04, RA-06A/B, RE-01A, RO-03A/B, RO-07A, RO-09, etc.) — en el modelo esto es casi una vista/reporte más que un formulario nuevo |
| RA-06 NNC (RNNC) | Nota de No Conformidad | Formulario evento (texto libre) | Emisor | Ante hallazgo de incumplimiento | Emisores habilitados: Apoderado, Técnica, Armamento, PD, Capitán, Auditores — el modelo debe permitir restringir qué `role` puede crear este `record_type` |

## 8. PO-07 — Investigación de Accidentes/Incidentes

| Código | Nombre | Tipo | Firmantes | Periodicidad | Notas |
|---|---|---|---|---|---|
| RO-07 A | Acaecimiento Médico / Investigación de accidentes | Formulario evento + referencia a matriz de riesgo (PO-08) + plan de medidas correctivas (tabla) | Capitán/Oficiales/PD/Armamento | Ante el hecho | Combina datos del tripulante, síntomas, evaluación de riesgo (referencia a un "Cuadro N°" de PO-08) y tabla de medidas correctivas con responsable y plazo |
| RO-07 B/C | Accidentes y cuasi accidentes (al buque, a terceros, al medioambiente) | Formulario evento con checkboxes de tipo de acontecimiento | Responsable | Ante el hecho | Nota: el manual usa "RO-07 B" en el cuerpo del PO-07 y el encabezado real del formulario dice "RO 07 C" — **inconsistencia del documento original**, a resolver al definir el catálogo real de cada empresa, no replicar el error |

## 9. PO-08 — Análisis de Riesgo

| Código | Nombre | Tipo | Firmantes | Periodicidad | Notas |
|---|---|---|---|---|---|
| PO-08 Anexo | Matriz de Evaluación de Riesgos | Documento maestro (no se completa por evento) | Responsable de Seguridad e Higiene | Ante cambio en la operatoria de un puesto | ~20 "Cuadros" (uno por factor de riesgo) con columnas fijas: puesto de trabajo, fuente generadora, valoración (probabilidad × consecuencia), medidas de control, responsable, fecha finalización, valoración residual. Es el **origen de la matriz de riesgo** que referencian RE-01, RO-07A, PO-10, etc. |
| RO-08 | Registro de análisis y mitigación de Riesgo | Formulario evento, misma estructura que un "Cuadro" de PO-08 Anexo pero para un caso puntual | Responsable de Seguridad e Higiene | Ad hoc | Es la versión "instancia" de la matriz maestra — refuerza la distinción `record_type` maestro vs. `record_instance` evento |

## 10. PO-09 — Compra de Insumos y Materiales / Entrega de EPP

| Código | Nombre | Tipo | Firmantes | Periodicidad | Notas |
|---|---|---|---|---|---|
| RO-09 | Entrega de Elementos de Protección Personal | Formulario tabular (hasta 12 ítems: producto, tipo/modelo, marca, certificación, cantidad, fecha) | Trabajador (recibe) | Por campaña / al asignar EPP | Enlaza con la tabla EPP-por-puesto definida en el cuerpo de PO-09 (casco, guantes, calzado, chaleco, traje de inmersión, etc. por puesto: puente/cubierta/máquinas/cocina) |

## 11. PO-10 — Trabajo Seguro en Buques Inactivos / Retirado de Servicio

| Código | Nombre | Tipo | Firmantes | Periodicidad | Notas |
|---|---|---|---|---|---|
| RO-10 A (Anexo A) | Verificación de condiciones — Buque Inactivo | Checklist | — | Mensual | ok/no ok/n-a por ítem + acciones correctivas con fecha y responsable |
| RO-10 B (Anexo B) | Dotación suficiente de guardia en puerto | Formulario evento | Capitán/Compañía/PD | Cada vez que el buque queda retirado de servicio | Declara período, causa, sector de amarre, dotación asignada |
| RO-10 C (Anexo C) | Verificación de Buque en Puerto | Checklist diario (calendario del mes, 1 fila por día) | Guardia/sereno | Diario mientras el buque está amarrado/retirado de servicio | Fila por día del mes con Sí/No + firma — buen ejemplo de checklist con recurrencia diaria fija |

## Resumen cuantitativo

- **7** registros de nivel compañía (RMGS-01 a RMGS-07), en su mayoría *maestros* más que formularios recurrentes.
- **6** registros de emergencia (RE-01, con 1 checklist recurrente + 5 formularios de evento).
- **4** registros de personal/entrenamiento (RO-03 A-D).
- **5** registros de mantenimiento (RM-04 A/B/C + 2 anexos de plan).
- **9** registros de operaciones a bordo (RO-05 A-G + R + Anexo de desvíos).
- **4** registros de auditoría/NNC (RA-06 A/B/C + NNC).
- **2** registros de accidentes (RO-07 A/B-C).
- **2** registros de riesgo (PO-08 Anexo maestro + RO-08 instancia).
- **1** registro de EPP (RO-09).
- **3** registros de buque inactivo (RO-10 A/B/C).

**Total: ~43 tipos de registro/formulario** distintos en el manual de Chiarmar, sin contar el historial de procedimiento (que es meta-información del propio documento, no un registro operativo).

## Patrones detectados (para el modelo de datos)

1. **Maestros vs. eventos vs. checklists recurrentes vs. checklists diarios/mensuales** — cuatro naturalezas de "registro" que requieren distinto tratamiento de periodicidad y alertas.
2. **Encabezado/pie estandarizado** — se modela una sola vez a nivel de la instancia de registro, no por tipo.
3. **Campos tabulares/repetibles** (RM-04B, RO-03D, RMGS-03, RO-09) — el esquema de cada `record_type` necesita soportar un tipo de campo "tabla" con filas dinámicas.
4. **Registros que disparan otros registros** (RE-01B/C/D/E → RO-07A, RE-01R; checklists RO-05 → RO-05 Anexo ante desvío) — el modelo necesita una relación opcional `related_record_instance_id` o `parent_record_instance_id`.
5. **Multi-firma con roles distintos** (entrega/recibe, saliente/entrante, informa/recibe) — la firma no es 1 a 1 con el registro, sino N firmas con rol.
6. **Referencia cruzada a la matriz de riesgo** (RO-07A, RE-01, PO-10 citan "Cuadro N°" de PO-08 Anexo) — sugiere una tabla de riesgos identificados, referenciable por otros registros.
7. **Emisores restringidos por rol** (NNC solo la puede emitir cierto listado de roles) — el `record_type` debe poder declarar qué roles pueden crear/aprobar instancias.
8. **Meta-registros de control** (RA-06C) que en realidad son reportes sobre el estado de otros registros, no datos nuevos — candidatos a vista/dashboard más que a tabla de datos propia.

Este relevamiento es la base para el modelo de datos genérico descripto en
`02-modelo-de-datos.md`, pensado para que Xeitosiño S.A. y Pesantar puedan cargar
su **propio** catálogo de procedimientos y registros (que no necesariamente
coincidirá en cantidad, código ni campos con el de Chiarmar) sin cambios de
esquema.
