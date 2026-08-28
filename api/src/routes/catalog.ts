import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../errors.ts';

const listQuery = z.object({
  scope: z.enum(['company', 'vessel']).optional(),
  category: z.string().optional(),
  include_derogados: z.coerce.boolean().default(false),
});

export async function catalogRoutes(app: FastifyInstance) {
  /** Catálogo de tipos de registro de la empresa: lo que la app ofrece cargar. */
  app.get('/record-types', async (req) => {
    const q = listQuery.parse(req.query);

    const { rows } = await app.db.query(
      `SELECT rt.id, rt.code, rt.name, rt.category, rt.scope, rt.version,
              rt.recurrence_type, rt.recurrence_days, rt.signature_requirement,
              rt.allowed_creator_roles, rt.allowed_reviewer_roles, rt.status,
              p.code AS procedure_code, p.name AS procedure_name
         FROM record_types rt
         JOIN procedures p ON p.id = rt.procedure_id
        WHERE rt.company_id = $1
          AND ($2::boolean OR rt.status = 'vigente')
          AND ($3::record_scope IS NULL OR rt.scope = $3)
          AND ($4::record_category IS NULL OR rt.category = $4)
        ORDER BY p.sort_order, p.code, rt.code`,
      [req.companyId, q.include_derogados, q.scope ?? null, q.category ?? null],
    );
    return { record_types: rows };
  });

  /** Definición completa del formulario, para que el cliente lo dibuje. */
  app.get('/record-types/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const { rows } = await app.db.query(
      `SELECT rt.id, rt.code, rt.name, rt.category, rt.scope, rt.version,
              rt.recurrence_type, rt.recurrence_days, rt.signature_requirement,
              rt.allowed_creator_roles, rt.allowed_reviewer_roles, rt.field_schema,
              rt.status, p.code AS procedure_code
         FROM record_types rt
         JOIN procedures p ON p.id = rt.procedure_id
        WHERE rt.id = $1 AND rt.company_id = $2`,
      [id, req.companyId],
    );
    if (!rows[0]) throw new HttpError(404, 'Tipo de registro inexistente');
    return rows[0];
  });

  app.get('/vessels', async (req) => {
    const { rows } = await app.db.query(
      `SELECT id, name, matricula, vessel_type, service, specific_operation, status, specs
         FROM vessels WHERE company_id = $1 ORDER BY name`,
      [req.companyId],
    );
    return { vessels: rows };
  });
}
