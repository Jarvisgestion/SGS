/**
 * Aplica las migraciones del esquema.
 *
 *   npm run migrate            # sólo migraciones
 *   npm run migrate -- --seed  # además el catálogo base y el de demostración
 *
 * Está en Node y no en psql para que el despliegue no dependa de tener el
 * cliente de PostgreSQL instalado en la imagen. `scripts/db-apply.sh` llama
 * a esto mismo, así que hay una sola implementación.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createPool } from '../db.ts';

const { values } = parseArgs({ options: { seed: { type: 'boolean', default: false } } });

const RAIZ = path.resolve(import.meta.dirname, '..', '..', '..');
const MIGRACIONES = path.join(RAIZ, 'db', 'migrations');
const SEMILLAS = path.join(RAIZ, 'db', 'seed');

const db = createPool(process.env.DATABASE_URL);

try {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  console.log('Migraciones:');
  await aplicar(MIGRACIONES, true);

  if (values.seed) {
    console.log('Seed:');
    await aplicar(SEMILLAS, false);
  }
  console.log('Listo.');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.end();
}

async function aplicar(carpeta: string, registrar: boolean) {
  for (const archivo of readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(carpeta, archivo), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    if (registrar) {
      const { rows } = await db.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE filename = $1',
        [archivo],
      );
      if (rows[0]) {
        if (rows[0].checksum !== checksum) {
          throw new Error(
            `${archivo} ya fue aplicada pero su contenido cambió.\n` +
              '       Las migraciones son inmutables: creá una nueva en vez de editarla.',
          );
        }
        console.log(`  = ${archivo} (ya aplicada)`);
        continue;
      }
    }

    console.log(`  + ${archivo}`);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      if (registrar) {
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [archivo, checksum],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`${archivo}: ${err instanceof Error ? err.message : err}`);
    } finally {
      client.release();
    }
  }
}
