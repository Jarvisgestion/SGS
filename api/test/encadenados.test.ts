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
let capitanToken: string;
let pdToken: string;
let incendioId: string;

before(async () => {
  ctx = await setupApi();
  capitan = await createUser(ctx.db, {
    companyId: DEMO_COMPANY,
    fullName: 'Capitán',
    email: 'capitan@cadena.test',
    role: 'capitan',
    vesselId: DEMO_VESSEL,
  });
  capitanToken = await login(ctx.app, capitan);
  pdToken = await login(
    ctx.app,
    await createUser(ctx.db, {
      companyId: DEMO_COMPANY,
      fullName: 'Persona Designada',
      email: 'pd@cadena.test',
      role: 'persona_designada',
    }),
  );

  // un incendio con heridos, firmado y enviado
  const creado = await ctx.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: auth(capitanToken),
    payload: {
      record_type_id: await recordTypeId(ctx.db, 'RE-01D'),
      vessel_id: DEMO_VESSEL,
      data: {
        descripcion: 'Incendio en sala de máquinas con un tripulante herido',
        hubo_heridos: true,
        necesita_remolque: false,
      },
    },
  });
  incendioId = creado.json().id;

  const cuerpo = multipart(PNG_1x1, { filename: 'firma.png', contentType: 'image/png' });
  const adjunto = await ctx.app.inject({
    method: 'POST',
    url: `/api/records/${incendioId}/attachments`,
    headers: { ...auth(capitanToken), ...cuerpo.headers },
    payload: cuerpo.payload,
  });
  await ctx.app.inject({
    method: 'POST',
    url: `/api/records/${incendioId}/signatures`,
    headers: auth(capitanToken),
    payload: {
      field_key: 'firma_capitan',
      pin: capitan.pin,
      signature_image_id: adjunto.json().id,
    },
  });
  await ctx.app.inject({
    method: 'POST',
    url: `/api/records/${incendioId}/submit`,
    headers: auth(capitanToken),
  });
});

after(async () => {
  await teardownApi(ctx);
});

describe('un registro que obliga a cargar otro', () => {
  it('queda pendiente hasta que se carga el hijo', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/dashboard/pending-children',
      headers: auth(pdToken),
    });
    assert.equal(res.statusCode, 200);
    const pendientes = res.json().pending_children;
    assert.equal(pendientes.length, 1);
    assert.equal(pendientes[0].required_record_type_code, 'RO-07A');
    assert.equal(pendientes[0].field_label, 'Hubo heridos');
  });

  it('el detalle del hecho dice qué falta cargar', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/records/${incendioId}`,
      headers: auth(capitanToken),
    });
    assert.equal(res.json().pending_children.length, 1);
    assert.equal(res.json().pending_children[0].code, 'RO-07A');
    assert.equal(res.json().children, null);
  });

  it('al cargar el hijo enlazado, deja de faltar', async () => {
    const hijo = await ctx.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: auth(capitanToken),
      payload: {
        record_type_id: await recordTypeId(ctx.db, 'RO-07A'),
        vessel_id: DEMO_VESSEL,
        parent_record_instance_id: incendioId,
        data: { sintomas: 'Quemadura en antebrazo' },
      },
    });
    assert.equal(hijo.statusCode, 201);

    const tablero = await ctx.app.inject({
      method: 'GET',
      url: '/api/dashboard/pending-children',
      headers: auth(pdToken),
    });
    assert.equal(tablero.json().pending_children.length, 0);

    // y la cadena queda a la vista desde los dos lados
    const padre = await ctx.app.inject({
      method: 'GET',
      url: `/api/records/${incendioId}`,
      headers: auth(capitanToken),
    });
    assert.equal(padre.json().children.length, 1);
    assert.equal(padre.json().children[0].code, 'RO-07A');

    const detalleHijo = await ctx.app.inject({
      method: 'GET',
      url: `/api/records/${hijo.json().id}`,
      headers: auth(capitanToken),
    });
    assert.equal(detalleHijo.json().parent.code, 'RE-01D');
  });

  it('un hecho de otra empresa no puede ser el padre', async () => {
    const { rows } = await ctx.db.query<{ id: string }>(
      "INSERT INTO companies (name) VALUES ('Ajena cadena') RETURNING id",
    );
    const ajeno = await createUser(ctx.db, {
      companyId: rows[0]!.id,
      fullName: 'Ajeno',
      email: 'ajeno@cadena.test',
      role: 'persona_designada',
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/records/${incendioId}`,
      headers: auth(await login(ctx.app, ajeno)),
    });
    assert.equal(res.statusCode, 404);
  });
});
