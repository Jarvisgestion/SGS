import type { FormData } from '../lib/schema.ts';
import { DRAFTS, idb } from './idb.ts';

/**
 * Un registro en preparación. Vive en el dispositivo hasta que se sincroniza;
 * `serverId` aparece recién cuando la instancia se creó en tierra.
 */
export interface Draft {
  localId: string;
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
  all: () => idb.getAll<Draft>(DRAFTS),
  get: (localId: string) => idb.get<Draft>(DRAFTS, localId),
  save: (draft: Draft) => idb.put(DRAFTS, { ...draft, updatedAt: new Date().toISOString() }),
  remove: (localId: string) => idb.delete(DRAFTS, localId),
};
