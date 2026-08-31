import { Router, raw } from 'express';
import { withTenant, type Tx } from '../db.js';
import { config } from '../config.js';
import * as storage from '../storage.js';
import { requireAuth, verifySecret, type SessionUser } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

export const recordsRouter: Router = Router();
recordsRouter.use(requireAuth);

const user = (req: { user?: SessionUser }): SessionUser => req.user!;

async function loadInstance(tx: Tx, id: string) {
  const { rows } = await tx.query(
    // Se traen también los datos del encabezado del MGS (empresa, revisión del
    // manual, versión del formulario) porque la vista de impresión tiene que
    // reproducir el formulario en papel, no solo los datos cargados.
    `SELECT ri.*, rtc.record_code, rtc.record_name, rtc.procedure_code,
            rtc.procedure_name, rtc.scope, rtc.signature_requirement,
            rtc.allowed_reviewer_roles, rtv.field_schema, rtv.version AS form_version,
            rtv.requires_signed_attachment,
            v.name AS vessel_name, v.matricula, cu.full_name AS created_by_name,
            c.name AS company_name, mv.revision_number AS manual_revision,
            mv.regulation_reference, mv.effective_date AS manual_effective_date
       FROM record_instances ri
       JOIN v_record_type_current rtc ON rtc.record_type_id = ri.record_type_id
       JOIN record_type_versions rtv  ON rtv.id = ri.record_type_version_id
       JOIN record_types rt ON rt.id = ri.record_type_id
       JOIN procedures p ON p.id = rt.procedure_id
       JOIN manual_versions mv ON mv.id = p.manual_version_id
       JOIN companies c ON c.id = ri.company_id
       JOIN users cu ON cu.id = ri.created_by
       LEFT JOIN vessels v ON v.id = ri.vessel_id
      WHERE ri.id = $1`,
    [id],
  );
  return rows[0];
}

