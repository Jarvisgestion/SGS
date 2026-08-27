# Especificación funcional — Plataforma SGS digital (Pesantar)

## 1. Contexto y objetivo

Reemplazar el Manual de Gestión de la Seguridad (MGS) en papel de un buque pesquero por una plataforma web. El MVP se enfoca en un solo procedimiento del manual: **PE-01 (Preparación para Emergencias a Bordo)**, incluyendo sus registros asociados (RE-01 A a F y R) y los anexos técnicos (PM 04).

**Empresa:** Pesantar (una sola empresa, sin necesidad de multi-tenant por ahora).
**Buque:** Pesantar 1 — actualmente en construcción, eslora mayor a 75 m.

El modelo de referencia (estructura de registros, campos, periodicidades) se relevó a partir del manual PE-01 de otra empresa del sector (Xeitosiño S.A., Rev. 15) como ejemplo de un MGS real y completo — **no es el manual final de Pesantar**. Antes de cargar los datos definitivos de Pesantar, el usuario va a ajustar la estructura considerando:
- Actualización del REGINAVE
- La eslora del buque (+75 m), que puede traer exigencias normativas adicionales
- Actualización de la ordenanza de PNA vigente (pendiente, el usuario aportará un boceto)
- Un procedimiento de ciberseguridad ampliado (ver sección 8, fuera de alcance del MVP)

Por eso el modelo de datos **debe ser configurable y no hardcodear** los ítems específicos del manual de referencia (tipos de zafarrancho, periodicidades, ítems de checklist) — estos van en tablas de catálogo editables.

## 2. Flujo funcional

1. Un registro (zafarrancho, incendio, colisión, etc.) se completa **a bordo**, típicamente por el Capitán o el Jefe de Máquinas, desde una PC/tablet del buque.
2. El buque tiene conectividad satelital (Starlink) permanente, por lo que **no hace falta un modo offline complejo** — alcanza con guardar el formulario en progreso localmente (borrador) por si se corta la señal momentáneamente, y sincronizar cuando vuelve la conexión.
3. El registro sincroniza a la plataforma central.
4. **En tierra**, el asesor de seguridad (el usuario) o la Persona Designada (PD) revisa el registro y lo marca como:
   - **Aprobado**, o
   - **Observado** (con comentario obligatorio) → vuelve al buque para corrección y se vuelve a enviar.
5. Cada registro mantiene trazabilidad completa: quién lo cargó, cuándo, quién lo revisó, cuándo, y el historial de idas y vueltas si hubo observaciones. Esto es clave para una inspección de Prefectura Naval Argentina (PNA).

## 3. Roles

- **Tripulante / Capitán / Jefe de Máquinas (a bordo):** carga registros, firma.
- **Asesor de seguridad / Persona Designada (en tierra):** revisa, aprueba u observa.
- (A definir en una etapa posterior: si hace falta un rol de administrador para gestionar catálogos — tipos de zafarrancho, ítems de checklist, tripulación — o si eso lo maneja el asesor directamente.)

## 4. Firma electrónica

Dos mecanismos, según el tipo de documento:
- **Firma manuscrita en pantalla** (signature pad tipo canvas): para documentos formales como el Registro de Zafarrancho (RE-01 A), donde se firma cada tripulante presente.
- **Confirmación por PIN/clave:** para checklists rutinarios (ej. verificación de bote de rescate).

*Pendiente de confirmar con PNA:* si aceptan esta evidencia electrónica o exigen firma ológrafa para ciertos registros del MGS. Esto puede condicionar el diseño final, pero no debería bloquear el desarrollo del MVP.

## 5. Modelo de datos

### 5.1 Entidades base

**`buque`**
- id, nombre (ej. "Pesantar 1"), matricula, eslora_metros, estado (en_construccion / operativo / baja), fecha_alta

**`tripulante`** (maestro de tripulación)
- id, buque_id, apellido_nombre, dni, puesto, activo

### 5.2 Catálogos configurables (no hardcodear)

**`procedimiento_config`**
- id, buque_id, codigo (ej. "PE-01"), nombre, revision, fecha_vigencia
- Permite versionar el manual sin tocar el modelo de datos cuando se actualice.

**`tipo_zafarrancho`**
- id, buque_id, codigo, nombre, periodicidad_dias
- Catálogo editable de tipos de zafarrancho y su periodicidad (en el manual de referencia: Incendio y Abandono cada 30 días; Colisión, Varadura, Derrame de Hidrocarburos, Sin Gobierno, Hombre al Agua, Espacios Confinados cada 60 días; Buque-Tierra cada 365 días — estos valores son de referencia, deben poder ajustarse para Pesantar).

**`checklist_config`**
- id, buque_id, tipo (bote_exterior / bote_interior / bote_pescante / bote_inventario / pm04_anexoA / pm04_anexoB / custom), item, cantidad_esperada (nullable), orden
- Catálogo editable de ítems de verificación. Ejemplo de PM 04 Anexo A en el manual de referencia: VHF, BLU, INMARSAT/MOMPESAT, AIS, GPS, teléfono satelital, radar, cabos, cables de acero, luces de navegación. Estos ítems deben poder ampliarse o modificarse por buque, no estar fijos en el código (relevante para cuando se sumen equipos exigidos por eslora +75m o REGINAVE actualizado).

