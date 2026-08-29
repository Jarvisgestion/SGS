import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  auth,
  createUser,
  multipart,
  PNG_1x1,
  DEMO_COMPANY,
  DEMO_VESSEL,
  login,
  recordTypeId,
  setupApi,
  teardownApi,
  type SeededUser,
  type TestContext,
} from './helpers.ts';

let ctx: TestContext;
let capitan: SeededUser;
let pd: SeededUser;
let ajeno: SeededUser;
let capitanToken: string;
let pdToken: string;
let ajenoToken: string;
let incendioTypeId: string;

before(async () => {
  ctx = await setupApi();

  capitan = await createUser(ctx.db, {
    companyId: DEMO_COMPANY,
    fullName: 'Capitán de prueba',
    email: 'capitan@ejemplo.test',
    role: 'capitan',
    vesselId: DEMO_VESSEL,
  });
  pd = await createUser(ctx.db, {
    companyId: DEMO_COMPANY,
    fullName: 'Persona Designada',
    email: 'pd@ejemplo.test',
    role: 'persona_designada',
  });

  const { rows } = await ctx.db.query<{ id: string }>(
    "INSERT INTO companies (name) VALUES ('Otra Empresa') RETURNING id",
  );
  ajeno = await createUser(ctx.db, {
    companyId: rows[0]!.id,
    fullName: 'Ajeno',
    email: 'ajeno@ejemplo.test',
    role: 'persona_designada',
  });

  capitanToken = await login(ctx.app, capitan);
  pdToken = await login(ctx.app, pd);
  ajenoToken = await login(ctx.app, ajeno);
  incendioTypeId = await recordTypeId(ctx.db, 'RE-01D');
});

after(async () => {
  await teardownApi(ctx);
});

describe('autenticación', () => {
  it('rechaza una contraseña incorrecta', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: capitan.email, password: 'no-es' },
    });
    assert.equal(res.statusCode, 401);
  });

  it('rechaza un email inexistente sin filtrar que no existe', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nadie@ejemplo.test', password: 'x' },
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, 'Email o contraseña incorrectos');
  });

  it('devuelve los roles vigentes al iniciar sesión', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: capitan.email, password: capitan.password },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(
      res.json().user.roles.map((r: { code: string }) => r.code),
      ['capitan'],
    );
  });

  it('exige token en las rutas protegidas', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/catalog/record-types' });
    assert.equal(res.statusCode, 401);
  });

  it('frena el sondeo de contraseñas de una cuenta', async () => {
    const propio = await setupApi({ loginRateLimit: 3 });
    try {
      const victima = await createUser(propio.db, {
        companyId: DEMO_COMPANY,
        fullName: 'Objetivo',
        email: 'objetivo@ejemplo.test',
        role: 'capitan',
        vesselId: DEMO_VESSEL,
      });

      const intento = () =>
        propio.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: victima.email, password: 'adivinanza' },
        });

      assert.equal((await intento()).statusCode, 401);
      assert.equal((await intento()).statusCode, 401);
      assert.equal((await intento()).statusCode, 401);
      assert.equal((await intento()).statusCode, 429);

      // otra cuenta desde el mismo lugar no queda bloqueada
      const otra = await propio.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'otro@ejemplo.test', password: 'x' },
      });
      assert.equal(otra.statusCode, 401);
    } finally {
      await teardownApi(propio);
    }
  });

  it('rechaza un token adulterado', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/record-types',
      headers: auth(`${capitanToken.split('.')[0]}.firmafalsa`),
    });
    assert.equal(res.statusCode, 401);
  });
});

describe('catálogo', () => {
  it('lista los tipos de registro de la empresa', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/record-types',
      headers: auth(capitanToken),
    });
    assert.equal(res.statusCode, 200);
    const codes = res.json().record_types.map((rt: { code: string }) => rt.code);
    assert.ok(codes.includes('RE-01D'));
    assert.equal(codes.length, 10);
  });

  it('devuelve el field_schema para dibujar el formulario', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/catalog/record-types/${incendioTypeId}`,
      headers: auth(capitanToken),
    });
    assert.equal(res.statusCode, 200);
    const schema = res.json().field_schema as { key: string; type: string }[];
    assert.ok(schema.some((f) => f.key === 'medidas_preventivas' && f.type === 'checklist'));
  });

  it('no expone el catálogo de otra empresa', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/catalog/record-types/${incendioTypeId}`,
      headers: auth(ajenoToken),
    });
    assert.equal(res.statusCode, 404);
  });
});

