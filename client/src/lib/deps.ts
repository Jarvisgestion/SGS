import { archivos } from '../store/archivos.ts';
import { api, OfflineError } from './api.ts';
import type { SyncDeps } from './sync.ts';

/**
 * Cómo sincroniza la app de verdad. Está separado de `sync.ts` para que la
 * lógica de sincronización se pueda probar sin red ni IndexedDB.
 */
export const dependenciasDeSync: SyncDeps = {
  createRecord: api.createRecord,
  updateRecord: api.updateRecord,
  isOffline: (err) => err instanceof OfflineError,
  archivosPendientes: async (draft) =>
    (await archivos.pendientes(draft.localId)).map((a) => ({
      ref: a.ref,
      fieldKey: a.fieldKey,
      nombre: a.nombre,
      contenido: a.contenido,
    })),
  subirArchivo: (recordId, archivo, nombre) => api.subirAdjunto(recordId, archivo, nombre),
  archivoSubido: (ref) => archivos.borrar(ref),
};
