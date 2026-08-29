import type { FormData } from '../lib/schema.ts';
import { archivos } from './archivos.ts';
import { DRAFTS, idb } from './idb.ts';

/**
 * Un registro en preparación. Vive en el dispositivo hasta que se sincroniza;
 * `serverId` aparece recién cuando la instancia se creó en tierra.
 */
export interface Draft {
  localId: string;
  /**
   * Quién lo está cargando. IndexedDB es del dispositivo, no de la persona: en
   * una tablet compartida a bordo, sin esto el borrador del capitán le
   * aparecería al siguiente que entre — y al sincronizarlo, tierra lo
   * rechazaría por rol.
   */
  userId: string;
  companyId: string;
  recordTypeId: string;
  recordTypeCode: string;
  recordTypeName: string;
  vesselId: string | null;
  marea: string | null;
  occurredAt: string;
  data: FormData;
  serverId: string | null;
  /** Hay cambios locales sin subir. */
  dirty: boolean;
  /** Bloques de firma ya firmados en tierra (la firma exige conexión). */
  signedKeys: string[];
  updatedAt: string;
  /** Último error de sincronización, para mostrarlo sin perder el borrador. */
  lastError?: string;
}

export function newDraft(input: {
  userId: string;
  companyId: string;
  recordTypeId: string;
  recordTypeCode: string;
  recordTypeName: string;
  vesselId: string | null;
  data: FormData;
}): Draft {
  return {
    localId: crypto.randomUUID(),
    marea: null,
    occurredAt: new Date().toISOString(),
    serverId: null,
    dirty: true,
    signedKeys: [],
    updatedAt: new Date().toISOString(),
    ...input,
  };
}

export const drafts = {
  /** Sólo los de esa persona: el almacenamiento es compartido, los borradores no. */
  all: async (userId: string) => (await idb.getAll<Draft>(DRAFTS)).filter((d) => d.userId === userId),
  get: (localId: string) => idb.get<Draft>(DRAFTS, localId),
  save: (draft: Draft) => idb.put(DRAFTS, { ...draft, updatedAt: new Date().toISOString() }),
  /** Borrar el borrador se lleva también sus archivos: no dejan de tener dueño. */
  async remove(localId: string) {
    await archivos.borrarDeBorrador(localId);
    await idb.delete(DRAFTS, localId);
  },
};
