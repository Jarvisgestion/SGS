import { ARCHIVOS, idb } from './idb.ts';

/**
 * Archivos adjuntos guardados en el dispositivo.
 *
 * Una foto sacada fuera de cobertura no puede subirse en el momento, y tampoco
 * puede perderse: queda acá, referenciada desde el borrador como
 * `local:<id>`, y se sube junto con el resto cuando hay señal.
 */
export interface ArchivoLocal {
  ref: string; // "local:<uuid>"
  draftLocalId: string;
  fieldKey: string;
  nombre: string;
  tipo: string;
  contenido: Blob;
  creadoEn: string;
}

const PREFIJO = 'local:';

export function esReferenciaLocal(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.startsWith(PREFIJO);
}

export const archivos = {
  async guardar(draftLocalId: string, fieldKey: string, archivo: File): Promise<string> {
    const ref = `${PREFIJO}${crypto.randomUUID()}`;
    const registro: ArchivoLocal = {
      ref,
      draftLocalId,
      fieldKey,
      nombre: archivo.name || 'adjunto',
      tipo: archivo.type,
      contenido: archivo,
      creadoEn: new Date().toISOString(),
    };
    await idb.put(ARCHIVOS, registro);
    return ref;
  },

  obtener: (ref: string) => idb.get<ArchivoLocal>(ARCHIVOS, ref),

  /** Los que todavía no se subieron de ese borrador. */
  pendientes: (draftLocalId: string) =>
    idb.getAllPorIndice<ArchivoLocal>(ARCHIVOS, 'por_borrador', draftLocalId),

  borrar: (ref: string) => idb.delete(ARCHIVOS, ref),

  async borrarDeBorrador(draftLocalId: string) {
    for (const archivo of await archivos.pendientes(draftLocalId)) {
      await idb.delete(ARCHIVOS, archivo.ref);
    }
  },
};
