import { z } from 'zod';

/**
 * Booleano de query string.
 *
 * `z.coerce.boolean()` no sirve para esto: hace `Boolean("false")`, que es
 * `true`. Cualquier texto no vacío quedaba en verdadero, así que un
 * `?only_pending=false` significaba lo contrario de lo que decía.
 */
export const booleanoDeQuery = (porDefecto = false) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((valor) => {
      if (valor === undefined || valor === '') return porDefecto;
      if (typeof valor === 'boolean') return valor;
      return ['true', '1', 'si', 'sí'].includes(valor.toLowerCase());
    });
