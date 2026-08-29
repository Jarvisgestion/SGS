import pg from 'pg';

/**
 * `numeric` y `bigint` llegan como string por defecto, porque pueden exceder
 * lo que un number representa con exactitud. En este dominio no: son
 * cantidades, horómetros, tamaños de archivo y conteos. Que salgan como número
 * evita que la API devuelva `"registros": "3"` en el JSON.
 */
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric
pg.types.setTypeParser(20, (v) => Number(v)); // int8 / bigint

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(connectionString?: string): Db {
  return new pg.Pool({ connectionString, max: 10 });
}

/**
 * Corre `fn` en una transacción declarando quién es el actor.
 *
 * El `SET LOCAL sgs.actor_user_id` es lo que permite que los triggers de
 * auditoría registren el autor de cada cambio (ver db/README.md). Toda
 * escritura de la API pasa por acá.
 */
export async function withTransaction<T>(
  db: Db,
  actorUserId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (actorUserId) {
      await client.query('SELECT set_config($1, $2, true)', ['sgs.actor_user_id', actorUserId]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
