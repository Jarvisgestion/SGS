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