/** Listado con filtros. Sin filtro de empresa: eso lo hace RLS. */
recordsRouter.get('/records', wrap(async (req, res) => {
  const u = user(req);
  const { status, vesselId, recordTypeId, mine } = req.query as Record<string, string | undefined>;
  const rows = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT ri.id, ri.status, ri.occurred_at, ri.marea, ri.submitted_at, ri.created_at,
              rtc.record_code, rtc.record_name, rtc.procedure_code,
              v.name AS vessel_name, cu.full_name AS created_by_name,
              ri.parent_record_instance_id
         FROM record_instances ri
         JOIN v_record_type_current rtc ON rtc.record_type_id = ri.record_type_id
         JOIN users cu ON cu.id = ri.created_by
         LEFT JOIN vessels v ON v.id = ri.vessel_id
        WHERE ($1::text IS NULL OR ri.status = $1)
          AND ($2::uuid IS NULL OR ri.vessel_id = $2)
          AND ($3::uuid IS NULL OR ri.record_type_id = $3)
          AND ($4::uuid IS NULL OR ri.created_by = $4)
        ORDER BY ri.occurred_at DESC
        LIMIT 200`,
      [status ?? null, vesselId ?? null, recordTypeId ?? null, mine === 'true' ? u.id : null],
    );
    return rows;
  });
  res.json({ records: rows });
}));

recordsRouter.get('/records/:id', wrap(async (req, res) => {
  const u = user(req);
  const data = await withTenant(u.companyId, u.id, async (tx) => {
    const instance = await loadInstance(tx, req.params.id!);
    if (!instance) return null;
    const { rows: reviews } = await tx.query(
      `SELECT rr.decision, rr.comment, rr.reviewed_at, ru.full_name AS reviewer_name
         FROM record_reviews rr JOIN users ru ON ru.id = rr.reviewer_id
        WHERE rr.record_instance_id = $1 ORDER BY rr.reviewed_at`,
      [req.params.id],
    );
    const { rows: signatures } = await tx.query(
      `SELECT s.signer_role, s.field_key, s.method, s.signed_at,
              coalesce(su.full_name, s.signer_name) AS signer_name
         FROM signatures s LEFT JOIN users su ON su.id = s.signer_user_id
        WHERE s.record_instance_id = $1 ORDER BY s.signed_at`,
      [req.params.id],
    );
    const { rows: attachments } = await tx.query(
      `SELECT a.id, a.kind, a.file_name, a.mime_type, a.byte_size, a.uploaded_at,
              a.checksum_sha256, u.full_name AS uploaded_by_name,
              (a.storage_key IS NOT NULL) AS descargable
         FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
        WHERE a.record_instance_id = $1 ORDER BY a.uploaded_at`,
      [req.params.id],
    );
    const { rows: backing } = await tx.query(
      `SELECT requires_signed_attachment, signed_attachments, backing_status
         FROM v_record_backing WHERE record_instance_id = $1`,
      [req.params.id],
    );
    const { rows: children } = await tx.query(
      `SELECT ri.id, rtc.record_code, ri.status
         FROM record_instances ri
         JOIN v_record_type_current rtc ON rtc.record_type_id = ri.record_type_id
        WHERE ri.parent_record_instance_id = $1`,
      [req.params.id],
    );
    return { instance, reviews, signatures, children, attachments, backing: backing[0] };
  });
  if (!data) throw new HttpError(404, 'Registro inexistente');

  const i = data.instance;
  res.json({
    id: i.id,
    recordTypeId: i.record_type_id,
    versionId: i.record_type_version_id,
    code: i.record_code,
    name: i.record_name,
    procedureCode: i.procedure_code,
    procedureName: i.procedure_name,
    formVersion: i.form_version,
    scope: i.scope,
    // Encabezado del formulario impreso
    companyName: i.company_name,
    manualRevision: i.manual_revision,
    regulationReference: i.regulation_reference,
    manualEffectiveDate: i.manual_effective_date,
    matricula: i.matricula,
    singladura: i.singladura,
    signatureRequirement: i.signature_requirement,
    fieldSchema: i.field_schema,
    vesselId: i.vessel_id,
    vesselName: i.vessel_name,
    marea: i.marea,
    occurredAt: i.occurred_at,
    data: i.data,
    status: i.status,
    parentId: i.parent_record_instance_id,
    createdByName: i.created_by_name,
    createdAt: i.created_at,
    submittedAt: i.submitted_at,
    canReview: i.allowed_reviewer_roles.length === 0
      || i.allowed_reviewer_roles.some((r: string) => u.roles.includes(r)),
    reviews: data.reviews,
    signatures: data.signatures,
    children: data.children,
    attachments: data.attachments,
    // Mientras PNA no habilite la firma digital, el respaldo válido es el papel
    // firmado: la interfaz necesita saber si falta antes de ofrecer aprobar.
    requiresSignedAttachment: data.backing?.requires_signed_attachment ?? false,
    backingStatus: data.backing?.backing_status ?? 'no_requiere',
  });
}));

/**
 * Alta de un registro. `clientUuid` lo genera el dispositivo al abrir el borrador
 * local: si la señal se corta durante el envío y el buque reintenta, la restricción
 * única de la base devuelve 409 en vez de duplicar el registro.
 */
recordsRouter.post('/records', wrap(async (req, res) => {
  const u = user(req);
  const { recordTypeId, vesselId, occurredAt, marea, singladura, data, clientUuid, parentId, submit } =
    req.body ?? {};
  if (!recordTypeId) throw new HttpError(400, 'Falta recordTypeId');

  const created = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows: rt } = await tx.query(
      `SELECT current_version_id FROM v_record_type_current WHERE record_type_id = $1`,
      [recordTypeId],
    );
    if (!rt[0]) throw new HttpError(404, 'Tipo de registro inexistente');

    const { rows } = await tx.query(
      `INSERT INTO record_instances
         (company_id, record_type_id, record_type_version_id, vessel_id, marea, singladura,
          occurred_at, data, status, created_by, client_uuid, parent_record_instance_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz, now()),coalesce($8::jsonb,'{}'::jsonb),
               $9,$10,$11,$12, now())
       RETURNING id, status`,
      [u.companyId, recordTypeId, rt[0].current_version_id, vesselId ?? null, marea ?? null,
       singladura ?? null, occurredAt ?? null, data ? JSON.stringify(data) : null,
       submit ? 'pendiente_revision' : 'borrador', u.id, clientUuid ?? null, parentId ?? null],
    );
    return rows[0];
  });
  res.status(201).json(created);
}));

/** Edición del borrador. La base rechaza editar lo ya aprobado. */
recordsRouter.patch('/records/:id', wrap(async (req, res) => {
  const u = user(req);
  const { data, marea, singladura, occurredAt } = req.body ?? {};
  const updated = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE record_instances
          SET data = coalesce($2::jsonb, data),
              marea = coalesce($3, marea),
              singladura = coalesce($4, singladura),
              occurred_at = coalesce($5::timestamptz, occurred_at)
        WHERE id = $1
        RETURNING id, status`,
      [req.params.id, data ? JSON.stringify(data) : null, marea ?? null,
       singladura ?? null, occurredAt ?? null],
    );
    return rows[0];
  });
  if (!updated) throw new HttpError(404, 'Registro inexistente');
  res.json(updated);
}));

