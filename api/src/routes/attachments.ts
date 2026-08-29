import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../errors.ts';

const idParam = z.object({ id: z.string().uuid() });

/**
 * El nombre del archivo lo eligió quien subió: va a una cabecera HTTP, así que
 * se reduce a un conjunto seguro en vez de sacarle unos pocos caracteres.
 */
function nombreSeguro(nombre: string | null): string {
  const limpio = (nombre ?? '').replace(/[^A-Za-z0-9._ -]/g, '_').trim().slice(0, 100);
  return limpio || 'adjunto';
}

export async function attachmentRoutes(app: FastifyInstance) {
  /**
   * Descarga de un adjunto. Va por la API y no por una URL pública del
   * almacenamiento: un parte médico o la foto de un accidente no deberían
   * quedar accesibles para cualquiera que tenga el enlace.
   */
  app.get('/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);

    const { rows } = await app.db.query<{
      storage_key: string | null;
      file_url: string | null;
      file_name: string | null;
      content_type: string | null;
    }>(
      `SELECT storage_key, file_url, file_name, content_type
         FROM attachments WHERE id = $1 AND company_id = $2`,
      [id, req.companyId],
    );
    const adjunto = rows[0];
    if (!adjunto) throw new HttpError(404, 'Adjunto inexistente');

    if (!adjunto.storage_key) {
      // Adjunto que es un enlace externo: no hay nada que servir desde acá.
      return reply.send({ file_url: adjunto.file_url });
    }

    reply.header('content-type', adjunto.content_type ?? 'application/octet-stream');
    reply.header('content-disposition', `inline; filename="${nombreSeguro(adjunto.file_name)}"`);
    // El contenido es inmutable: la clave es el hash de lo que hay adentro.
    reply.header('cache-control', 'private, max-age=31536000, immutable');
    return reply.send(await app.almacenamiento.abrir(adjunto.storage_key));
  });
}
