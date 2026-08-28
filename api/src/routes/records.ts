import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifySecret } from '../auth.ts';
import { withTransaction } from '../db.ts';
import { HttpError } from '../errors.ts';

const createBody = z.object({
  record_type_id: z.string().uuid(),
  vessel_id: z.string().uuid().nullish(),
  occurred_at: z.string().datetime().optional(),
  marea: z.string().nullish(),
  singladura: z.string().nullish(),
  data: z.record(z.unknown()).default({}),
  /** Registro padre, para el patrón "un registro dispara otro" (RE-01D -> RO-07A). */
  parent_record_instance_id: z.string().uuid().nullish(),
});

const patchBody = z.object({
  vessel_id: z.string().uuid().nullish(),
  occurred_at: z.string().datetime().optional(),
  marea: z.string().nullish(),
  singladura: z.string().nullish(),
  data: z.record(z.unknown()).optional(),
});

const listQuery = z.object({
  status: z.enum(['borrador', 'pendiente_revision', 'aprobado', 'observado']).optional(),
  vessel_id: z.string().uuid().optional(),
  record_type_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const signatureBody = z.object({
  field_key: z.string().min(1),
  /** Sólo lo elige el cliente si el registro es `configurable_por_firmante`. */
  method: z.enum(['canvas', 'pin']).optional(),
  pin: z.string().optional(),
  signature_image_id: z.string().uuid().optional(),
});

const reviewBody = z.object({
  decision: z.enum(['aprobado', 'observado']),
  comment: z.string().trim().optional(),
});

const attachmentBody = z.object({
  file_url: z.string().min(1),
  file_name: z.string().optional(),
  file_type: z.enum(['pdf', 'image', 'email', 'other']),
  byte_size: z.number().int().positive().optional(),
  checksum: z.string().optional(),
});

const idParam = z.object({ id: z.string().uuid() });

export async function recordRoutes(app: FastifyInstance) {
  /** Alta de un registro. Nace en borrador: se guarda incompleto a propósito. */
  app.post('/', async (req, reply) => {
    const body = createBody.parse(req.body);

    const row = await withTransaction(app.db, req.user.id, async (tx) => {
      const { rows: types } = await tx.query<{ version: number }>(
        'SELECT version FROM record_types WHERE id = $1 AND company_id = $2 AND status = $3',
        [body.record_type_id, req.companyId, 'vigente'],
      );
      if (!types[0]) throw new HttpError(404, 'Tipo de registro inexistente o derogado');

      const { rows } = await tx.query(
        `INSERT INTO record_instances
           (company_id, record_type_id, record_type_version, vessel_id, marea, singladura,
            occurred_at, data, parent_record_instance_id, created_by, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8, $9, $10, now())
         RETURNING *`,
        [
          req.companyId,
          body.record_type_id,
          types[0].version,
          body.vessel_id ?? null,
          body.marea ?? null,
          body.singladura ?? null,
          body.occurred_at ?? null,
          JSON.stringify(body.data),
          body.parent_record_instance_id ?? null,
          req.user.id,
        ],
      );
      return rows[0];
    });

    return reply.code(201).send(row);
  });

  app.get('/', async (req) => {
    const q = listQuery.parse(req.query);
    const { rows } = await app.db.query(
      `SELECT ri.id, ri.record_type_id, rt.code AS record_type_code, rt.name AS record_type_name,
              ri.vessel_id, v.name AS vessel_name, ri.status, ri.occurred_at, ri.marea,
              ri.submitted_at, ri.created_at, u.full_name AS created_by_name
         FROM record_instances ri
         JOIN record_types rt ON rt.id = ri.record_type_id
         LEFT JOIN vessels v ON v.id = ri.vessel_id
         LEFT JOIN users u   ON u.id = ri.created_by
        WHERE ri.company_id = $1
          AND ($2::record_status IS NULL OR ri.status = $2)
          AND ($3::uuid IS NULL OR ri.vessel_id = $3)
          AND ($4::uuid IS NULL OR ri.record_type_id = $4)
          AND ($5::timestamptz IS NULL OR ri.occurred_at >= $5)
          AND ($6::timestamptz IS NULL OR ri.occurred_at <= $6)
        ORDER BY ri.occurred_at DESC
        LIMIT $7 OFFSET $8`,
      [
        req.companyId,
        q.status ?? null,
        q.vessel_id ?? null,
        q.record_type_id ?? null,
        q.from ?? null,
        q.to ?? null,
        q.limit,
        q.offset,
      ],
    );
    return { records: rows, limit: q.limit, offset: q.offset };
  });

  /**
   * Detalle completo: el formulario tal como estaba cuando se cargó (versión
   * congelada), los datos, las firmas y todo el historial de revisión.
   */
  app.get('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await app.db.query(
      `SELECT ri.*, rt.code AS record_type_code, rt.name AS record_type_name,
              rt.signature_requirement, rtv.field_schema,
              (SELECT json_agg(json_build_object(
                        'id', s.id, 'signer_name', s.signer_name, 'signer_role', s.signer_role,
                        'field_key', s.field_key, 'method', s.method, 'signed_at', s.signed_at)
                      ORDER BY s.signed_at)
                 FROM signatures s WHERE s.record_instance_id = ri.id) AS signatures,
              (SELECT json_agg(json_build_object(
                        'id', r.id, 'decision', r.decision, 'comment', r.comment,
                        'reviewed_at', r.reviewed_at, 'reviewer', ru.full_name)
                      ORDER BY r.reviewed_at)
                 FROM record_reviews r
                 LEFT JOIN users ru ON ru.id = r.reviewer_id
                WHERE r.record_instance_id = ri.id) AS reviews
         FROM record_instances ri
         JOIN record_types rt ON rt.id = ri.record_type_id
         JOIN record_type_versions rtv
           ON rtv.record_type_id = ri.record_type_id AND rtv.version = ri.record_type_version
        WHERE ri.id = $1 AND ri.company_id = $2`,
      [id, req.companyId],
    );
    if (!rows[0]) throw new HttpError(404, 'Registro inexistente');
    return rows[0];
  });

  /**
   * Guardado parcial del borrador. Un registro observado vuelve a borrador al
   * editarse, que es el camino de vuelta del diagrama de estados.
   */
  app.patch('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = patchBody.parse(req.body);

    return withTransaction(app.db, req.user.id, async (tx) => {
      const current = await lockInstance(tx, id, req.companyId);
      if (current.status === 'aprobado') {
        throw new HttpError(409, 'El registro ya está aprobado: es de sólo lectura');
      }
      if (current.status === 'pendiente_revision') {
        throw new HttpError(409, 'El registro está en revisión: no se puede editar');
      }

      const { rows } = await tx.query(
        `UPDATE record_instances
            SET vessel_id   = COALESCE($3, vessel_id),
                marea       = COALESCE($4, marea),
                singladura  = COALESCE($5, singladura),
                occurred_at = COALESCE($6::timestamptz, occurred_at),
                data        = COALESCE($7::jsonb, data),
                status      = 'borrador',
                synced_at   = now()
          WHERE id = $1 AND company_id = $2
          RETURNING *`,
        [
          id,
          req.companyId,
          body.vessel_id ?? null,
          body.marea ?? null,
          body.singladura ?? null,
          body.occurred_at ?? null,
          body.data ? JSON.stringify(body.data) : null,
        ],
      );
      return rows[0];
    });
  });

  /** Envío a tierra. Acá la base valida el formulario completo. */
  app.post('/:id/submit', async (req) => {
    const { id } = idParam.parse(req.params);

    return withTransaction(app.db, req.user.id, async (tx) => {
      const current = await lockInstance(tx, id, req.companyId);
      if (current.status === 'aprobado') throw new HttpError(409, 'El registro ya está aprobado');
      if (current.status === 'pendiente_revision') {
        throw new HttpError(409, 'El registro ya fue enviado');
      }

      // Primero el formulario, después las firmas: si faltan campos, el error
      // útil es ese y no "faltan firmas" (no se firma un formulario incompleto).
      await assertDataComplete(tx, id);
      await assertSignaturesComplete(tx, id);

      const { rows } = await tx.query(
        `UPDATE record_instances
            SET status = 'pendiente_revision', submitted_at = now(), synced_at = now()
          WHERE id = $1 AND company_id = $2
          RETURNING *`,
        [id, req.companyId],
      );
      return rows[0];
    });
  });

  /** Firma de un bloque del formulario. */
  app.post('/:id/signatures', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = signatureBody.parse(req.body);

    const row = await withTransaction(app.db, req.user.id, async (tx) => {
      const instance = await lockInstance(tx, id, req.companyId);
      if (instance.status === 'aprobado') {
        throw new HttpError(409, 'El registro ya está aprobado: no admite nuevas firmas');
      }

      const block = await findSignatureBlock(tx, id, body.field_key);
      if (!block) {
        throw new HttpError(422, `El formulario no tiene un bloque de firma "${body.field_key}"`);
      }

      const { method, needsPin, needsImage } = resolveSignatureMethod(
        instance.signature_requirement,
        body.method,
      );

      if (needsPin) {
        const { rows } = await tx.query<{ pin_hash: string | null }>(
          'SELECT pin_hash FROM users WHERE id = $1',
          [req.user.id],
        );
        if (!body.pin || !(await verifySecret(body.pin, rows[0]?.pin_hash ?? null))) {
          throw new HttpError(401, 'PIN incorrecto');
        }
      }
      if (needsImage && !body.signature_image_id) {
        throw new HttpError(422, 'Una firma manuscrita requiere la imagen de la firma');
      }

      const { rows } = await tx.query(
        `INSERT INTO signatures (record_instance_id, signer_user_id, signer_name, signer_role,
                                 field_key, method, signature_image_id, device_metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, signer_role, field_key, method, signed_at`,
        [
          id,
          req.user.id,
          req.user.fullName,
          block.signer_role,
          body.field_key,
          method,
          body.signature_image_id ?? null,
          JSON.stringify({
            user_agent: req.headers['user-agent'] ?? null,
            ip: req.ip,
            pin_verified: needsPin,
          }),
        ],
      );
      return rows[0];
    });

    return reply.code(201).send(row);
  });

  /** Revisión desde tierra. Los roles habilitados los verifica la base. */
  app.post('/:id/reviews', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = reviewBody.parse(req.body);

    const row = await withTransaction(app.db, req.user.id, async (tx) => {
      await lockInstance(tx, id, req.companyId);
      const { rows } = await tx.query(
        `INSERT INTO record_reviews (record_instance_id, reviewer_id, decision, comment)
         VALUES ($1, $2, $3, $4)
         RETURNING id, decision, comment, reviewed_at`,
        [id, req.user.id, body.decision, body.comment ?? null],
      );
      return rows[0];
    });

    return reply.code(201).send(row);
  });

  /**
   * Alta del metadato de un adjunto (foto, copia de mail, imagen de firma).
   * La subida del archivo al almacenamiento es responsabilidad del cliente:
   * acá sólo se registra la referencia. Ver README, "Pendientes".
   */
  app.post('/:id/attachments', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = attachmentBody.parse(req.body);

    const row = await withTransaction(app.db, req.user.id, async (tx) => {
      await lockInstance(tx, id, req.companyId);
      const { rows } = await tx.query(
        `INSERT INTO attachments (company_id, record_instance_id, file_url, file_name,
                                  file_type, byte_size, checksum, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, file_url, file_type, uploaded_at`,
        [
          req.companyId,
          id,
          body.file_url,
          body.file_name ?? null,
          body.file_type,
          body.byte_size ?? null,
          body.checksum ?? null,
          req.user.id,
        ],
      );
      return rows[0];
    });

    return reply.code(201).send(row);
  });
}

