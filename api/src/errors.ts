/**
 * Traducción de errores de PostgreSQL a respuestas HTTP.
 *
 * Buena parte de las reglas del dominio viven en la base (ver
 * docs/03-esquema-sql.md §3). Este mapeo es lo que hace que esas reglas
 * lleguen al cliente como un error entendible en vez de un 500, sin
 * duplicar la validación en la API.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly detail?: unknown;

  constructor(statusCode: number, message: string, detail?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

interface PgError {
  code?: string;
  message?: string;
  constraint?: string;
}

/** Errores que genera el propio Fastify: 429 del limitador, 400 de un JSON roto. */
interface ErrorDeFastify {
  statusCode?: number;
  message?: string;
}

/** SQLSTATE -> HTTP. Sólo estos códigos exponen el mensaje de la base. */
const SQLSTATE_TO_HTTP: Record<string, number> = {
  P0001: 422, // RAISE EXCEPTION de nuestras funciones de validación
  '23514': 422, // check_violation
  '23503': 422, // foreign_key_violation
  '23502': 422, // not_null_violation
  '22P02': 422, // invalid_text_representation (uuid mal formado, enum inexistente)
  '23505': 409, // unique_violation
  '23001': 409, // restrict_violation (append-only, registro aprobado)
  '42501': 403, // insufficient_privilege (rol no habilitado)
};

export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;

  const pg = err as PgError;
  if (pg && typeof pg.code === 'string') {
    const status = SQLSTATE_TO_HTTP[pg.code];
    if (status) {
      return new HttpError(status, cleanMessage(pg), { constraint: pg.constraint });
    }
  }

  // Un 4xx que ya viene decidido (limitador, body inválido) se respeta: si no,
  // el cliente ve un 500 y cree que el problema es del servidor.
  const fastify = err as ErrorDeFastify;
  if (typeof fastify?.statusCode === 'number' && fastify.statusCode >= 400 && fastify.statusCode < 500) {
    return new HttpError(fastify.statusCode, fastify.message ?? 'Pedido rechazado');
  }

  return new HttpError(500, 'Error interno');
}

/**
 * Los mensajes de nuestras funciones ya están escritos para que los lea una
 * persona. Los de constraints con nombre técnico se traducen a algo legible.
 */
function cleanMessage(pg: PgError): string {
  const named: Record<string, string> = {
    signatures_canvas_needs_image: 'Una firma manuscrita requiere la imagen de la firma',
    record_reviews_observado_needs_comment: 'Observar un registro exige un comentario',
    record_instances_data_is_object: 'Los datos del formulario deben ser un objeto',
    risk_assessments_scale: 'La valoración de riesgo debe estar entre 1 y 3',
    users_email_key: 'Ya existe un usuario con ese email',
    vessels_company_matricula_key: 'Ya existe un buque con esa matrícula en la empresa',
  };
  if (pg.constraint && named[pg.constraint]) return named[pg.constraint]!;
  return pg.message ?? 'Operación rechazada por la base de datos';
}
