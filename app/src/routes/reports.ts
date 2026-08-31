import { Router } from 'express';
import { withTenant } from '../db.js';
import { requireAuth, type SessionUser } from '../auth.js';
import { wrap } from '../errors.js';

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
        ORDER BY CASE compliance_status
                   WHEN 'vencido' THEN 1 WHEN 'sin_registro' THEN 2
                   WHEN 'por_vencer' THEN 3 ELSE 4 END,
                 record_code`,
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

reportsRouter.get('/reports/pending', wrap(async (req, res) => {
  const u = user(req);
  const rows = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT record_instance_id, vessel_name, procedure_code, record_code, record_name,
              occurred_at, submitted_at, submitted_by, allowed_reviewer_roles
         FROM v_pending_reviews ORDER BY submitted_at`,
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