describe('ciclo de vida de un registro', () => {
  let recordId: string;
  let firmaId: string;

  it('crea un borrador incompleto (carga offline)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: auth(capitanToken),
      payload: {
        record_type_id: incendioTypeId,
        vessel_id: DEMO_VESSEL,
        data: { lugar_inicio: 'Sala de máquinas' },
      },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().status, 'borrador');
    recordId = res.json().id;
  });

  it('un tripulante no puede emitir este registro', async () => {
    const tripulante = await createUser(ctx.db, {
      companyId: DEMO_COMPANY,
      fullName: 'Marinero',
      email: 'marinero@ejemplo.test',
      role: 'tripulante',
      vesselId: DEMO_VESSEL,
    });
    const token = await login(ctx.app, tripulante);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: auth(token),
      payload: { record_type_id: incendioTypeId, vessel_id: DEMO_VESSEL, data: {} },
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.json().error, /rol habilitado/);
  });

  it('no envía un formulario incompleto', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/submit`,
      headers: auth(capitanToken),
    });
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error, /obligatorio/);
  });

  it('rechaza un ítem que no está en el checklist', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/records/${recordId}`,
      headers: auth(capitanToken),
      payload: {
        data: {
          descripcion: 'Principio de incendio',
          medidas_preventivas: [{ item: 'Cosa inventada', status: 'ok' }],
        },
      },
    });
    // el borrador no valida; el rechazo llega al enviar
    assert.equal(res.statusCode, 200);
    const submit = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/submit`,
      headers: auth(capitanToken),
    });
    assert.equal(submit.statusCode, 422);
    assert.match(submit.json().error, /no declarado en el checklist/);
  });

  it('completa el formulario', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/records/${recordId}`,
      headers: auth(capitanToken),
      payload: {
        data: {
          descripcion: 'Principio de incendio en sala de máquinas',
          lugar_inicio: 'Sala de máquinas',
          medidas_preventivas: [
            { item: 'Corte suministro eléctrico', status: 'ok' },
            { item: 'Cierre de ventilación', status: 'no_ok', observacion: 'Trampilla trabada' },
          ],
          elementos_usados: [{ item: 'Extintores', status: 'ok' }],
          informa_compania: true,
          informa_pna: true,
          hubo_heridos: false,
          necesita_remolque: false,
        },
      },
    });
    assert.equal(res.statusCode, 200);
  });

  it('no envía sin las firmas del formulario', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/submit`,
      headers: auth(capitanToken),
    });
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error, /Faltan firmas: firma_capitan/);
  });

  it('este registro exige firma manuscrita y PIN', async () => {
    const sinImagen = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/signatures`,
      headers: auth(capitanToken),
      payload: { field_key: 'firma_capitan', pin: capitan.pin },
    });
    assert.equal(sinImagen.statusCode, 422);

    const cuerpo = multipart(PNG_1x1, { filename: 'firma.png', contentType: 'image/png' });
    const adjunto = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/attachments`,
      headers: { ...auth(capitanToken), ...cuerpo.headers },
      payload: cuerpo.payload,
    });
    assert.equal(adjunto.statusCode, 201);
    assert.equal(adjunto.json().byte_size, PNG_1x1.byteLength);
    firmaId = adjunto.json().id;

    const pinMal = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/signatures`,
      headers: auth(capitanToken),
      payload: { field_key: 'firma_capitan', pin: '0000', signature_image_id: firmaId },
    });
    assert.equal(pinMal.statusCode, 401);
  });

  it('rechaza un bloque de firma que el formulario no declara', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/signatures`,
      headers: auth(capitanToken),
      payload: { field_key: 'firma_inventada', pin: capitan.pin, signature_image_id: firmaId },
    });
    assert.equal(res.statusCode, 422);
  });

  it('firma y envía', async () => {
    const firma = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/signatures`,
      headers: auth(capitanToken),
      payload: { field_key: 'firma_capitan', pin: capitan.pin, signature_image_id: firmaId },
    });
    assert.equal(firma.statusCode, 201);
    assert.equal(firma.json().signer_role, 'capitan');

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/submit`,
      headers: auth(capitanToken),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'pendiente_revision');
  });

  it('no admite dos firmas sobre el mismo bloque', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/signatures`,
      headers: auth(capitanToken),
      payload: { field_key: 'firma_capitan', pin: capitan.pin, signature_image_id: firmaId },
    });
    assert.equal(res.statusCode, 409);
  });

  it('el capitán no puede aprobar su propio registro', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/reviews`,
      headers: auth(capitanToken),
      payload: { decision: 'aprobado' },
    });
    assert.equal(res.statusCode, 403);
  });

  it('observar exige comentario y devuelve el registro a bordo', async () => {
    const sinComentario = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/reviews`,
      headers: auth(pdToken),
      payload: { decision: 'observado' },
    });
    assert.equal(sinComentario.statusCode, 422);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/reviews`,
      headers: auth(pdToken),
      payload: { decision: 'observado', comment: 'Detallá la trampilla trabada' },
    });
    assert.equal(res.statusCode, 201);

    const detalle = await ctx.app.inject({
      method: 'GET',
      url: `/api/records/${recordId}`,
      headers: auth(capitanToken),
    });
    assert.equal(detalle.json().status, 'observado');
  });

  it('el registro observado vuelve a borrador al editarse', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/records/${recordId}`,
      headers: auth(capitanToken),
      payload: { marea: 'Marea 12' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'borrador');
  });

  it('se aprueba y queda de sólo lectura', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/submit`,
      headers: auth(capitanToken),
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/reviews`,
      headers: auth(pdToken),
      payload: { decision: 'aprobado', comment: 'Conforme' },
    });
    assert.equal(res.statusCode, 201);

    const edicion = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/records/${recordId}`,
      headers: auth(capitanToken),
      payload: { marea: 'Marea 13' },
    });
    assert.equal(edicion.statusCode, 409);

    const nuevaRevision = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/reviews`,
      headers: auth(pdToken),
      payload: { decision: 'observado', comment: 'tarde' },
    });
    assert.equal(nuevaRevision.statusCode, 409);
  });

  it('conserva todo el historial de revisión y la firma', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/records/${recordId}`,
      headers: auth(pdToken),
    });
    const body = res.json();
    assert.equal(body.reviews.length, 2);
    assert.deepEqual(
      body.reviews.map((r: { decision: string }) => r.decision),
      ['observado', 'aprobado'],
    );
    assert.equal(body.signatures.length, 1);
    assert.equal(body.signatures[0].method, 'canvas');
  });

  it('no deja ver el registro a otra empresa', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/records/${recordId}`,
      headers: auth(ajenoToken),
    });
    assert.equal(res.statusCode, 404);
  });

  it('deja la traza completa en la bitácora', async () => {
    const { rows } = await ctx.db.query<{ action: string; actor_user_id: string | null }>(
      `SELECT action, actor_user_id FROM audit_log
        WHERE entity_id = $1 AND entity_type = 'record_instance' ORDER BY id`,
      [recordId],
    );
    assert.equal(rows[0]!.action, 'created');
    assert.equal(rows[0]!.actor_user_id, capitan.id);
    assert.ok(rows.filter((r) => r.action === 'status_changed').length >= 4);
  });
});

