import { Router } from 'express';
import { withTenant } from '../db.js';
import { requireAuth, type SessionUser } from '../auth.js';
import { config } from '../config.js';
import { wrap } from '../errors.js';

const pilotFilter = (): string[] | null =>
  config.pilotProcedures.length ? config.pilotProcedures : null;

export const reportsRouter: Router = Router();
reportsRouter.use(requireAuth);

const user = (req: { user?: SessionUser }): SessionUser => req.user!;

/** RA-06C resuelto como reporte: qué registros recurrentes no están al día. */
reportsRouter.get('/reports/compliance', wrap(async (req, res) => {
  const u = user(req);
  const rows = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT vessel_id, vessel_name, procedure_code, record_code, record_name,
              recurrence_type, recurrence_days, last_occurred_at, next_due_at,
              compliance_status
         FROM v_record_compliance
        WHERE ($1::text[] IS NULL OR procedure_code = ANY($1))
        ORDER BY CASE compliance_status
                   WHEN 'vencido' THEN 1 WHEN 'sin_registro' THEN 2
                   WHEN 'por_vencer' THEN 3 ELSE 4 END,
                 record_code`,
      [pilotFilter()],
    );
    return rows;
  });
  res.json({ rows });
}));

reportsRouter.get('/reports/certificates', wrap(async (req, res) => {
  const u = user(req);
  const rows = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT vessel_name, matricula, certificate_code, certificate_name,
              certificate_number, expires_at, days_to_expiry, status
         FROM v_vessel_certificate_status
        ORDER BY days_to_expiry NULLS LAST`,
    );
    return rows;
  });
  res.json({ rows });
}));

/**
 * Bandeja de revisión. A propósito NO se recorta al piloto: si quedó un registro
 * de otro procedimiento esperando revisión, esconderlo sería peor que mostrarlo.
 */
reportsRouter.get('/reports/pending', wrap(async (req, res) => {
  const u = user(req);
  const rows = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT p.record_instance_id, p.vessel_name, p.procedure_code, p.record_code,
              p.record_name, p.occurred_at, p.submitted_at, p.submitted_by,
              p.allowed_reviewer_roles, b.backing_status
         FROM v_pending_reviews p
         JOIN v_record_backing b ON b.record_instance_id = p.record_instance_id
        ORDER BY p.submitted_at`,
    );
    return rows;
  });
  res.json({
    rows: rows.map((r) => ({
      ...r,
      canReview: r.allowed_reviewer_roles.length === 0
        || r.allowed_reviewer_roles.some((role: string) => u.roles.includes(role)),
    })),
  });
}));
