/**
 * Sincronización de borradores. Separado de IndexedDB y de React a propósito:
 * es la parte con reglas y se prueba sin navegador (client/test/sync.test.ts).
 */
import type { Draft } from '../store/drafts.ts';
import type { FormData } from './schema.ts';

export interface SyncDeps {
  createRecord(body: {
    record_type_id: string;
    vessel_id?: string | null;
    occurred_at?: string;
    marea?: string | null;
    data: FormData;
  }): Promise<{ id: string }>;
  updateRecord(
    id: string,
    body: { data?: FormData; marea?: string | null; occurred_at?: string },
  ): Promise<unknown>;
  isOffline(err: unknown): boolean;
}

export type SyncOutcome =
  | { draft: Draft; result: 'synced' }
  | { draft: Draft; result: 'offline' }
  | { draft: Draft; result: 'rejected'; error: string };

/**
 * Sube un borrador. La primera vez lo crea; después lo actualiza.
 *
 * Un error de red deja el borrador intacto y marcado como sucio, para
 * reintentar. Un rechazo del servidor (datos inválidos, permisos) también lo
 * conserva: nunca se pierde lo que la tripulación cargó, se muestra el motivo.
 */
export async function syncDraft(draft: Draft, deps: SyncDeps): Promise<SyncOutcome> {
  if (!draft.dirty) return { draft, result: 'synced' };

  try {
    if (!draft.serverId) {
      const created = await deps.createRecord({
        record_type_id: draft.recordTypeId,
        vessel_id: draft.vesselId,
        occurred_at: draft.occurredAt,
        marea: draft.marea,
        data: draft.data,
      });
      return {
        draft: { ...draft, serverId: created.id, dirty: false, lastError: undefined },
        result: 'synced',
      };
    }

    await deps.updateRecord(draft.serverId, {
      data: draft.data,
      marea: draft.marea,
      occurred_at: draft.occurredAt,
    });
    return { draft: { ...draft, dirty: false, lastError: undefined }, result: 'synced' };
  } catch (err) {
    if (deps.isOffline(err)) return { draft, result: 'offline' };
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { draft: { ...draft, lastError: message }, result: 'rejected', error: message };
  }
}

export async function syncAll(
  list: Draft[],
  deps: SyncDeps,
  persist: (draft: Draft) => Promise<unknown>,
): Promise<{ synced: number; offline: number; rejected: number }> {
  const tally = { synced: 0, offline: 0, rejected: 0 };

  for (const draft of list) {
    const outcome = await syncDraft(draft, deps);
    if (outcome.draft !== draft) await persist(outcome.draft);
    tally[outcome.result === 'synced' ? 'synced' : outcome.result]++;
    // Sin señal no tiene sentido seguir intentando con el resto.
    if (outcome.result === 'offline') break;
  }
  return tally;
}
