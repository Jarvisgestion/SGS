/**
 * Catálogo de una empresa, como archivo.
 *
 *   # sacar el catálogo vigente a un archivo
 *   npm run catalogo -- --exportar --empresa "Pesquera Chiarmar" > chiarmar.json
 *
 *   # cargarlo en otra empresa, como revisión nueva en borrador
 *   npm run catalogo -- --importar chiarmar.json --empresa "Xeitosiño S.A." --revision "Rev. 01"
 *
 * Es la forma práctica de preparar el manual de una empresa: se arma el archivo
 * una vez, se revisa como cualquier documento, y se carga. Cargar no cambia lo
 * que rige: la revisión entra en borrador.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { catalogoSchema, exportarCatalogo, importarCatalogo } from '../catalogo.ts';
import { createPool, withTransaction, type Db } from '../db.ts';

const { values } = parseArgs({
  options: {
    exportar: { type: 'boolean', default: false },
    importar: { type: 'string' },
    empresa: { type: 'string' },
    revision: { type: 'string' },
  },
});

const db = createPool(process.env.DATABASE_URL);

try {
  if (values.exportar) await exportar(db);
  else if (values.importar) await importar(db, values.importar);
  else throw new Error('Usá --exportar o --importar <archivo>. Ver el encabezado de este archivo.');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.end();
}

async function exportar(db: Db) {
  const empresa = await resolverEmpresa(db);
  const { rows } = await db.query<{ id: string; revision_number: string }>(
    values.revision
      ? `SELECT id, revision_number FROM manual_versions
          WHERE company_id = $1 AND revision_number = $2`
      : `SELECT id, revision_number FROM manual_versions
          WHERE company_id = $1 AND status = 'vigente'`,
    values.revision ? [empresa.id, values.revision] : [empresa.id],
  );
  if (!rows[0]) {
    throw new Error(
      values.revision
        ? `${empresa.name} no tiene la revisión "${values.revision}"`
        : `${empresa.name} no tiene ninguna revisión vigente; indicá cuál con --revision`,
    );
  }

  const catalogo = await exportarCatalogo(db, rows[0].id, empresa.id);
  // Al stdout, para poder redirigirlo a un archivo o encadenarlo.
  console.log(JSON.stringify(catalogo, null, 2));
  console.error(`Exportada ${rows[0].revision_number} de ${empresa.name}.`);
}

async function importar(db: Db, archivo: string) {
  const empresa = await resolverEmpresa(db);
  const catalogo = catalogoSchema.parse(JSON.parse(readFileSync(archivo, 'utf8')));

  const resultado = await withTransaction(db, null, (tx) =>
    importarCatalogo(tx, empresa.id, catalogo, values.revision),
  );

  console.log(
    `${resultado.revision_number} cargada en ${empresa.name}: ` +
      `${resultado.procedimientos} procedimientos, ${resultado.formularios} formularios.\n` +
      'Queda en borrador: revisala y ponela en vigencia desde la aplicación.',
  );
}

async function resolverEmpresa(db: Db) {
  const { rows } = await db.query<{ id: string; name: string }>(
    values.empresa
      ? `SELECT id, name FROM companies WHERE id::text = $1 OR name ILIKE '%' || $1 || '%'`
      : `SELECT id, name FROM companies WHERE status = 'activo'`,
    values.empresa ? [values.empresa] : [],
  );

  if (rows.length === 1) return rows[0]!;
  if (rows.length === 0) throw new Error('No encontramos esa empresa');
  throw new Error(
    `Hay varias empresas, indicá cuál con --empresa:\n${rows.map((c) => `  - ${c.name}`).join('\n')}`,
  );
}
