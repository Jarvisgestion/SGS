import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export type Tx = pg.PoolClient;

/**
 * Corre `fn` dentro de una transacción con el contexto de empresa y usuario fijado.
 *
 * Es el único camino por el que la aplicación toca datos operativos. Las políticas
 * de Row Level Security del esquema leen `sgs.current_company_id`: si no está
 * seteado, no devuelven ninguna fila. Es decir, un olvido acá no filtra datos de
 * otra empresa, simplemente no ve nada.
 *
 * `sgs.current_user_id` es lo que el trigger de auditoría asienta como autor.
 */
export async function withTenant<T>(
  companyId: string | null,
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['sgs.current_company_id', companyId ?? '']);
    await client.query('SELECT set_config($1, $2, true)', ['sgs.current_user_id', userId ?? '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Consulta sin contexto de empresa. Solo para login, que es previo a conocerla. */
export async function queryUnscoped<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(sql, params);
  return res.rows;
}
