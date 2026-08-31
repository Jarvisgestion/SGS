import { Router } from 'express';
import { withTenant } from '../db.js';
import { requireAuth, type SessionUser } from '../auth.js';
import { config } from '../config.js';
import { HttpError, wrap } from '../errors.js';

/** Procedimientos habilitados para carga, o null si están todos. */
const pilotFilter = (): string[] | null =>
  config.pilotProcedures.length ? config.pilotProcedures : null;

export const catalogRouter: Router = Router();
catalogRouter.use(requireAuth);

const user = (req: { user?: SessionUser }): SessionUser => req.user!;

/** Catálogo vigente agrupado por procedimiento. */
catalogRouter.get('/catalog', wrap(async (req, res) => {
  const u = user(req);
  const rows = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT rtc.procedure_code, rtc.procedure_name, rtc.record_type_id, rtc.record_code,
              rtc.record_name, rtc.category, rtc.scope, rtc.recurrence_type,
              rtc.recurrence_days, rtc.signature_requirement, rtc.allowed_creator_roles,
              rtc.allowed_reviewer_roles, rtc.field_count, v.requires_signed_attachment
         FROM v_record_type_current rtc
         JOIN record_type_versions v ON v.id = rtc.current_version_id
        WHERE rtc.record_type_status = 'vigente'
          AND ($1::text[] IS NULL OR rtc.procedure_code = ANY($1))
        ORDER BY rtc.procedure_code, rtc.record_code`,
      [pilotFilter()],
    );
    return rows;
  });

  const byProcedure = new Map<string, { code: string; name: string; recordTypes: unknown[] }>();
  for (const r of rows) {
    let group = byProcedure.get(r.procedure_code);
    if (!group) {
      group = { code: r.procedure_code, name: r.procedure_name, recordTypes: [] };
      byProcedure.set(r.procedure_code, group);
    }
    group.recordTypes.push({
      id: r.record_type_id,
      code: r.record_code,
      name: r.record_name,
      category: r.category,
      scope: r.scope,
      recurrenceType: r.recurrence_type,
      recurrenceDays: r.recurrence_days,
      signatureRequirement: r.signature_requirement,
      // Quién puede crearlo y revisarlo lo decide la base; acá solo se informa
      // para que la UI no ofrezca lo que después va a ser rechazado.
      canCreate: r.allowed_creator_roles.length === 0
        || r.allowed_creator_roles.some((role: string) => u.roles.includes(role)),
      canReview: r.allowed_reviewer_roles.length === 0
        || r.allowed_reviewer_roles.some((role: string) => u.roles.includes(role)),
      fieldCount: r.field_count,
      requiresSignedAttachment: r.requires_signed_attachment,
    });
  }
  res.json({
    procedures: [...byProcedure.values()],
    // La interfaz avisa que está en piloto y qué procedimientos abarca.
    pilotProcedures: pilotFilter(),
  });
}));

/** Definición completa del formulario de un tipo de registro. */
catalogRouter.get('/catalog/:recordTypeId', wrap(async (req, res) => {
  const u = user(req);
  const row = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT record_type_id, record_code, record_name, category, scope,
              procedure_code, current_version_id, current_version, recurrence_type,
              recurrence_days, signature_requirement, allowed_creator_roles,
              allowed_reviewer_roles, field_schema,
              (SELECT requires_signed_attachment FROM record_type_versions
                WHERE id = current_version_id) AS requires_signed_attachment
         FROM v_record_type_current WHERE record_type_id = $1`,
      [req.params.recordTypeId],
    );
    return rows[0];
  });
  if (!row) throw new HttpError(404, 'Tipo de registro inexistente');
  res.json({
    id: row.record_type_id,
    code: row.record_code,
    name: row.record_name,
    category: row.category,
    scope: row.scope,
    procedureCode: row.procedure_code,
    versionId: row.current_version_id,
    version: row.current_version,
    recurrenceType: row.recurrence_type,
    recurrenceDays: row.recurrence_days,
    signatureRequirement: row.signature_requirement,
    allowedCreatorRoles: row.allowed_creator_roles,
    allowedReviewerRoles: row.allowed_reviewer_roles,
    requiresSignedAttachment: row.requires_signed_attachment,
    fieldSchema: row.field_schema,
  });
}));

catalogRouter.get('/vessels', wrap(async (req, res) => {
  const u = user(req);
  const rows = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT id, name, matricula, status FROM vessels ORDER BY name`,
    );
    return rows;
  });
  res.json({ vessels: rows });
}));

/** Para los campos de tipo user_reference. */
catalogRouter.get('/users', wrap(async (req, res) => {
  const u = user(req);
  const rows = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT id, full_name, dni FROM users WHERE status = 'activo' ORDER BY full_name`,
    );
    return rows;
  });
  res.json({ users: rows });
}));

/** Para los campos de tipo risk_reference (cuadros de la matriz PO-08). */
catalogRouter.get('/risks', wrap(async (req, res) => {
  const u = user(req);
  const rows = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT id, code, work_position, hazard_source, risk_score
         FROM risk_assessments WHERE status = 'vigente' ORDER BY code NULLS LAST`,
    );
    return rows;
  });
  res.json({ risks: rows });
}));
