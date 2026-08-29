import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  auth,
  createUser,
  DEMO_COMPANY,
  DEMO_VESSEL,
  login,
  multipart,
  PNG_1x1,
  recordTypeId,
  setupApi,
  teardownApi,
  type SeededUser,
  type TestContext,
} from './helpers.ts';

let ctx: TestContext;
let capitan: SeededUser;
let token: string;

before(async () => {
  ctx = await setupApi({ pinRateLimit: 3 });
  capitan = await createUser(ctx.db, {
    companyId: DEMO_COMPANY,
    fullName: 'Capitán',
    email: 'capitan@seguridad.test',
    role: 'capitan',
    vesselId: DEMO_VESSEL,
  });
  token = await login(ctx.app, capitan);
});

after(async () => {
  await teardownApi(ctx);
});

describe('el login no delata qué cuentas existen', () => {
  async function medir(email: string) {
    const inicio = process.hrtime.bigint();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'una-clave-equivocada' },
    });
    assert.equal(res.statusCode, 401);
    return Number(process.hrtime.bigint() - inicio) / 1e6;
  }

  it('tarda lo mismo con un email inexistente que con uno real', async () => {
    // se descartan las primeras corridas: la primera paga el arranque
    await medir(capitan.email);
    await medir('nadie@seguridad.test');

    const existe = Math.min(await medir(capitan.email), await medir(capitan.email));
    const noExiste = Math.min(
      await medir('nadie@seguridad.test'),
      await medir('tampoco@seguridad.test'),
    );

    // el trabajo de scrypt domina el tiempo; sin la corrección, el email
    // inexistente respondía en una fracción del tiempo
    assert.ok(
      noExiste > existe * 0.5,
      `email inexistente ${noExiste.toFixed(1)}ms vs existente ${existe.toFixed(1)}ms`,
    );
  });
});

describe('el PIN no se puede probar a la fuerza', () => {
  it('frena los intentos de firma', async () => {
    const creado = await ctx.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: auth(token),
      payload: {
        record_type_id: await recordTypeId(ctx.db, 'RO-05C'),
        vessel_id: DEMO_VESSEL,
        data: {},
      },
    });
    const id = creado.json().id;

    const intento = (pin: string) =>
      ctx.app.inject({
        method: 'POST',
        url: `/api/records/${id}/signatures`,
        headers: auth(token),
        payload: { field_key: 'firma_capitan', pin },
      });

    assert.equal((await intento('0000')).statusCode, 401);
    assert.equal((await intento('0001')).statusCode, 401);
    assert.equal((await intento('0002')).statusCode, 401);
    assert.equal((await intento('0003')).statusCode, 429, 'al cuarto intento corta');
  });
});

describe('nombre de archivo en la descarga', () => {
  it('no viaja tal cual a la cabecera', async () => {
    const creado = await ctx.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: auth(token),
      payload: {
        record_type_id: await recordTypeId(ctx.db, 'RE-01D'),
        vessel_id: DEMO_VESSEL,
        data: {},
      },
    });

    const cuerpo = multipart(PNG_1x1, {
      filename: 'foto"; evil="1\r\nX-Inyectada: si.png',
      contentType: 'image/png',
    });
    const subido = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${creado.json().id}/attachments`,
      headers: { ...auth(token), ...cuerpo.headers },
      payload: cuerpo.payload,
    });
    assert.equal(subido.statusCode, 201);

    const bajado = await ctx.app.inject({
      method: 'GET',
      url: `/api/attachments/${subido.json().id}`,
      headers: auth(token),
    });
    assert.equal(bajado.statusCode, 200);
    assert.equal(bajado.headers['x-inyectada'], undefined);
    assert.ok(!String(bajado.headers['content-disposition']).includes('evil'));
  });
});

describe('aislamiento entre empresas en todas las rutas de lectura', () => {
  it('ninguna deja ver datos de otra empresa', async () => {
    const { rows } = await ctx.db.query<{ id: string }>(
      "INSERT INTO companies (name) VALUES ('Ajena seguridad') RETURNING id",
    );
    const ajeno = await createUser(ctx.db, {
      companyId: rows[0]!.id,
      fullName: 'Ajeno',
      email: 'ajeno@seguridad.test',
      role: 'persona_designada',
    });
    const tokenAjeno = auth(await login(ctx.app, ajeno));

    for (const url of [
      '/api/catalog/record-types',
      '/api/catalog/vessels',
      '/api/catalog/risks',
      '/api/catalog/crew',
      '/api/records',
      '/api/dashboard/compliance',
      '/api/dashboard/pending-reviews',
      '/api/dashboard/certificates',
      '/api/dashboard/nonconformities',
      '/api/dashboard/pending-children',
      '/api/admin/users',
    ]) {
      const res = await ctx.app.inject({ method: 'GET', url, headers: tokenAjeno });
      assert.equal(res.statusCode, 200, url);
      const cuerpo = JSON.stringify(res.json());
      assert.ok(!cuerpo.includes('Huafeng'), `${url} filtró el buque de otra empresa`);
      assert.ok(!cuerpo.includes('Capitán'), `${url} filtró personal de otra empresa`);
    }
  });
});