/** Envío a revisión: borrador -> pendiente_revision. */
recordsRouter.post('/records/:id/submit', wrap(async (req, res) => {
  const u = user(req);
  const updated = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE record_instances SET status = 'pendiente_revision', synced_at = now()
        WHERE id = $1 RETURNING id, status, submitted_at`,
      [req.params.id],
    );
    return rows[0];
  });
  if (!updated) throw new HttpError(404, 'Registro inexistente');
  res.json(updated);
}));

/** Reapertura de un registro observado, para corregirlo a bordo. */
recordsRouter.post('/records/:id/reopen', wrap(async (req, res) => {
  const u = user(req);
  const updated = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE record_instances SET status = 'borrador' WHERE id = $1 RETURNING id, status`,
      [req.params.id],
    );
    return rows[0];
  });
  if (!updated) throw new HttpError(404, 'Registro inexistente');
  res.json(updated);
}));

/** Revisión desde tierra. El trigger de la base mueve el estado de la instancia. */
recordsRouter.post('/records/:id/review', wrap(async (req, res) => {
  const u = user(req);
  const { decision, comment } = req.body ?? {};
  if (decision !== 'aprobado' && decision !== 'observado') {
    throw new HttpError(400, 'decision debe ser "aprobado" u "observado"');
  }
  const result = await withTenant(u.companyId, u.id, async (tx) => {
    await tx.query(
      `INSERT INTO record_reviews (record_instance_id, company_id, reviewer_id, decision, comment)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.params.id, u.companyId, u.id, decision, comment ?? null],
    );
    const { rows } = await tx.query(`SELECT id, status FROM record_instances WHERE id = $1`, [req.params.id]);
    return rows[0];
  });
  res.json(result);
}));

/**
 * Firma de un registro.
 *
 * El esquema guarda `signature_requirement` por tipo de registro pero todavía no
 * lo hace cumplir, porque el criterio depende de qué evidencia acepta PNA
 * (docs/03, punto abierto 4). Acá se valida lo que sí está definido: el PIN es
 * realmente el del usuario, y la firma manuscrita trae imagen.
 */
recordsRouter.post('/records/:id/signatures', wrap(async (req, res) => {
  const u = user(req);
  const { signerRole, fieldKey, method, pin, signatureImage, signerName, signerDni } = req.body ?? {};
  if (!signerRole || !method) throw new HttpError(400, 'Faltan signerRole y method');

  if (method === 'pin') {
    const [row] = await withTenant(u.companyId, u.id, async (tx) => {
      const { rows } = await tx.query(`SELECT pin_hash FROM users WHERE id = $1`, [u.id]);
      return rows;
    });
    if (!verifySecret(String(pin ?? ''), row?.pin_hash ?? null)) {
      throw new HttpError(403, 'PIN incorrecto');
    }
  }

  const signature = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO signatures (company_id, record_instance_id, signer_user_id, signer_name,
                               signer_dni, signer_role, field_key, method, signature_image_url,
                               device_metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, signed_at`,
      [u.companyId, req.params.id, signerName ? null : u.id, signerName ?? null,
       signerDni ?? null, signerRole, fieldKey ?? null, method,
       method === 'canvas' ? (signatureImage ?? null) : null,
       JSON.stringify({ userAgent: req.header('user-agent') ?? null })],
    );
    return rows[0];
  });
  res.status(201).json(signature);
}));


