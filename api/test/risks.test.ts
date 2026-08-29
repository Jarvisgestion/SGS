import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  auth,
  createUser,
  DEMO_COMPANY,
  DEMO_VESSEL,
  login,
  recordTypeId,
  setupApi,
  teardownApi,
  type TestContext,
} from './helpers.ts';

let ctx: TestContext;
let capitanToken: string;
let shToken: string;
let pdToken: string;

before(async () => {
  ctx = await setupApi();

  capitanToken = await login(
    ctx.app,
    await createUser(ctx.db, {
      companyId: DEMO_COMPANY,
      fullName: 'Capitán',
      email: 'capitan@riesgo.test',
      role: 'capitan',
      vesselId: DEMO_VESSEL,
    }),
  );
  shToken = await login(
    ctx.app,
    await createUser(ctx.db, {
      companyId: DEMO_COMPANY,
      fullName: 'Responsable SH',
      email: 'sh@riesgo.test',
      role: 'responsable_sh',
    }),
  );
  pdToken = await login(
    ctx.app,
    await createUser(ctx.db, {
      companyId: DEMO_COMPANY,
      fullName: 'Persona Designada',
      email: 'pd@riesgo.test',
      role: 'persona_designada',
    }),
  );
});

after(async () => {
  await teardownApi(ctx);
});

describe('matriz de riesgo', () => {
  it('la puede leer cualquiera que cargue registros', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/risks',
      headers: auth(capitanToken),
    });
    assert.equal(res.statusCode, 200);
    const cuadros = res.json().risks;
    assert.equal(cuadros.length, 3);
    const maquinas = cuadros.find((r: { chart_number: string }) => r.chart_number === 'Cuadro N° 7');
    assert.equal(maquinas.risk_score, 9);
    assert.equal(maquinas.risk_level, 'alto');
    assert.equal(maquinas.residual_level, 'bajo');
  });

  it('el capitán no la edita', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/risks',
      headers: auth(capitanToken),
      payload: { work_position: 'Cubierta', hazard_source: 'x', probability: 1, consequence: 1 },
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.json().error, /matriz de riesgo/);
  });

  it('el Responsable de Seguridad e Higiene sí, aunque no administre el catálogo', async () => {
    const catalogo = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/manual-versions',
      headers: auth(shToken),
    });
    assert.equal(catalogo.statusCode, 403, 'no administra el manual');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/risks',
      headers: auth(shToken),
      payload: {
        chart_number: 'Cuadro N° 20',
        work_position: 'Puente',
        hazard_source: 'Fatiga por guardias prolongadas',
        probability: 2,
        consequence: 3,
        control_measures: 'Rotación de guardias, descanso mínimo entre relevos',
        residual_probability: 1,
        residual_consequence: 3,
      },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().risk_score, 6);
    assert.equal(res.json().risk_level, 'alto');
  });

  it('la base también frena al capitán, no sólo la API', async () => {
    const { rows } = await ctx.db.query<{ id: string }>(
      "SELECT id FROM users WHERE email = 'capitan@riesgo.test'",
    );
    await assert.rejects(async () => {
      const client = await ctx.db.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT set_config($1, $2, true)', ['sgs.actor_user_id', rows[0]!.id]);
        await client.query(
          `INSERT INTO risk_assessments (company_id, work_position, hazard_source, probability, consequence)
           VALUES ($1, 'Cubierta', 'Directo por SQL', 1, 1)`,
          [DEMO_COMPANY],
        );
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    }, /matriz de riesgo/);
  });

  it('respeta la escala de la evaluación', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/risks',
      headers: auth(shToken),
      payload: { work_position: 'Cubierta', hazard_source: 'x', probability: 7, consequence: 1 },
    });
    assert.equal(res.statusCode, 400);
  });

  it('un cuadro cerrado deja de ofrecerse', async () => {
    const { rows } = await ctx.db.query<{ id: string }>(
      "SELECT id FROM risk_assessments WHERE chart_number = 'Cuadro N° 12'",
    );
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/risks/${rows[0]!.id}`,
      headers: auth(pdToken),
      payload: { status: 'cerrado' },
    });
    assert.equal(res.statusCode, 200);

    const lista = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/risks',
      headers: auth(capitanToken),
    });
    const numeros = lista.json().risks.map((r: { chart_number: string }) => r.chart_number);
    assert.ok(!numeros.includes('Cuadro N° 12'));
  });
});

describe('referencias en un registro', () => {
  it('un registro puede citar un cuadro de la matriz y a un tripulante', async () => {
    const { rows: riesgos } = await ctx.db.query<{ id: string }>(
      "SELECT id FROM risk_assessments WHERE chart_number = 'Cuadro N° 7'",
    );
    const tripulacion = await ctx.app.inject({
      method: 'GET',
      url: `/api/catalog/crew?vessel_id=${DEMO_VESSEL}`,
      headers: auth(capitanToken),
    });
    assert.equal(tripulacion.statusCode, 200);
    const capitan = tripulacion.json().crew.find((p: { full_name: string }) => p.full_name === 'Capitán');
    assert.ok(capitan, 'el capitán aparece en la tripulación del buque');

    const creado = await ctx.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: auth(capitanToken),
      payload: {
        record_type_id: await recordTypeId(ctx.db, 'RO-07A'),
        vessel_id: DEMO_VESSEL,
        data: {
          tripulante: capitan.id,
          fecha_hecho: '2026-08-29',
          sintomas: 'Quemadura en antebrazo',
          riesgo_asociado: riesgos[0]!.id,
        },
      },
    });
    assert.equal(creado.statusCode, 201);

    // al enviar, la base valida que ambas referencias sean uuid
    const roto = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/records/${creado.json().id}`,
      headers: auth(capitanToken),
      payload: {
        data: {
          tripulante: capitan.id,
          fecha_hecho: '2026-08-29',
          sintomas: 'Quemadura en antebrazo',
          // el número del cuadro no es su identificador: la referencia es el id
          riesgo_asociado: 'Cuadro N° 7',
        },
      },
    });
    assert.equal(roto.statusCode, 200, 'en borrador no se valida');

    const enviado = await ctx.app.inject({
      method: 'POST',
      url: `/api/records/${creado.json().id}/submit`,
      headers: auth(capitanToken),
    });
    assert.equal(enviado.statusCode, 422);
    assert.match(enviado.json().error, /uuid/);
  });
});
