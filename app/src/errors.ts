import type { Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

/**
 * Traduce los errores de Postgres a códigos HTTP.
 *
 * El esquema levanta sus excepciones con mensajes en castellano pensados para que
 * los lea una persona ("faltan campos obligatorios: descripcion"), así que se
 * pasan tal cual al cliente en vez de reescribirlos acá. La regla vive en un solo
 * lugar: la base.
 */
const PG_STATUS: Record<string, number> = {
  '23514': 422, // check_violation
  '23502': 422, // not_null_violation
  '23503': 422, // foreign_key_violation
  '23505': 409, // unique_violation
  '23P01': 409, // exclusion_violation
  '42501': 403, // insufficient_privilege
  P0001: 422,   // raise_exception
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, detail: err.detail });
    return;
  }
  const pgErr = err as { code?: string; message?: string; constraint?: string };
  if (pgErr?.code && PG_STATUS[pgErr.code]) {
    res.status(PG_STATUS[pgErr.code]!).json({
      error: pgErr.message ?? 'La operación no cumple una regla del sistema',
      constraint: pgErr.constraint,
    });
    return;
  }
  console.error('error no manejado:', err);
  res.status(500).json({ error: 'Error interno' });
}

/** Envuelve un handler async para que los rechazos lleguen al errorHandler. */
export function wrap(
  fn: (req: Request, res: Response) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}