### 5.3 Ejercicio de zafarrancho (RE-01 A)

**`zafarrancho_ejercicio`**
- id, buque_id, tipo_zafarrancho_id (FK), marea, singladura, fecha, hora, temas_desarrollados, libro_navegacion_foja, observaciones, firma_capitan

**`zafarrancho_participante`**
- id, ejercicio_id (FK), tripulante_id (FK), dni, puesto, firma

### 5.4 Registros de emergencia (RE-01 B, C, D, E, R)

**`registro_emergencia`** (tabla base común)
- id, buque_id, tipo (enum: sin_gobierno / colision / incendio / varadura / remolque — categorías normativas estables), marea, singladura, fecha, hora, descripcion, condiciones_hidrometeorologicas, se_informa_compania (bool), se_informa_pna (bool), hubo_heridos (bool), necesita_remolque (bool), firma_capitan_pd

Extensiones específicas por tipo (FK a `registro_emergencia`):

- **`ext_sin_gobierno`** (RE-01 B): buque_remolque, matricula_remolque, hora_inicio, duracion_estimada, fecha_ultimo_control_anexoAB
- **`ext_colision`** (RE-01 C): lugar, detalle_danos, verif_incendio (bool), verif_derrame (bool), estado_estanqueidad_tanques
- **`ext_incendio`** (RE-01 D): lugar_inicio, corte_suministro (bool), cierre_ventilacion (bool), puertas_cortafuego (bool), puertas_estancas (bool), cumple_rol_incendio (bool), uso_era (bool), uso_mangueras (bool), uso_extintores (bool), uso_co2 (bool), uso_traje_bombero (bool), verif_perdida_gobierno (bool), verif_derrame (bool)
- **`ext_varadura`** (RE-01 E): lugar, detalle_danos, danos_solucionables_abordo (bool), detalle_solucion
- **`ext_remolque`** (RE-01 R): posicion_geografica, datos_remolque (mismos campos que ext_sin_gobierno), verificaciones_antes_durante_despues

*Pendiente:* el manual de referencia menciona un registro **RO-07A (reporte de heridos)** vinculado desde varios de estos registros cuando "hubo heridos = SI", pero no se relevó su formulario completo todavía.

### 5.5 Checklists (RE-01 F, PM 04)

**`bote_rescate_control`** (RE-01 F)
- id, buque_id, marea, singladura, fecha_hora, ubicacion_posicion, observaciones, firma

**`checklist_registro`** (respuestas de checklist, reutilizable entre RE-01 F y PM 04 Anexo A/B)
- id, checklist_config_id (FK), registro_padre_id (FK a bote_rescate_control u otro registro que use checklist), fecha, estado (OK / NO_OK), observacion, firma

## 6. Requisitos no funcionales

- Plataforma 100% web (sin instalación de software en el buque).
- Guardado local del formulario en progreso (borrador) mientras se completa, para no perder datos ante un corte breve de conectividad.
- Trazabilidad completa e inmutable de cada registro (quién, cuándo, estado).
- Diseño pensado para eventualmente escalar a más de un buque/empresa, aunque el MVP es de una empresa y un buque (evitar decisiones de diseño que hagan muy costoso agregar esa capa después, pero sin sobre-ingenierizar el MVP).

## 7. Alcance del MVP

- Un solo procedimiento: PE-01 y sus registros asociados (secciones 5.3 a 5.5).
- Una empresa (Pesantar), un buque (Pesantar 1).
- Dos vistas: "A bordo" (carga de registros + firma) y "Tierra" (revisión, aprobación/observación).

## 8. Explícitamente fuera de alcance del MVP (para etapas futuras)

- **Procedimiento de ciberseguridad ampliado:** el manual actual solo contempla claves de acceso a las PCs del buque y de la empresa. El usuario quiere evaluar un procedimiento exclusivo nuevo, más alineado con las guías actuales de gestión de riesgo cibernético marítimo (ej. IMO MSC-FAL.1/Circ.3): gestión de contraseñas, roles y permisos, backups, actualización de antivirus, restricciones de USB, reporte de incidentes, segregación de redes. Tema identificado, no desarrollado todavía.
- Actualización de la estructura del manual en base al REGINAVE actualizado, la ordenanza PNA actualizada (boceto pendiente de recibir) y las exigencias por eslora +75m.
- Resto de los procedimientos del MGS (PE-01 es el único del MVP piloto).

## 9. Sugerencia para abordar la construcción con Code

Dado que el equipo no tiene perfil de desarrollo, se sugiere:

1. Pasarle este documento completo a Claude Code como contexto inicial.
2. Dejar que Code proponga el stack técnico (no hay preferencia del equipo) y la estructura de carpetas del proyecto.
3. Pedir que la primera entrega sea el **schema de base de datos** (las tablas de la sección 5) y una API mínima para crear/leer un `zafarrancho_ejercicio` de punta a punta, como prueba de concepto del flujo completo (bordo → sincroniza → tierra aprueba).
4. Recién después de validar ese flujo mínimo, extender a los demás registros (B, C, D, E, F, R) y a los catálogos configurables.
