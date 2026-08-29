import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
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
  type TestContext,
} from './helpers.ts';

let ctx: TestContext;
let token: string;
let recordId: string;

before(async () => {
  ctx = await setupApi();
  const capitan = await createUser(ctx.db, {
    companyId: DEMO_COMPANY,
    fullName: 'Capitán',
    email: 'capitan@adjuntos.test',
    role: 'capitan',
    vesselId: DEMO_VESSEL,
  });
  token = await login(ctx.app, capitan);

  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: auth(token),
    payload: {
      record_type_id: await recordTypeId(ctx.db, 'RE-01D'),
      vessel_id: DEMO_VESSEL,
      data: {},
    },
  });
  recordId = res.json().id;
});

after(async () => {
  await teardownApi(ctx);
});

function subir(archivo: Buffer, filename: string, contentType: string) {
  const cuerpo = multipart(archivo, { filename, contentType });
  return ctx.app.inject({
    method: 'POST',
    url: `/api/records/${recordId}/attachments`,
    headers: { ...auth(token), ...cuerpo.headers },
    payload: cuerpo.payload,
  });
}

describe('subida de adjuntos', () => {
  it('guarda el archivo y devuelve su ficha', async () => {
    const res = await subir(PNG_1x1, 'foto.png', 'image/png');
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().file_type, 'image');
    assert.equal(res.json().content_type, 'image/png');
    assert.equal(res.json().byte_size, PNG_1x1.byteLength);
  });

  it('el archivo no queda dentro de la base', async () => {
    const { rows } = await ctx.db.query<{ storage_key: string; checksum: string; file_url: string | null }>(
      'SELECT storage_key, checksum, file_url FROM attachments ORDER BY uploaded_at DESC LIMIT 1',
    );
    assert.ok(rows[0]!.storage_key, 'tiene clave de almacenamiento');
    assert.equal(rows[0]!.file_url, null);
    // la clave es el hash del contenido
    assert.ok(rows[0]!.storage_key.includes(rows[0]!.checksum));

    const carpetas = await readdir(ctx.almacenamiento);
    assert.equal(carpetas.length, 1);
  });

  it('el mismo contenido no se guarda dos veces', async () => {
    await subir(PNG_1x1, 'otra-copia.png', 'image/png');
    const { rows } = await ctx.db.query<{ claves: number }>(
      'SELECT count(DISTINCT storage_key) AS claves FROM attachments',
    );
    assert.equal(rows[0]!.claves, 1);
  });

  it('no le cree al navegador sobre el tipo de archivo', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const res = await subir(html, 'trampa.png', 'image/png');
    assert.equal(res.statusCode, 415);
    assert.match(res.json().error, /no parece ser image\/png/);
  });

  it('rechaza un tipo que no está aceptado', async () => {
    const res = await subir(Buffer.from('MZ...'), 'programa.exe', 'application/x-msdownload');
    assert.equal(res.statusCode, 415);
    assert.match(res.json().error, /no aceptado/);
  });

  it('rechaza un archivo vacío', async () => {
    const res = await subir(Buffer.alloc(0), 'vacio.png', 'image/png');
    assert.equal(res.statusCode, 400);
  });

  it('rechaza un archivo más grande que el máximo', async () => {
    const chico = await setupApi({ maxUploadBytes: 1024 });
    try {
      const capitan = await createUser(chico.db, {
        companyId: DEMO_COMPANY,
        fullName: 'Capitán',
        email: 'capitan@grande.test',
        role: 'capitan',
        vesselId: DEMO_VESSEL,
      });
      const tokenChico = await login(chico.app, capitan);
      const creado = await chico.app.inject({
        method: 'POST',
        url: '/api/records',
        headers: auth(tokenChico),
        payload: {
          record_type_id: await recordTypeId(chico.db, 'RE-01D'),
          vessel_id: DEMO_VESSEL,
          data: {},
        },
      });

      // un PNG válido pero de 2 KB
      const grande = Buffer.concat([PNG_1x1, Buffer.alloc(2048)]);
      const cuerpo = multipart(grande, { filename: 'grande.png', contentType: 'image/png' });
      const res = await chico.app.inject({
        method: 'POST',
        url: `/api/records/${creado.json().id}/attachments`,
        headers: { ...auth(tokenChico), ...cuerpo.headers },
        payload: cuerpo.payload,
      });
      assert.equal(res.statusCode, 413);
    } finally {
      await teardownApi(chico);
    }
  });
});

describe('descarga de adjuntos', () => {
  let adjuntoId: string;

  before(async () => {
    adjuntoId = (await subir(PNG_1x1, 'para-bajar.png', 'image/png')).json().id;
  });

  it('devuelve el mismo contenido que se subió', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/attachments/${adjuntoId}`,
      headers: auth(token),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.deepEqual(res.rawPayload, PNG_1x1);
  });

  it('no se descarga sin sesión', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/attachments/${adjuntoId}` });
    assert.equal(res.statusCode, 401);
  });

  it('no se descarga desde otra empresa', async () => {
    const { rows } = await ctx.db.query<{ id: string }>(
      "INSERT INTO companies (name) VALUES ('Ajena') RETURNING id",
    );
    const ajeno = await createUser(ctx.db, {
      companyId: rows[0]!.id,
      fullName: 'Ajeno',
      email: 'ajeno@adjuntos.test',
      role: 'persona_designada',
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/attachments/${adjuntoId}`,
      headers: auth(await login(ctx.app, ajeno)),
    });
    assert.equal(res.statusCode, 404);
  });
});
