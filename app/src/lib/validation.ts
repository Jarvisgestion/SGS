import { z } from "zod";

export const participanteSchema = z.object({
  tripulanteId: z.string().min(1),
  dni: z.string().min(1),
  puesto: z.string().min(1),
  firma: z.string().optional().nullable(),
});

export const crearZafarranchoSchema = z.object({
  tipoZafarranchoId: z.string().min(1, "Falta el tipo de zafarrancho"),
  marea: z.string().optional().nullable(),
  singladura: z.string().optional().nullable(),
  fecha: z.coerce.date(),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)"),
  temasDesarrollados: z.string().min(1, "Describí los temas desarrollados"),
  libroNavegacionFoja: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  firmaCapitan: z.string().optional().nullable(),
  participantes: z.array(participanteSchema).min(1, "Cargá al menos un participante"),
});

export const revisionSchema = z
  .object({
    decision: z.enum(["aprobado", "observado"]),
    comentario: z.string().optional().nullable(),
    revisadoPor: z.string().min(1, "Falta indicar quién revisa"),
  })
  .refine((data) => data.decision !== "observado" || !!data.comentario?.trim(), {
    message: "El comentario es obligatorio cuando se observa un registro",
    path: ["comentario"],
  });

// Edición parcial (bordo corrige tras una observación): todos los campos son
// opcionales, se actualiza solo lo que venga en el body.
export const editarZafarranchoSchema = crearZafarranchoSchema.partial();

// ---------------------------------------------------------------------------
// Registros de emergencia (RE-01 B, C, D, E, R) — sección 5.4
// ---------------------------------------------------------------------------

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)");

const baseRegistroEmergencia = z.object({
  marea: z.string().optional().nullable(),
  singladura: z.string().optional().nullable(),
  fecha: z.coerce.date(),
  hora: horaSchema,
  descripcion: z.string().min(1, "Describí lo sucedido"),
  condicionesHidrometeorologicas: z.string().optional().nullable(),
  seInformaCompania: z.boolean().default(false),
  seInformaPna: z.boolean().default(false),
  huboHeridos: z.boolean().default(false),
  necesitaRemolque: z.boolean().default(false),
  firmaCapitanPd: z.string().optional().nullable(),
});

const extSinGobiernoSchema = z.object({
  buqueRemolque: z.string().optional().nullable(),
  matriculaRemolque: z.string().optional().nullable(),
  horaInicio: z.string().optional().nullable(),
  duracionEstimada: z.string().optional().nullable(),
  fechaUltimoControlAnexoAb: z.coerce.date().optional().nullable(),
});

const extColisionSchema = z.object({
  lugar: z.string().optional().nullable(),
  detalleDanos: z.string().optional().nullable(),
  verifIncendio: z.boolean().default(false),
  verifDerrame: z.boolean().default(false),
  estadoEstanqueidadTanques: z.string().optional().nullable(),
});

const extIncendioSchema = z.object({
  lugarInicio: z.string().optional().nullable(),
  corteSuministro: z.boolean().default(false),
  cierreVentilacion: z.boolean().default(false),
  puertasCortafuego: z.boolean().default(false),
  puertasEstancas: z.boolean().default(false),
  cumpleRolIncendio: z.boolean().default(false),
  usoEra: z.boolean().default(false),
  usoMangueras: z.boolean().default(false),
  usoExtintores: z.boolean().default(false),
  usoCo2: z.boolean().default(false),
  usoTrajeBombero: z.boolean().default(false),
  verifPerdidaGobierno: z.boolean().default(false),
  verifDerrame: z.boolean().default(false),
});

const extVaraduraSchema = z.object({
  lugar: z.string().optional().nullable(),
  detalleDanos: z.string().optional().nullable(),
  danosSolucionablesAbordo: z.boolean().default(false),
  detalleSolucion: z.string().optional().nullable(),
});

const extRemolqueSchema = z.object({
  posicionGeografica: z.string().optional().nullable(),
  buqueRemolque: z.string().optional().nullable(),
  matriculaRemolque: z.string().optional().nullable(),
  horaInicio: z.string().optional().nullable(),
  duracionEstimada: z.string().optional().nullable(),
  verificacionesAntesDuranteDespues: z.string().optional().nullable(),
});

export const crearRegistroEmergenciaSchema = z.discriminatedUnion("tipo", [
  baseRegistroEmergencia.extend({ tipo: z.literal("sin_gobierno"), ext: extSinGobiernoSchema }),
  baseRegistroEmergencia.extend({ tipo: z.literal("colision"), ext: extColisionSchema }),
  baseRegistroEmergencia.extend({ tipo: z.literal("incendio"), ext: extIncendioSchema }),
  baseRegistroEmergencia.extend({ tipo: z.literal("varadura"), ext: extVaraduraSchema }),
  baseRegistroEmergencia.extend({ tipo: z.literal("remolque"), ext: extRemolqueSchema }),
]);

// La corrección a bordo reenvía el formulario completo (mismo shape que la
// creación): a diferencia del zafarrancho, acá no vale la pena un "partial"
// porque el tipo determina qué campos de `ext` son válidos.
export const editarRegistroEmergenciaSchema = crearRegistroEmergenciaSchema;

export const TIPOS_REGISTRO_EMERGENCIA = [
  "sin_gobierno",
  "colision",
  "incendio",
  "varadura",
  "remolque",
] as const;

// ---------------------------------------------------------------------------
// RE-01 F — Control del bote de rescate (checklist) — sección 5.5
// ---------------------------------------------------------------------------

export const TIPOS_CHECKLIST_BOTE = [
  "bote_exterior",
  "bote_interior",
  "bote_pescante",
  "bote_inventario",
] as const;

const itemChecklistSchema = z.object({
  checklistConfigId: z.string().min(1),
  estado: z.enum(["OK", "NO_OK"]),
  observacion: z.string().optional().nullable(),
});

export const crearBoteRescateSchema = z.object({
  marea: z.string().optional().nullable(),
  singladura: z.string().optional().nullable(),
  fechaHora: z.coerce.date(),
  ubicacionPosicion: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  items: z.array(itemChecklistSchema).min(1, "El checklist no puede estar vacío"),
  // Confirmación por PIN (especificación, sección 4) en lugar de firma manuscrita.
  confirmadoPorId: z.string().min(1, "Indicá quién confirma el checklist"),
  pin: z.string().min(1, "Ingresá el PIN de confirmación"),
});

export const editarBoteRescateSchema = crearBoteRescateSchema;