describe('firma por PIN', () => {
  it('un checklist con firma por PIN no pide imagen', async () => {
    const typeId = await recordTypeId(ctx.db, 'RO-05C');
    const creado = await ctx.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: auth(capitanToken),
      payload: {
        record_type_id: typeId,
        vessel_id: DEMO_VESSEL,
        data: {
          maniobra: 'Zarpada',
          controles: [{ item: 'Documentación del buque a bordo', status: 'ok' }],
        },
      },
    });
    assert.equal(creado.statusCode, 201);

    const firma = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${creado.json().id}/signatures`,
      headers: auth(capitanToken),
      payload: { field_key: 'firma_capitan', pin: capitan.pin },
    });
    assert.equal(firma.statusCode, 201);
    assert.equal(firma.json().method, 'pin');

    const enviado = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${creado.json().id}/submit`,
      headers: auth(capitanToken),
    });
    assert.equal(enviado.statusCode, 200);
  });
});

describe('tablero', () => {
  it('marca los registros recurrentes sin cargar (RA-06C)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/dashboard/compliance?only_pending=true',
      headers: auth(pdToken),
    });
    assert.equal(res.statusCode, 200);
    const zafarrancho = res
      .json()
      .compliance.find((c: { record_type_code: string }) => c.record_type_code === 'RE-01A-INC');
    assert.equal(zafarrancho.compliance_status, 'sin_registro');
  });

  it('expone los desvíos de checklist sin tabla aparte', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/dashboard/nonconformities',
      headers: auth(pdToken),
    });
    assert.equal(res.statusCode, 200);
    const desvios = res.json().nonconformities;
    assert.equal(desvios.length, 1);
    assert.equal(desvios[0].observacion, 'Trampilla trabada');
  });

  it('lista la bandeja de revisión pendiente', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/dashboard/pending-reviews',
      headers: auth(pdToken),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().pending.length, 1); // el RO-05C recién enviado
  });
});
