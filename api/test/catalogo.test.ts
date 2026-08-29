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
      email: 'pd@catalogo.test',
      role: 'persona_designada',
    }),
  );
  capitanToken = await login(
    ctx.app,
    await createUser(ctx.db, {
      companyId: DEMO_COMPANY,
      fullName: 'Capitán',
      email: 'capitan@catalogo.test',
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

function exportar(token: string, id = rev04) {
  return ctx.app.inject({
    method: 'GET',
    url: `/api/admin/manual-versions/${id}/exportar`,
    headers: auth(token),
  });
}

describe('exportar el catálogo', () => {
  it('trae el manual completo', async () => {
    const res = await exportar(pdToken);
    assert.equal(res.statusCode, 200);
    const catalogo = res.json();

    assert.equal(catalogo.formato, 'sgs.catalogo/1');
    assert.equal(catalogo.revision_number, 'Rev. 04');
    assert.equal(catalogo.procedures.length, 8);
    assert.equal(
      catalogo.procedures.reduce((n: number, p: { record_types: unknown[] }) => n + p.record_types.length, 0),
      10,
    );

    const incendio = catalogo.procedures
      .flatMap((p: { record_types: { code: string }[] }) => p.record_types)
      .find((r: { code: string }) => r.code === 'RE-01D');
    assert.equal(incendio.signature_requirement, 'ambas');
    assert.deepEqual(incendio.allowed_creator_roles, ['capitan']);
    assert.ok(
      incendio.field_schema.some((f: { triggers_record_type?: string }) => f.triggers_record_type === 'RO-07A'),
      'conserva la regla de que un incendio con heridos exige el acaecimiento',
    );
  });

  it('se descarga como archivo', async () => {
    const res = await exportar(pdToken);
    assert.match(String(res.headers['content-disposition']), /attachment; filename="catalogo-Rev\.-04\.json"/);
  });

  it('el capitán no exporta el catálogo', async () => {
    assert.equal((await exportar(capitanToken)).statusCode, 403);
  });
});

describe('importar el catálogo en otra empresa', () => {
  let otraEmpresa: string;
  let pdOtra: string;

  before(async () => {
    const { rows } = await ctx.db.query<{ id: string }>(
      "INSERT INTO companies (name) VALUES ('Xeitosiño S.A.') RETURNING id",
    );
    otraEmpresa = rows[0]!.id;
    pdOtra = await login(
      ctx.app,
      await createUser(ctx.db, {
        companyId: otraEmpresa,
        fullName: 'PD de Xeitosiño',
        email: 'pd@xeitosino.test',
        role: 'persona_designada',
      }),
    );
  });

  it('la ida y vuelta no pierde nada', async () => {
    const original = (await exportar(pdToken)).json();

    const importado = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/manual-versions/importar',
      headers: auth(pdOtra),
      payload: { catalogo: original, revision_number: 'Rev. 01' },
    });
    assert.equal(importado.statusCode, 201);
    assert.equal(importado.json().procedimientos, 8);
    assert.equal(importado.json().formularios, 10);

    // exportar lo recién importado tiene que devolver lo mismo
    const vuelta = (await exportar(pdOtra, importado.json().manual_version_id)).json();
    assert.deepEqual(
      { ...vuelta, revision_number: original.revision_number },
      original,
      'el catálogo sobrevive la ida y la vuelta',
    );
  });

  it('nace en borrador: no cambia lo que rige', async () => {
    const { rows } = await ctx.db.query<{ revision_number: string; status: string }>(
      'SELECT revision_number, status FROM manual_versions WHERE company_id = $1',
      [otraEmpresa],
    );
    assert.deepEqual(rows, [{ revision_number: 'Rev. 01', status: 'borrador' }]);
  });

  it('rechaza un formulario mal definido con el motivo concreto', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/manual-versions/importar',
      headers: auth(pdOtra),
      payload: {
        catalogo: {
          formato: 'sgs.catalogo/1',
          revision_number: 'Rev. 02',
          procedures: [
            {
              code: 'PO-01',
              name: 'Prueba',
              sort_order: 1,
              record_types: [
                {
                  code: 'X-1',
                  name: 'Mal definido',
                  category: 'incident_event',
                  field_schema: [{ key: 'tipo', type: 'select' }],
                },
              ],
            },
          ],
        },
      },
    });
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error, /options/);
  });

  it('rechaza un rol que la empresa no tiene', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/manual-versions/importar',
      headers: auth(pdOtra),
      payload: {
        catalogo: {
          formato: 'sgs.catalogo/1',
          revision_number: 'Rev. 03',
          procedures: [
            {
              code: 'PO-01',
              name: 'Prueba',
              sort_order: 1,
              record_types: [
                {
                  code: 'X-2',
                  name: 'Rol inventado',
                  category: 'incident_event',
                  allowed_creator_roles: ['contramaestre_inventado'],
                  field_schema: [],
                },
              ],
            },
          ],
        },
      },
    });
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error, /Rol inexistente/);
  });

  it('rechaza un archivo que no es un catálogo', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/manual-versions/importar',
      headers: auth(pdOtra),
      payload: { catalogo: { revision_number: 'Rev. 09', procedures: [] } },
    });
    assert.equal(res.statusCode, 400);
  });

  it('el buque de la otra empresa lo ve recién cuando se pone en vigencia', async () => {
    const capitanOtra = await login(
      ctx.app,
      await createUser(ctx.db, {
        companyId: otraEmpresa,
        fullName: 'Capitán de Xeitosiño',
        email: 'capitan@xeitosino.test',
        role: 'persona_designada',
      }),
    );

    const antes = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/record-types',
      headers: auth(capitanOtra),
    });
    assert.equal(antes.json().record_types.length, 0);

    const { rows } = await ctx.db.query<{ id: string }>(
      "SELECT id FROM manual_versions WHERE company_id = $1 AND revision_number = 'Rev. 01'",
      [otraEmpresa],
    );
    await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/manual-versions/${rows[0]!.id}/publicar`,
      headers: auth(pdOtra),
    });

    const despues = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/record-types',
      headers: auth(capitanOtra),
    });
    assert.equal(despues.json().record_types.length, 10);
  });
});
