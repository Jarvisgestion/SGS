import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { syncAll, syncDraft, type SyncDeps } from '../src/lib/sync.ts';
import type { Draft } from '../src/store/drafts.ts';

class SinSenal extends Error {}

function borrador(patch: Partial<Draft> = {}): Draft {
  return {
    localId: 'local-1',
    companyId: 'c1',
    recordTypeId: 'rt1',
    recordTypeCode: 'RE-01D',
    recordTypeName: 'Incendio',
    vesselId: 'v1',
    marea: null,
    occurredAt: '2026-08-28T10:00:00.000Z',
    data: { descripcion: 'humo en sala de máquinas' },
    serverId: null,
    dirty: true,
    signedKeys: [],
    updatedAt: '2026-08-28T10:00:00.000Z',
    ...patch,
  };
}

function deps(overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    createRecord: async () => ({ id: 'servidor-1' }),
    updateRecord: async () => undefined,
    isOffline: (err) => err instanceof SinSenal,
    ...overrides,
  };
}

describe('sincronización de un borrador', () => {
  it('la primera vez lo crea y guarda el id que dio tierra', async () => {
    const salida = await syncDraft(borrador(), deps());
    assert.equal(salida.result, 'synced');
    assert.equal(salida.draft.serverId, 'servidor-1');
    assert.equal(salida.draft.dirty, false);
  });

  it('si ya existe lo actualiza en vez de duplicarlo', async () => {
    let creados = 0;
    let actualizados = 0;
    const salida = await syncDraft(
      borrador({ serverId: 'servidor-1' }),
      deps({
        createRecord: async () => {
          creados++;
          return { id: 'otro' };
        },
        updateRecord: async () => {
          actualizados++;
        },
      }),
    );
    assert.equal(salida.result, 'synced');
    assert.equal(creados, 0);
    assert.equal(actualizados, 1);
  });

  it('no vuelve a subir un borrador sin cambios', async () => {
    let llamadas = 0;
    const salida = await syncDraft(
      borrador({ dirty: false, serverId: 'servidor-1' }),
      deps({
        updateRecord: async () => {
          llamadas++;
        },
      }),
    );
    assert.equal(salida.result, 'synced');
    assert.equal(llamadas, 0);
  });

  it('sin señal conserva el borrador tal cual para reintentar', async () => {
    const original = borrador();
    const salida = await syncDraft(
      original,
      deps({
        createRecord: async () => {
          throw new SinSenal();
        },
      }),
    );
    assert.equal(salida.result, 'offline');
    assert.equal(salida.draft, original);
    assert.equal(salida.draft.dirty, true);
  });

  it('si tierra lo rechaza guarda el motivo sin perder lo cargado', async () => {
    const salida = await syncDraft(
      borrador(),
      deps({
        createRecord: async () => {
          throw new Error('El usuario no tiene un rol habilitado para emitir RE-01D');
        },
      }),
    );
    assert.equal(salida.result, 'rejected');
    assert.equal(salida.draft.dirty, true);
    assert.match(salida.draft.lastError!, /rol habilitado/);
    assert.deepEqual(salida.draft.data, borrador().data);
  });
});

describe('sincronización de la cola', () => {
  it('corta al primer corte de señal y deja el resto pendiente', async () => {
    let intentos = 0;
    const lista = [borrador({ localId: 'a' }), borrador({ localId: 'b' }), borrador({ localId: 'c' })];
    const guardados: Draft[] = [];

    const tally = await syncAll(
      lista,
      deps({
        createRecord: async () => {
          intentos++;
          if (intentos === 2) throw new SinSenal();
          return { id: `servidor-${intentos}` };
        },
      }),
      async (d) => {
        guardados.push(d);
      },
    );

    assert.deepEqual(tally, { synced: 1, offline: 1, rejected: 0 });
    assert.equal(intentos, 2);
    assert.equal(guardados.length, 1);
  });

  it('un rechazo no frena a los demás borradores', async () => {
    let intentos = 0;
    const lista = [borrador({ localId: 'a' }), borrador({ localId: 'b' })];

    const tally = await syncAll(
      lista,
      deps({
        createRecord: async () => {
          intentos++;
          if (intentos === 1) throw new Error('rechazado');
          return { id: 'servidor-2' };
        },
      }),
      async () => {},
    );

    assert.deepEqual(tally, { synced: 1, offline: 0, rejected: 1 });
  });
});
