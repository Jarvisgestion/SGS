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
  type SeededUser,
  type TestContext,
} from './helpers.ts';

let ctx: TestContext;
let pd: SeededUser;
let capitan: SeededUser;
let pdToken: string;
let capitanToken: string;

before(async () => {
  ctx = await setupApi();
  pd = await createUser(ctx.db, {
    companyId: DEMO_COMPANY,
    fullName: 'Persona Designada',
    email: 'pd@admin.test',
    role: 'persona_designada',
  });
  capitan = await createUser(ctx.db, {
    companyId: DEMO_COMPANY,
    fullName: 'Capitán',
    email: 'capitan@admin.test',
    role: 'capitan',
    vesselId: DEMO_VESSEL,
  });
  pdToken = await login(ctx.app, pd);
  capitanToken = await login(ctx.app, capitan);
});

after(async () => {
  await teardownApi(ctx);
});

describe('permisos de administración', () => {
  it('el capitán no entra al ABM del catálogo', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/manual-versions',
      headers: auth(capitanToken),
    });
    assert.equal(res.statusCode, 403);
  });

  it('la base también lo frena, no sólo la API', async () => {
    const { rows } = await ctx.db.query<{ id: string }>(
      'SELECT id FROM procedures WHERE code = $1',
      ['PO-05'],
    );
    await assert.rejects(
      async () => {
        const client = await ctx.db.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT set_config($1, $2, true)', ['sgs.actor_user_id', capitan.id]);
          await client.query(
            `INSERT INTO record_types (procedure_id, company_id, code, name, category)
             VALUES ($1, $2, 'X-99', 'Directo por SQL', 'incident_event')`,
            [rows[0]!.id, DEMO_COMPANY],
          );
        } finally {
          await client.query('ROLLBACK').catch(() => {});
          client.release();
        }
      },
      /rol habilitado para editar/,
    );
  });
});

