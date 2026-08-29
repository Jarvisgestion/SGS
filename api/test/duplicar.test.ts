import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  auth,
  createUser,
  DEMO_COMPANY,
  DEMO_VESSEL,
  login,
  setupApi,
  teardownApi,
  type TestContext,
} from './helpers.ts';

let ctx: TestContext;
let pdToken: string;
let capitanToken: string;
let rev04: string;

before(async () => {
  ctx = await setupApi();
  pdToken = await login(
    ctx.app,
    await createUser(ctx.db, {
      companyId: DEMO_COMPANY,
      fullName: 'Persona Designada',
      email: 'pd@duplicar.test',
      role: 'persona_designada',
    }),
  );
  capitanToken = await login(
    ctx.app,
    await createUser(ctx.db, {
      companyId: DEMO_COMPANY,
      fullName: 'Capitán',
      email: 'capitan@duplicar.test',
      role: 'capitan',
      vesselId: DEMO_VESSEL,
    }),
  );

  const { rows } = await ctx.db.query<{ id: string }>(
    "SELECT id FROM manual_versions WHERE revision_number = 'Rev. 04'",
  );
  rev04 = rows[0]!.id;
});

after(async () => {
  await teardownApi(ctx);
});

describe('duplicar una revisión del manual', () => {
  let rev05: string;

  it('deroga un formulario antes de copiar, para comprobar que no se arrastra', async () => {
    const { rows } = await ctx.db.query<{ id: string }>(
      "SELECT id FROM record_types WHERE code = 'RO-10C'",
    );
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/record-types/${rows[0]!.id}`,
      headers: auth(pdToken),
      payload: { status: 'derogado' },
    });
    assert.equal(res.statusCode, 200);
  });

  it('copia procedimientos y formularios vigentes', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/manual-versions/${rev04}/duplicar`,
      headers: auth(pdToken),
      payload: { revision_number: 'Rev. 05', effective_date: '2026-10-01' },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().status, 'borrador', 'nace en borrador, no en vigencia');
    assert.equal(res.json().formularios_copiados, 9, 'los 10 menos el derogado');
    assert.equal(res.json().regulation, 'Ord. PNA 05/18', 'hereda la norma');
    rev05 = res.json().id;

    const procedimientos = await ctx.app.inject({
      method: 'GET',
      url: `/api/admin/procedures?manual_version_id=${rev05}`,
      headers: auth(pdToken),
    });
    assert.equal(procedimientos.json().procedures.length, 8);
  });

  it('los formularios copiados arrancan en versión 1 y conservan su definición', async () => {
    const { rows } = await ctx.db.query<{
      code: string;
      version: number;
      signature_requirement: string;
      campos: number;
    }>(
      `SELECT rt.code, rt.version, rt.signature_requirement,
              jsonb_array_length(rt.field_schema) AS campos
         FROM record_types rt
         JOIN procedures p ON p.id = rt.procedure_id
        WHERE p.manual_version_id = $1 AND rt.code = 'RE-01D'`,
      [rev05],
    );
    assert.equal(rows[0]!.version, 1);
    assert.equal(rows[0]!.signature_requirement, 'ambas');
    assert.ok(rows[0]!.campos > 5, 'se copió el formulario completo');
  });

  it('el formulario derogado no se arrastra', async () => {
    const { rows } = await ctx.db.query<{ n: number }>(
      `SELECT count(*) AS n FROM record_types rt
         JOIN procedures p ON p.id = rt.procedure_id
        WHERE p.manual_version_id = $1 AND rt.code = 'RO-10C'`,
      [rev05],
    );
    assert.equal(rows[0]!.n, 0);
  });

  it('mientras siga en borrador, a bordo se sigue viendo la revisión anterior', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/record-types',
      headers: auth(capitanToken),
    });
    const codigos = res.json().record_types.map((rt: { code: string }) => rt.code);
    assert.equal(codigos.length, 9, 'sigue la Rev. 04, sin el derogado');
  });

  it('al publicarla, el buque pasa a la nueva sin duplicados', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/manual-versions/${rev05}/publicar`,
      headers: auth(pdToken),
    });
    assert.equal(res.statusCode, 200);

    const catalogo = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/record-types',
      headers: auth(capitanToken),
    });
    const codigos = catalogo.json().record_types.map((rt: { code: string }) => rt.code);
    assert.equal(codigos.length, 9);
    assert.equal(new Set(codigos).size, 9, 'sin códigos repetidos');
  });

  it('el tablero no duplica las obligaciones de la revisión superada', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/dashboard/compliance',
      headers: auth(pdToken),
    });
    const zafarranchos = res
      .json()
      .compliance.filter((c: { record_type_code: string }) => c.record_type_code === 'RE-01A-INC');
    assert.equal(zafarranchos.length, 1);
  });

  it('editar el formulario copiado no toca el de la revisión anterior', async () => {
    const { rows } = await ctx.db.query<{ id: string; manual: string }>(
      `SELECT rt.id, p.manual_version_id AS manual
         FROM record_types rt
         JOIN procedures p ON p.id = rt.procedure_id
        WHERE rt.code = 'RE-01D'
        ORDER BY p.manual_version_id = $1 DESC`,
      [rev05],
    );
    const nuevo = rows.find((r) => r.manual === rev05)!;
    const viejo = rows.find((r) => r.manual !== rev05)!;

    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/record-types/${nuevo.id}`,
      headers: auth(pdToken),
      payload: { name: 'Incendio (Rev. 05)' },
    });

    const { rows: comprobacion } = await ctx.db.query<{ name: string; version: number }>(
      'SELECT name, version FROM record_types WHERE id = $1',
      [viejo.id],
    );
    assert.equal(comprobacion[0]!.name, 'Incendio');
    assert.equal(comprobacion[0]!.version, 1);
  });

  it('no admite dos revisiones con el mismo número', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/manual-versions/${rev04}/duplicar`,
      headers: auth(pdToken),
      payload: { revision_number: 'Rev. 05' },
    });
    assert.equal(res.statusCode, 409);
  });
});