interface LockedInstance {
  id: string;
  status: string;
  signature_requirement: string;
}

async function lockInstance(
  tx: import('../db.ts').Tx,
  id: string,
  companyId: string,
): Promise<LockedInstance> {
  const { rows } = await tx.query<LockedInstance>(
    `SELECT ri.id, ri.status, rt.signature_requirement
       FROM record_instances ri
       JOIN record_types rt ON rt.id = ri.record_type_id
      WHERE ri.id = $1 AND ri.company_id = $2
      FOR UPDATE OF ri`,
    [id, companyId],
  );
  if (!rows[0]) throw new HttpError(404, 'Registro inexistente');
  return rows[0];
}

/** Busca el bloque de firma en la versión del formulario con la que se cargó. */
async function findSignatureBlock(
  tx: import('../db.ts').Tx,
  instanceId: string,
  fieldKey: string,
): Promise<{ signer_role: string } | undefined> {
  const { rows } = await tx.query<{ signer_role: string }>(
    `SELECT f ->> 'signer_role' AS signer_role
       FROM record_instances ri
       JOIN record_type_versions rtv
         ON rtv.record_type_id = ri.record_type_id AND rtv.version = ri.record_type_version
       CROSS JOIN LATERAL jsonb_array_elements(rtv.field_schema) f
      WHERE ri.id = $1 AND f ->> 'type' = 'signature_block' AND f ->> 'key' = $2`,
    [instanceId, fieldKey],
  );
  return rows[0];
}