// ---------------------------------------------------------------------------
// Adjuntos: el formulario en papel firmado a mano
// ---------------------------------------------------------------------------
// Mientras PNA no habilite la firma digital, este archivo —no los datos del
// formulario ni la firma en pantalla— es la evidencia válida del registro.
//
// El cuerpo llega como binario crudo (sin multipart) para no sumar una
// dependencia: el navegador manda el File tal cual y el nombre va por query.

recordsRouter.post(
  '/records/:id/attachments',
  raw({ type: storage.tiposAceptados, limit: config.maxAttachmentBytes }),
  wrap(async (req, res) => {
    const u = user(req);
    const mimeType = (req.header('content-type') ?? '').split(';')[0]!.trim();
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      storage.validarTipo(mimeType); // da el mensaje preciso si el tipo es el problema
      throw new HttpError(400, 'No llegó el contenido del archivo.');
    }
    const kind = String(req.query.kind ?? 'formulario_firmado');
    const fileName = String(req.query.fileName ?? `adjunto.${mimeType.split('/')[1]}`);

    const archivo = await storage.guardar(req.body, mimeType);
    try {
      const fila = await withTenant(u.companyId, u.id, async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO attachments (company_id, record_instance_id, storage_key, file_name,
                                    file_type, mime_type, byte_size, checksum_sha256,
                                    kind, uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id, kind, file_name, byte_size, uploaded_at, checksum_sha256`,
          [u.companyId, req.params.id, archivo.storageKey, fileName, archivo.fileType,
           archivo.mimeType, archivo.byteSize, archivo.checksum, kind, u.id],
        );
        return rows[0];
      });
      res.status(201).json(fila);
    } catch (err) {
      // Si la base rechaza la fila (registro aprobado, registro de otra empresa),
      // el archivo en disco quedaría huérfano.
      await storage.borrar(archivo.storageKey).catch(() => undefined);
      throw err;
    }
  }),
);

recordsRouter.get('/records/:id/attachments', wrap(async (req, res) => {
  const u = user(req);
  const rows = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT a.id, a.kind, a.file_name, a.mime_type, a.byte_size, a.uploaded_at,
              a.checksum_sha256, u.full_name AS uploaded_by_name,
              (a.storage_key IS NOT NULL) AS descargable
         FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
        WHERE a.record_instance_id = $1 ORDER BY a.uploaded_at`,
      [req.params.id],
    );
    return rows;
  });
  res.json({ attachments: rows });
}));

recordsRouter.get('/attachments/:id', wrap(async (req, res) => {
  const u = user(req);
  // La consulta no filtra por empresa: RLS ya impide ver el adjunto de otra.
  const fila = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `SELECT storage_key, file_name, mime_type, file_type FROM attachments WHERE id = $1`,
      [req.params.id],
    );
    return rows[0];
  });
  if (!fila) throw new HttpError(404, 'Adjunto inexistente');
  if (!fila.storage_key) {
    throw new HttpError(404, 'Este adjunto es de demostración y no tiene archivo asociado');
  }

  const contenido = await storage.leer(fila.storage_key);
  res.setHeader('content-type', fila.mime_type ?? 'application/octet-stream');
  res.setHeader('content-disposition',
    `inline; filename="${(fila.file_name ?? 'adjunto').replace(/"/g, '')}"`);
  res.send(contenido);
}));

recordsRouter.delete('/attachments/:id', wrap(async (req, res) => {
  const u = user(req);
  // El trigger de la base rechaza borrar adjuntos de un registro aprobado.
  const fila = await withTenant(u.companyId, u.id, async (tx) => {
    const { rows } = await tx.query(
      `DELETE FROM attachments WHERE id = $1 RETURNING storage_key`,
      [req.params.id],
    );
    return rows[0];
  });
  if (!fila) throw new HttpError(404, 'Adjunto inexistente');
  if (fila.storage_key) await storage.borrar(fila.storage_key).catch(() => undefined);
  res.status(204).end();
}));
