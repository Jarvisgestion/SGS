/**
 * ABM del catálogo: manual, procedimientos, tipos de registro, flota y
 * personas. Es lo que permite que una empresa cargue y edite su propio manual
 * sin que nadie toque el código ni la base a mano.
 *
 * El permiso lo verifica además la base (migración 0009): estas rutas cortan
 * antes para dar un error claro, pero no son la única defensa.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashSecret } from '../auth.ts';
import { withTransaction } from '../db.ts';
import { HttpError } from '../errors.ts';

const idParam = z.object({ id: z.string().uuid() });

const manualBody = z.object({
  revision_number: z.string().min(1),
  regulation: z.string().nullish(),
  effective_date: z.string().date().nullish(),
});

const procedureBody = z.object({
  manual_version_id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  sort_order: z.number().int().optional(),
});

const campo = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/, 'La clave debe ser snake_case'),
    type: z.string().min(1),
  })
  .passthrough();

const recordTypeBody = z.object({
  procedure_id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.enum([
    'master_data',
    'scheduled_checklist',
    'incident_event',
    'management_review',
    'risk_assessment',
    'inactive_vessel',
  ]),
  scope: z.enum(['company', 'vessel']).default('vessel'),
  recurrence_type: z
    .enum(['none', 'on_event', 'daily', 'monthly', 'fixed_interval_days'])
    .default('on_event'),
  recurrence_days: z.number().int().positive().nullish(),
  allowed_creator_roles: z.array(z.string()).default([]),
  allowed_reviewer_roles: z.array(z.string()).default([]),
  signature_requirement: z
    .enum(['none', 'manuscrita', 'pin', 'ambas', 'configurable_por_firmante'])
    .default('configurable_por_firmante'),
  field_schema: z.array(campo).default([]),
});

const vesselBody = z.object({
  name: z.string().min(1),
  matricula: z.string().min(1),
  omi: z.string().nullish(),
  vessel_type: z.string().nullish(),
  service: z.string().nullish(),
  specific_operation: z.string().nullish(),
  specs: z.record(z.unknown()).default({}),
  status: z.enum(['activo', 'inactivo', 'retirado_de_servicio']).optional(),
});

const riskBody = z.object({
  vessel_id: z.string().uuid().nullish(),
  chart_number: z.string().nullish(),
  work_position: z.string().min(1),
  hazard_source: z.string().min(1),
  probability: z.number().int().min(1).max(3),
  consequence: z.number().int().min(1).max(3),
  control_measures: z.string().nullish(),
  responsible_user_id: z.string().uuid().nullish(),
  due_date: z.string().date().nullish(),
  residual_probability: z.number().int().min(1).max(3).nullish(),
  residual_consequence: z.number().int().min(1).max(3).nullish(),
});

const userBody = z.object({
  full_name: z.string().min(1),
  email: z.string().email().nullish(),
  dni: z.string().nullish(),
  password: z.string().min(8).nullish(),
  pin: z.string().regex(/^\d{4,8}$/).nullish(),
  role_code: z.string().nullish(),
  vessel_id: z.string().uuid().nullish(),
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    // La matriz de riesgo tiene su propio permiso: el Responsable de Seguridad
    // e Higiene la mantiene sin administrar el resto del catálogo.
    const esRiesgo = req.url.includes('/admin/risks');

    const { rows } = await app.db.query<{ puede: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON r.code = ur.role_code
        WHERE ur.user_id = $1 AND ur.company_id = $2
          AND ur.valid_from <= current_date
          AND (ur.valid_to IS NULL OR ur.valid_to >= current_date)
          AND ($3::boolean IS TRUE AND r.can_manage_risk OR $3::boolean IS FALSE AND r.can_manage_catalog)
       ) AS puede`,
      [req.user.id, req.companyId, esRiesgo],
    );
    if (!rows[0]?.puede) {
      throw new HttpError(
        403,
        esRiesgo
          ? 'Tu rol no habilita a editar la matriz de riesgo de esta empresa'
          : 'Tu rol no habilita a editar el catálogo de esta empresa',
      );
    }
  });

  // --- manual ---------------------------------------------------------------

  app.get('/manual-versions', async (req) => {
    const { rows } = await app.db.query(
      `SELECT mv.*, (SELECT count(*) FROM procedures p WHERE p.manual_version_id = mv.id) AS procedimientos
         FROM manual_versions mv
        WHERE mv.company_id = $1
        ORDER BY mv.effective_date DESC NULLS LAST, mv.created_at DESC`,
      [req.companyId],
    );
    return { manual_versions: rows };
  });

  app.post('/manual-versions', async (req, reply) => {
    const body = manualBody.parse(req.body);
    const row = await withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO manual_versions (company_id, revision_number, regulation, effective_date)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.companyId, body.revision_number, body.regulation ?? null, body.effective_date ?? null],
      );
      return rows[0];
    });
    return reply.code(201).send(row);
  });

  /**
   * Poner una revisión en vigencia: la anterior queda superada en la misma
   * transacción. Es lo que hace inequívoco qué catálogo rige hoy a bordo.
   */
  app.post('/manual-versions/:id/publicar', async (req) => {
    const { id } = idParam.parse(req.params);
    return withTransaction(app.db, req.user.id, async (tx) => {
      await tx.query(
        `UPDATE manual_versions SET status = 'superada'
          WHERE company_id = $1 AND status = 'vigente' AND id <> $2`,
        [req.companyId, id],
      );
      const { rows } = await tx.query(
        `UPDATE manual_versions
            SET status = 'vigente', effective_date = COALESCE(effective_date, current_date)
          WHERE id = $1 AND company_id = $2
          RETURNING *`,
        [id, req.companyId],
      );
      if (!rows[0]) throw new HttpError(404, 'Revisión inexistente');
      return rows[0];
    });
  });

  // --- procedimientos -------------------------------------------------------

  app.get('/procedures', async (req) => {
    const q = z.object({ manual_version_id: z.string().uuid().optional() }).parse(req.query);
    const { rows } = await app.db.query(
      `SELECT p.*, (SELECT count(*) FROM record_types rt WHERE rt.procedure_id = p.id) AS registros
         FROM procedures p
        WHERE p.company_id = $1 AND ($2::uuid IS NULL OR p.manual_version_id = $2)
        ORDER BY p.sort_order, p.code`,
      [req.companyId, q.manual_version_id ?? null],
    );
    return { procedures: rows };
  });

  app.post('/procedures', async (req, reply) => {
    const body = procedureBody.parse(req.body);
    const row = await withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO procedures (manual_version_id, company_id, code, name, sort_order)
         VALUES ($1, $2, $3, $4, COALESCE($5, 0)) RETURNING *`,
        [body.manual_version_id, req.companyId, body.code, body.name, body.sort_order ?? null],
      );
      return rows[0];
    });
    return reply.code(201).send(row);
  });

  app.patch('/procedures/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = procedureBody.partial().parse(req.body);
    return withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `UPDATE procedures
            SET code = COALESCE($3, code), name = COALESCE($4, name),
                sort_order = COALESCE($5, sort_order)
          WHERE id = $1 AND company_id = $2 RETURNING *`,
        [id, req.companyId, body.code ?? null, body.name ?? null, body.sort_order ?? null],
      );
      if (!rows[0]) throw new HttpError(404, 'Procedimiento inexistente');
      return rows[0];
    });
  });

  // --- tipos de registro ----------------------------------------------------

  app.post('/record-types', async (req, reply) => {
    const body = recordTypeBody.parse(req.body);
    const row = await withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO record_types
           (procedure_id, company_id, code, name, category, scope, recurrence_type,
            recurrence_days, allowed_creator_roles, allowed_reviewer_roles,
            signature_requirement, field_schema)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [
          body.procedure_id,
          req.companyId,
          body.code,
          body.name,
          body.category,
          body.scope,
          body.recurrence_type,
          body.recurrence_days ?? null,
          body.allowed_creator_roles,
          body.allowed_reviewer_roles,
          body.signature_requirement,
          JSON.stringify(body.field_schema),
        ],
      );
      return rows[0];
    });
    return reply.code(201).send(row);
  });

  /**
   * Editar el formulario sube la versión sola (trigger en la base) y congela la
   * anterior, así los registros ya firmados se siguen leyendo como se cargaron.
   */
  app.patch('/record-types/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = recordTypeBody.partial().extend({ status: z.enum(['vigente', 'derogado']).optional() }).parse(req.body);

    return withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `UPDATE record_types
            SET name = COALESCE($3, name),
                code = COALESCE($4, code),
                category = COALESCE($5::record_category, category),
                scope = COALESCE($6::record_scope, scope),
                recurrence_type = COALESCE($7::recurrence_type, recurrence_type),
                recurrence_days = CASE WHEN $7::recurrence_type IS NULL THEN recurrence_days ELSE $8 END,
                allowed_creator_roles = COALESCE($9::text[], allowed_creator_roles),
                allowed_reviewer_roles = COALESCE($10::text[], allowed_reviewer_roles),
                signature_requirement = COALESCE($11::signature_requirement, signature_requirement),
                field_schema = COALESCE($12::jsonb, field_schema),
                status = COALESCE($13::catalog_status, status)
          WHERE id = $1 AND company_id = $2
          RETURNING *`,
        [
          id,
          req.companyId,
          body.name ?? null,
          body.code ?? null,
          body.category ?? null,
          body.scope ?? null,
          body.recurrence_type ?? null,
          body.recurrence_days ?? null,
          body.allowed_creator_roles ?? null,
          body.allowed_reviewer_roles ?? null,
          body.signature_requirement ?? null,
          body.field_schema ? JSON.stringify(body.field_schema) : null,
          body.status ?? null,
        ],
      );
      if (!rows[0]) throw new HttpError(404, 'Tipo de registro inexistente');
      return rows[0];
    });
  });

  // --- flota ----------------------------------------------------------------

  app.post('/vessels', async (req, reply) => {
    const body = vesselBody.parse(req.body);
    const row = await withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO vessels (company_id, name, matricula, omi, vessel_type, service,
                              specific_operation, specs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          req.companyId,
          body.name,
          body.matricula,
          body.omi ?? null,
          body.vessel_type ?? null,
          body.service ?? null,
          body.specific_operation ?? null,
          JSON.stringify(body.specs),
        ],
      );
      return rows[0];
    });
    return reply.code(201).send(row);
  });

  app.patch('/vessels/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = vesselBody.partial().parse(req.body);
    return withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `UPDATE vessels
            SET name = COALESCE($3, name), matricula = COALESCE($4, matricula),
                omi = COALESCE($5, omi), vessel_type = COALESCE($6, vessel_type),
                service = COALESCE($7, service),
                specific_operation = COALESCE($8, specific_operation),
                specs = COALESCE($9::jsonb, specs),
                status = COALESCE($10::vessel_status, status)
          WHERE id = $1 AND company_id = $2 RETURNING *`,
        [
          id,
          req.companyId,
          body.name ?? null,
          body.matricula ?? null,
          body.omi ?? null,
          body.vessel_type ?? null,
          body.service ?? null,
          body.specific_operation ?? null,
          body.specs ? JSON.stringify(body.specs) : null,
          body.status ?? null,
        ],
      );
      if (!rows[0]) throw new HttpError(404, 'Buque inexistente');
      return rows[0];
    });
  });

  // --- matriz de riesgo (PO-08) ---------------------------------------------

  app.post('/risks', async (req, reply) => {
    const body = riskBody.parse(req.body);
    const row = await withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO risk_assessments
           (company_id, vessel_id, chart_number, work_position, hazard_source,
            probability, consequence, control_measures, responsible_user_id, due_date,
            residual_probability, residual_consequence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *, risk_level(risk_score) AS risk_level`,
        [
          req.companyId,
          body.vessel_id ?? null,
          body.chart_number ?? null,
          body.work_position,
          body.hazard_source,
          body.probability,
          body.consequence,
          body.control_measures ?? null,
          body.responsible_user_id ?? null,
          body.due_date ?? null,
          body.residual_probability ?? null,
          body.residual_consequence ?? null,
        ],
      );
      return rows[0];
    });
    return reply.code(201).send(row);
  });

  app.patch('/risks/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = riskBody.partial().extend({ status: z.enum(['vigente', 'revisado', 'cerrado']).optional() }).parse(req.body);

    return withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `UPDATE risk_assessments
            SET chart_number = COALESCE($3, chart_number),
                work_position = COALESCE($4, work_position),
                hazard_source = COALESCE($5, hazard_source),
                probability = COALESCE($6, probability),
                consequence = COALESCE($7, consequence),
                control_measures = COALESCE($8, control_measures),
                residual_probability = COALESCE($9, residual_probability),
                residual_consequence = COALESCE($10, residual_consequence),
                status = COALESCE($11::risk_status, status)
          WHERE id = $1 AND company_id = $2
          RETURNING *, risk_level(risk_score) AS risk_level`,
        [
          id,
          req.companyId,
          body.chart_number ?? null,
          body.work_position ?? null,
          body.hazard_source ?? null,
          body.probability ?? null,
          body.consequence ?? null,
          body.control_measures ?? null,
          body.residual_probability ?? null,
          body.residual_consequence ?? null,
          body.status ?? null,
        ],
      );
      if (!rows[0]) throw new HttpError(404, 'Evaluación de riesgo inexistente');
      return rows[0];
    });
  });

  // --- personas -------------------------------------------------------------

  app.get('/users', async (req) => {
    const { rows } = await app.db.query(
      `SELECT u.id, u.full_name, u.email, u.dni, u.status,
              u.password_hash IS NOT NULL AS tiene_clave,
              u.pin_hash IS NOT NULL AS tiene_pin,
              (SELECT json_agg(json_build_object('id', ur.id, 'role_code', ur.role_code,
                                                 'vessel_id', ur.vessel_id, 'valid_from', ur.valid_from))
                 FROM user_roles ur
                WHERE ur.user_id = u.id AND ur.valid_to IS NULL) AS roles
         FROM users u
        WHERE u.company_id = $1
        ORDER BY u.full_name`,
      [req.companyId],
    );
    return { users: rows };
  });

  app.post('/users', async (req, reply) => {
    const body = userBody.parse(req.body);
    const row = await withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO users (company_id, full_name, email, dni, password_hash, pin_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, full_name, email, dni, status`,
        [
          req.companyId,
          body.full_name,
          body.email ?? null,
          body.dni ?? null,
          body.password ? await hashSecret(body.password) : null,
          body.pin ? await hashSecret(body.pin) : null,
        ],
      );
      if (body.role_code) {
        await tx.query(
          `INSERT INTO user_roles (user_id, role_code, company_id, vessel_id) VALUES ($1, $2, $3, $4)`,
          [rows[0]!.id, body.role_code, req.companyId, body.vessel_id ?? null],
        );
      }
      return rows[0];
    });
    return reply.code(201).send(row);
  });

  app.patch('/users/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = userBody.partial().parse(req.body);
    return withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `UPDATE users
            SET full_name = COALESCE($3, full_name), email = COALESCE($4, email),
                dni = COALESCE($5, dni),
                password_hash = COALESCE($6, password_hash),
                pin_hash = COALESCE($7, pin_hash)
          WHERE id = $1 AND company_id = $2
          RETURNING id, full_name, email, dni, status`,
        [
          id,
          req.companyId,
          body.full_name ?? null,
          body.email ?? null,
          body.dni ?? null,
          body.password ? await hashSecret(body.password) : null,
          body.pin ? await hashSecret(body.pin) : null,
        ],
      );
      if (!rows[0]) throw new HttpError(404, 'Usuario inexistente');
      return rows[0];
    });
  });

  /** Asignar un rol. El cambio de mando se hace cerrando el anterior primero. */
  app.post('/users/:id/roles', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ role_code: z.string().min(1), vessel_id: z.string().uuid().nullish() })
      .parse(req.body);

    const row = await withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO user_roles (user_id, role_code, company_id, vessel_id)
         SELECT $1, $2, $3, $4 FROM users u WHERE u.id = $1 AND u.company_id = $3
         RETURNING id, role_code, vessel_id, valid_from`,
        [id, body.role_code, req.companyId, body.vessel_id ?? null],
      );
      if (!rows[0]) throw new HttpError(404, 'Usuario inexistente');
      return rows[0];
    });
    return reply.code(201).send(row);
  });

  /** Cerrar un rol: no se borra, se le pone fecha de fin (queda el historial). */
  app.delete('/users/:id/roles/:roleId', async (req) => {
    const { id, roleId } = z
      .object({ id: z.string().uuid(), roleId: z.string().uuid() })
      .parse(req.params);

    return withTransaction(app.db, req.user.id, async (tx) => {
      const { rows } = await tx.query(
        `UPDATE user_roles SET valid_to = current_date
          WHERE id = $1 AND user_id = $2 AND company_id = $3 AND valid_to IS NULL
          RETURNING id, role_code, valid_to`,
        [roleId, id, req.companyId],
      );
      if (!rows[0]) throw new HttpError(404, 'Rol inexistente o ya cerrado');
      return rows[0];
    });
  });
}