/**
 * Valida `data` contra el formulario congelado antes de intentar el cambio de
 * estado. Es la misma función que corre el trigger al enviar; se la llama acá
 * para que el error llegue en el orden correcto.
 */
async function assertDataComplete(tx: import('../db.ts').Tx, instanceId: string) {
  await tx.query(
    `SELECT sgs_validate_record_data(rtv.field_schema, ri.data)
       FROM record_instances ri
       JOIN record_type_versions rtv
         ON rtv.record_type_id = ri.record_type_id AND rtv.version = ri.record_type_version
      WHERE ri.id = $1`,
    [instanceId],
  );
}

/** No se envía a tierra un formulario al que le faltan firmas. */
async function assertSignaturesComplete(tx: import('../db.ts').Tx, instanceId: string) {
  const { rows } = await tx.query<{ field_key: string }>(
    `SELECT field_key FROM v_record_instance_signatures
      WHERE record_instance_id = $1 AND NOT is_signed`,
    [instanceId],
  );
  if (rows.length > 0) {
    throw new HttpError(422, `Faltan firmas: ${rows.map((r) => r.field_key).join(', ')}`);
  }
}

/**
 * `signature_requirement` del tipo de registro decide cómo se firma:
 *
 *   manuscrita  -> se dibuja la firma
 *   pin         -> se confirma con PIN, sin dibujo
 *   ambas       -> se dibuja la firma Y se confirma con PIN; queda una sola
 *                  firma (method = canvas) con `pin_verified` en la evidencia,
 *                  porque cada bloque del formulario admite una firma y no dos
 *   configurable_por_firmante -> lo elige quien firma
 *
 * Qué corresponde a cada tipo de registro es una definición pendiente de
 * confirmar con PNA (ver docs/03-esquema-sql.md §6).
 */
function resolveSignatureMethod(
  requirement: string,
  requested: 'canvas' | 'pin' | undefined,
): { method: 'canvas' | 'pin'; needsPin: boolean; needsImage: boolean } {
  switch (requirement) {
    case 'none':
      throw new HttpError(422, 'Este tipo de registro no lleva firma');
    case 'manuscrita':
      return { method: 'canvas', needsPin: false, needsImage: true };
    case 'pin':
      return { method: 'pin', needsPin: true, needsImage: false };
    case 'ambas':
      return { method: 'canvas', needsPin: true, needsImage: true };
    case 'configurable_por_firmante': {
      if (!requested) throw new HttpError(422, 'Indicá el método de firma: canvas o pin');
      return {
        method: requested,
        needsPin: requested === 'pin',
        needsImage: requested === 'canvas',
      };
    }
    default:
      throw new HttpError(500, `signature_requirement desconocido: ${requirement}`);
  }
}
