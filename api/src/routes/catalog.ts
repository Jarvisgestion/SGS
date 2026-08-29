import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../errors.ts';

const listQuery = z.object({
  scope: z.enum(['company', 'vessel']).optional(),
  category: z.string().optional(),
  include_derogados: z.coerce.boolean().default(false),
  /** Para la pantalla de administración: también los de revisiones superadas. */
  todas_las_revisiones: z.coerce.boolean().default(false),
});

export async function catalogRoutes(app: FastifyInstance) {
  /**
   * Catálogo de tipos de registro: lo que la app ofrece cargar hoy.
   *
   * Sólo los de la revisión vigente del manual. Al poner en vigencia una
   * revisión nueva, los formularios de la anterior dejan de ofrecerse — que es
   * lo que significa superar una revisión. Los registros ya cargados se siguen
   * leyendo con su formulario congelado.
   */
  app.get('/record-types', async (req) => {
    const q = listQuery.parse(req.query);

    const { rows } = await app.db.query(
      `SELECT rt.id, rt.code, rt.name, rt.category, rt.scope, rt.version,
              rt.recurrence_type, rt.recurrence_days, rt.signature_requirement,
              rt.allowed_creator_roles, rt.allowed_reviewer_roles, rt.status,
              p.code AS procedure_code, p.name AS procedure_name,
              mv.revision_number, mv.status AS manual_status
         FROM record_types rt
         JOIN procedures p ON p.id = rt.procedure_id
         JOIN manual_versions mv ON mv.id = p.manual_version_id
        WHERE rt.company_id = $1
          AND ($2::boolean OR rt.status = 'vigente')
          AND ($5::boolean OR mv.status = 'vigente')
          AND ($3::record_scope IS NULL OR rt.scope = $3)
          AND ($4::record_category IS NULL OR rt.category = $4)
        ORDER BY p.sort_order, p.code, rt.code`,
      [
        req.companyId,
        q.include_derogados,
        q.scope ?? null,
        q.category ?? null,
        q.todas_las_revisiones,
      ],
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

  /** Nombres de los roles, para no mostrar el código crudo al firmar. */
  app.get('/roles', async (req) => {
    const { rows } = await app.db.query(
      `SELECT code, name, is_shipboard FROM roles
        WHERE company_id IS NULL OR company_id = $1
        ORDER BY name`,
      [req.companyId],
    );
    return { roles: rows };
  });

  /**
   * Matriz de riesgo de la empresa (PO-08). Es de lectura para todos: el
   * campo `risk_reference` de un registro tiene que poder elegir un cuadro
   * aunque quien carga no administre la matriz.
   */
  app.get('/risks', async (req) => {
    const q = z.object({ vessel_id: z.string().uuid().optional() }).parse(req.query);
    const { rows } = await app.db.query(
      `SELECT ra.id, ra.chart_number, ra.work_position, ra.hazard_source,
              ra.probability, ra.consequence, ra.risk_score, risk_level(ra.risk_score) AS risk_level,
              ra.control_measures, ra.residual_score, risk_level(ra.residual_score) AS residual_level,
              ra.vessel_id, v.name AS vessel_name, ra.status
         FROM risk_assessments ra
         LEFT JOIN vessels v ON v.id = ra.vessel_id
        WHERE ra.company_id = $1
          AND ra.status <> 'cerrado'
          AND ($2::uuid IS NULL OR ra.vessel_id IS NULL OR ra.vessel_id = $2)
        ORDER BY ra.chart_number NULLS LAST, ra.work_position`,
      [req.companyId, q.vessel_id ?? null],
    );
    return { risks: rows };
  });

  /**
   * Quiénes están embarcados, para los campos que referencian a una persona
   * (el tripulante afectado en un acaecimiento médico, por ejemplo).
   */
  app.get('/crew', async (req) => {
    const q = z.object({ vessel_id: z.string().uuid().optional() }).parse(req.query);
    const { rows } = await app.db.query(
      `SELECT u.id, u.full_name, u.dni,
              (SELECT string_agg(DISTINCT ur.role_code, ', ')
                 FROM user_roles ur
                WHERE ur.user_id = u.id AND ur.valid_to IS NULL
                  AND ($2::uuid IS NULL OR ur.vessel_id IS NULL OR ur.vessel_id = $2)) AS roles
         FROM users u
        WHERE u.company_id = $1 AND u.status = 'activo'
          AND ($2::uuid IS NULL OR EXISTS (
                SELECT 1 FROM user_roles ur
                 WHERE ur.user_id = u.id AND ur.valid_to IS NULL
                   AND (ur.vessel_id = $2 OR ur.vessel_id IS NULL)))
        ORDER BY u.full_name`,
      [req.companyId, q.vessel_id ?? null],
    );
    return { crew: rows };
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