describe('el ciclo del manual', () => {
  let manualId: string;
  let procedureId: string;

  it('crea una revisión nueva', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/manual-versions',
      headers: auth(pdToken),
      payload: { revision_number: 'Rev. 05', regulation: 'Ord. PNA 05/18', effective_date: '2026-09-01' },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().status, 'borrador');
    manualId = res.json().id;
  });

  it('al publicarla, la anterior queda superada', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/manual-versions/${manualId}/publicar`,
      headers: auth(pdToken),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'vigente');

    const { rows } = await ctx.db.query<{ revision_number: string; status: string }>(
      'SELECT revision_number, status FROM manual_versions WHERE company_id = $1 ORDER BY revision_number',
      [DEMO_COMPANY],
    );
    assert.deepEqual(rows, [
      { revision_number: 'Rev. 04', status: 'superada' },
      { revision_number: 'Rev. 05', status: 'vigente' },
    ]);
  });

  it('los formularios de la revisión superada dejan de ofrecerse a bordo', async () => {
    // ?todas_las_revisiones=false tiene que significar false, no "hay texto"
    const catalogo = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/record-types?todas_las_revisiones=false&include_derogados=false',
      headers: auth(capitanToken),
    });
    assert.equal(catalogo.json().record_types.length, 0, 'Rev. 04 quedó superada');

    // pero siguen siendo visibles para administrarlos
    const todas = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/record-types?todas_las_revisiones=true',
      headers: auth(pdToken),
    });
    assert.equal(todas.json().record_types.length, 10);
  });

  it('agrega un procedimiento', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/procedures',
      headers: auth(pdToken),
      payload: { manual_version_id: manualId, code: 'PO-11', name: 'Gestión de residuos', sort_order: 11 },
    });
    assert.equal(res.statusCode, 201);
    procedureId = res.json().id;
  });

  it('define un formulario nuevo y queda disponible a bordo sin tocar código', async () => {
    const alta = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/record-types',
      headers: auth(pdToken),
      payload: {
        procedure_id: procedureId,
        code: 'RO-11A',
        name: 'Entrega de residuos en puerto',
        category: 'scheduled_checklist',
        scope: 'vessel',
        recurrence_type: 'on_event',
        allowed_creator_roles: ['capitan'],
        allowed_reviewer_roles: ['persona_designada'],
        signature_requirement: 'pin',
        field_schema: [
          { key: 'puerto', type: 'text', label: 'Puerto', required: true },
          { key: 'tipo_residuo', type: 'select', label: 'Tipo', options: ['Oleoso', 'Plástico', 'Orgánico'] },
          { key: 'kilos', type: 'number', label: 'Kilos entregados' },
          { key: 'firma_capitan', type: 'signature_block', label: 'Firma del Capitán', signer_role: 'capitan' },
        ],
      },
    });
    assert.equal(alta.statusCode, 201);
    const nuevoId = alta.json().id;

    // aparece en el catálogo que ve el buque
    const catalogo = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/record-types',
      headers: auth(capitanToken),
    });
    const codigos = catalogo.json().record_types.map((rt: { code: string }) => rt.code);
    assert.ok(codigos.includes('RO-11A'));

    // y el capitán ya puede cargarlo
    const instancia = await ctx.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: auth(capitanToken),
      payload: {
        record_type_id: nuevoId,
        vessel_id: DEMO_VESSEL,
        data: { puerto: 'Mar del Plata', tipo_residuo: 'Oleoso', kilos: 120 },
      },
    });
    assert.equal(instancia.statusCode, 201);
  });

  it('rechaza un formulario mal definido con el motivo de la base', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/record-types',
      headers: auth(pdToken),
      payload: {
        procedure_id: procedureId,
        code: 'RO-11B',
        name: 'Mal definido',
        category: 'incident_event',
        field_schema: [{ key: 'tipo', type: 'select' }],
      },
    });
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error, /options/);
  });

  it('editar el formulario sube la versión y congela la anterior', async () => {
    const { rows } = await ctx.db.query<{ id: string; version: number }>(
      'SELECT id, version FROM record_types WHERE code = $1',
      ['RO-11A'],
    );
    const antes = rows[0]!;

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/record-types/${antes.id}`,
      headers: auth(pdToken),
      payload: {
        field_schema: [
          { key: 'puerto', type: 'text', label: 'Puerto', required: true },
          { key: 'tipo_residuo', type: 'select', label: 'Tipo', options: ['Oleoso', 'Plástico', 'Orgánico'] },
          { key: 'kilos', type: 'number', label: 'Kilos entregados' },
          { key: 'certificado', type: 'text', label: 'N° de certificado de recepción' },
          { key: 'firma_capitan', type: 'signature_block', label: 'Firma del Capitán', signer_role: 'capitan' },
        ],
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().version, antes.version + 1);

    // la instancia cargada antes sigue viéndose con el formulario de su versión
    const { rows: instancias } = await ctx.db.query<{ id: string; record_type_version: number }>(
      `SELECT id, record_type_version FROM record_instances WHERE record_type_id = $1`,
      [antes.id],
    );
    assert.equal(instancias[0]!.record_type_version, antes.version);

    const detalle = await ctx.app.inject({
      method: 'GET',
      url: `/api/records/${instancias[0]!.id}`,
      headers: auth(capitanToken),
    });
    const claves = detalle.json().field_schema.map((f: { key: string }) => f.key);
    assert.ok(!claves.includes('certificado'), 'la instancia vieja no ve el campo nuevo');
  });

  it('derogar un tipo lo saca del catálogo de a bordo', async () => {
    const { rows } = await ctx.db.query<{ id: string }>(
      'SELECT id FROM record_types WHERE code = $1',
      ['RO-11A'],
    );
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/record-types/${rows[0]!.id}`,
      headers: auth(pdToken),
      payload: { status: 'derogado' },
    });
    assert.equal(res.statusCode, 200);

    const catalogo = await ctx.app.inject({
      method: 'GET',
      url: '/api/catalog/record-types',
      headers: auth(capitanToken),
    });
    const codigos = catalogo.json().record_types.map((rt: { code: string }) => rt.code);
    assert.ok(!codigos.includes('RO-11A'));
  });
});

describe('flota y personas', () => {
  it('da de alta un buque', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/vessels',
      headers: auth(pdToken),
      payload: { name: 'Nuevo Amanecer', matricula: 'M-0999', vessel_type: 'buque motor', service: 'pesquero' },
    });
    assert.equal(res.statusCode, 201);
  });

  it('no admite dos buques con la misma matrícula', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/vessels',
      headers: auth(pdToken),
      payload: { name: 'Otro', matricula: 'M-0999' },
    });
    assert.equal(res.statusCode, 409);
  });

  it('da de alta una persona con su rol y puede entrar', async () => {
    const alta = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: auth(pdToken),
      payload: {
        full_name: 'Oficial Nuevo',
        email: 'oficial@admin.test',
        password: 'clave-larga-123',
        pin: '5566',
        role_code: 'oficial',
        vessel_id: DEMO_VESSEL,
      },
    });
    assert.equal(alta.statusCode, 201);

    const sesion = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'oficial@admin.test', password: 'clave-larga-123' },
    });
    assert.equal(sesion.statusCode, 200);
    assert.deepEqual(
      sesion.json().user.roles.map((r: { code: string }) => r.code),
      ['oficial'],
    );
  });

  it('el cambio de mando exige cerrar el rol saliente', async () => {
    const lista = await ctx.app.inject({ method: 'GET', url: '/api/admin/users', headers: auth(pdToken) });
    const capitanRow = lista
      .json()
      .users.find((u: { email: string }) => u.email === 'capitan@admin.test');

    const choque = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/users/${capitanRow.id}/roles`,
      headers: auth(pdToken),
      payload: { role_code: 'capitan', vessel_id: DEMO_VESSEL },
    });
    assert.equal(choque.statusCode, 409);

    const rolVigente = capitanRow.roles[0];
    const cierre = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${capitanRow.id}/roles/${rolVigente.id}`,
      headers: auth(pdToken),
    });
    assert.equal(cierre.statusCode, 200);

    const nuevo = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/users/${capitanRow.id}/roles`,
      headers: auth(pdToken),
      payload: { role_code: 'capitan', vessel_id: DEMO_VESSEL },
    });
    assert.equal(nuevo.statusCode, 201);
  });
});
