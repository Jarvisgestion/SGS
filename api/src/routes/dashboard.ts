import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const complianceQuery = z.object({
  vessel_id: z.string().uuid().optional(),
  /** Por defecto muestra sólo lo que requiere atención. */
  only_pending: z.coerce.boolean().default(false),
});

export async function dashboardRoutes(app: FastifyInstance) {
  /**
   * RA-06C "Monitoreo y Control del SGS": qué registros están al día por buque.
   * Es una vista, no una tabla — el meta-registro no genera datos nuevos.
   */
  app.get('/compliance', async (req) => {
    const q = complianceQuery.parse(req.query);
    const { rows } = await app.db.query(
      `SELECT * FROM v_record_compliance
        WHERE company_id = $1
          AND ($2::uuid IS NULL OR vessel_id = $2 OR vessel_id IS NULL)
          AND (NOT $3::boolean OR compliance_status IN ('vencido', 'por_vencer', 'sin_registro'))
        ORDER BY CASE compliance_status
                   WHEN 'vencido'      THEN 0
                   WHEN 'por_vencer'   THEN 1
                   WHEN 'sin_registro' THEN 2
                   WHEN 'al_dia'       THEN 3
                   ELSE 4
                 END,
                 next_due_at NULLS LAST, record_type_code`,
      [req.companyId, q.vessel_id ?? null, q.only_pending],
    );
    return { compliance: rows };
  });

  /** Bandeja de revisión de la Persona Designada / asesor externo. */
  app.get('/pending-reviews', async (req) => {
    const { rows } = await app.db.query(
      `SELECT * FROM v_pending_reviews WHERE company_id = $1 ORDER BY submitted_at`,
      [req.companyId],
    );
    return { pending: rows };
  });

  /** RMGS-05: vencimientos de certificados de los buques. */
  app.get('/certificates', async (req) => {
    const { rows } = await app.db.query(
      `SELECT * FROM v_vessel_certificate_status
        WHERE company_id = $1
        ORDER BY expires_at NULLS LAST`,
      [req.companyId],
    );
    return { certificates: rows };
  });

  /**
   * Registros que un hecho ya enviado dejó pendientes: un incendio con heridos
   * exige el acaecimiento médico, y hasta que no se cargue queda a la vista.
   */
  app.get('/pending-children', async (req) => {
    const { rows } = await app.db.query(
      `SELECT * FROM v_registros_hijos_pendientes
        WHERE company_id = $1
        ORDER BY occurred_at DESC`,
      [req.companyId],
    );
    return { pending_children: rows };
  });

  /** Desvíos: ítems en no_ok de cualquier checklist (Anexo de desvíos de PO-05). */
  app.get('/nonconformities', async (req) => {
    const { rows } = await app.db.query(
      `SELECT * FROM v_record_nonconformities
        WHERE company_id = $1
        ORDER BY occurred_at DESC
        LIMIT 200`,
      [req.companyId],
    );
    return { nonconformities: rows };
  });
}
