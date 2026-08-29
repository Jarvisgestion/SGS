/**
 * Exportación e importación del catálogo de una empresa.
 *
 * Es lo que permite preparar el manual de una empresa como un archivo —
 * revisable, versionable, comparable entre revisiones — en vez de cargar
 * cuarenta formularios a mano en la pantalla. También sirve para arrancar el
 * catálogo de una empresa a partir del de otra.
 *
 * Los nombres del archivo son los mismos que los de la base a propósito: el
 * formato es un reflejo del catálogo, no una traducción con la que después haya
 * que pelear.
 */
import { z } from 'zod';
import type { Db, Tx } from './db.ts';

export const FORMATO = 'sgs.catalogo/1';

const campo = z.object({ key: z.string(), type: z.string() }).passthrough();

export const catalogoSchema = z.object({
  formato: z.literal(FORMATO),
  revision_number: z.string().min(1),
  regulation: z.string().nullish(),
  procedures: z.array(
    z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      sort_order: z.number().int().default(0),
      record_types: z.array(
        z.object({
          code: z.string().min(1),
          name: z.string().min(1),
          category: z.string(),
          scope: z.string().default('vessel'),
          recurrence_type: z.string().default('on_event'),
          recurrence_days: z.number().int().nullish(),
          allowed_creator_roles: z.array(z.string()).default([]),
          allowed_reviewer_roles: z.array(z.string()).default([]),
          signature_requirement: z.string().default('configurable_por_firmante'),
          field_schema: z.array(campo).default([]),
        }),
      ),
    }),
  ),
});

export type Catalogo = z.infer<typeof catalogoSchema>;

/** Exporta lo vigente de una revisión: lo derogado no se lleva. */
export async function exportarCatalogo(
  db: Db,
  manualVersionId: string,
  companyId: string,
): Promise<Catalogo | null> {
  const { rows } = await db.query<{ catalogo: Catalogo }>(
    `SELECT json_build_object(
              'formato', $3::text,
              'revision_number', mv.revision_number,
              'regulation', mv.regulation,
              'procedures', COALESCE((
                SELECT json_agg(json_build_object(
                         'code', p.code,
                         'name', p.name,
                         'sort_order', p.sort_order,
                         'record_types', COALESCE((
                           SELECT json_agg(json_build_object(
                                    'code', rt.code,
                                    'name', rt.name,
                                    'category', rt.category,
                                    'scope', rt.scope,
                                    'recurrence_type', rt.recurrence_type,
                                    'recurrence_days', rt.recurrence_days,
                                    'allowed_creator_roles', rt.allowed_creator_roles,
                                    'allowed_reviewer_roles', rt.allowed_reviewer_roles,
                                    'signature_requirement', rt.signature_requirement,
                                    'field_schema', rt.field_schema)
                                  ORDER BY rt.code)
                             FROM record_types rt
                            WHERE rt.procedure_id = p.id AND rt.status = 'vigente'
                         ), '[]'::json))
                       ORDER BY p.sort_order, p.code)
                  FROM procedures p
                 WHERE p.manual_version_id = mv.id AND p.status = 'vigente'
              ), '[]'::json)
            ) AS catalogo
       FROM manual_versions mv
      WHERE mv.id = $1 AND mv.company_id = $2`,
    [manualVersionId, companyId, FORMATO],
  );
  return rows[0]?.catalogo ?? null;
}

export interface ResultadoImportacion {
  manual_version_id: string;
  revision_number: string;
  procedimientos: number;
  formularios: number;
}

/**
 * Crea una revisión nueva a partir del archivo. Nace en borrador: importar no
 * cambia lo que rige hasta que alguien la ponga en vigencia.
 *
 * La validación de fondo la hace la base —que los campos sean válidos, que los
 * roles existan, que un `triggers_record_type` apunte a un registro del mismo
 * manual—, así que un archivo mal armado se rechaza con el motivo concreto.
 */
export async function importarCatalogo(
  tx: Tx,
  companyId: string,
  catalogo: Catalogo,
  revisionOverride?: string,
): Promise<ResultadoImportacion> {
  // El catálogo entra completo de una: un formulario puede referenciar a otro
  // que todavía no se insertó.
  await tx.query('SET CONSTRAINTS ALL DEFERRED');

  const revision = revisionOverride ?? catalogo.revision_number;
  const { rows: manuales } = await tx.query<{ id: string }>(
    `INSERT INTO manual_versions (company_id, revision_number, regulation)
     VALUES ($1, $2, $3) RETURNING id`,
    [companyId, revision, catalogo.regulation ?? null],
  );
  const manualId = manuales[0]!.id;

  let formularios = 0;
  for (const procedimiento of catalogo.procedures) {
    const { rows: procs } = await tx.query<{ id: string }>(
      `INSERT INTO procedures (manual_version_id, company_id, code, name, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [manualId, companyId, procedimiento.code, procedimiento.name, procedimiento.sort_order],
    );

    for (const registro of procedimiento.record_types) {
      await tx.query(
        `INSERT INTO record_types
           (procedure_id, company_id, code, name, category, scope, recurrence_type,
            recurrence_days, allowed_creator_roles, allowed_reviewer_roles,
            signature_requirement, field_schema)
         VALUES ($1, $2, $3, $4, $5::record_category, $6::record_scope, $7::recurrence_type,
                 $8, $9, $10, $11::signature_requirement, $12::jsonb)`,
        [
          procs[0]!.id,
          companyId,
          registro.code,
          registro.name,
          registro.category,
          registro.scope,
          registro.recurrence_type,
          registro.recurrence_days ?? null,
          registro.allowed_creator_roles,
          registro.allowed_reviewer_roles,
          registro.signature_requirement,
          JSON.stringify(registro.field_schema),
        ],
      );
      formularios++;
    }
  }

  return {
    manual_version_id: manualId,
    revision_number: revision,
    procedimientos: catalogo.procedures.length,
    formularios,
  };
}
