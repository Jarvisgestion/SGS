/**
 * Prueba de extremo a extremo de la API contra un servidor corriendo.
 *
 * Recorre el ciclo real: el capitán carga un registro a bordo, lo firma, lo envía;
 * la Persona Designada lo observa desde tierra; el buque lo corrige y lo reenvía;
 * el PD lo aprueba y queda cerrado. En el camino comprueba que las reglas del
 * esquema llegan al cliente como errores HTTP con sentido.
 *
 * Uso: BASE_URL=http://localhost:3000 node scripts/smoke.js
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
let ok = 0;
const fails = [];

function check(cond, name, extra = '') {
  if (cond) { ok++; console.log(`  ok  ${name}`); }
  else { fails.push(name); console.log(`  FALLO  ${name} ${extra}`); }
}

async function call(token, method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const login = async (email) => {
  const r = await call(null, 'POST', '/auth/login', { email, password: 'demo1234' });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.token;
};

console.log('--- Salud y sesión ---');
const health = await call(null, 'GET', '/health');
check(health.status === 200 && health.data.ok, 'la API responde y llega a la base');

const bad = await call(null, 'POST', '/auth/login', { email: 'capitan@demo.local', password: 'incorrecta' });
check(bad.status === 401, 'contraseña incorrecta rechazada', JSON.stringify(bad.data));

const noAuth = await call(null, 'GET', '/catalog');
check(noAuth.status === 401, 'sin token no se accede al catálogo');

const capitan = await login('capitan@demo.local');
const pd = await login('pd@demo.local');
const guardia = await login('guardia@demo.local');
check(true, 'login de capitán, PD y guardia');

console.log('\n--- Catálogo ---');
const cat = await call(capitan, 'GET', '/catalog');
const tipos = cat.data.procedures.flatMap((p) => p.recordTypes);
check(tipos.length === 44, `el catálogo trae los 44 tipos de registro (${tipos.length})`);

const re01d = tipos.find((t) => t.code === 'RE-01D');
check(re01d?.canCreate === true, 'el capitán puede crear un RE-01D');
// RMGS-01 (Políticas de la Empresa) solo lo emite el apoderado.
const rmgs01 = tipos.find((t) => t.code === 'RMGS-01');
check(rmgs01?.canCreate === false, 'el capitán NO figura habilitado para el RMGS-01 del apoderado');

const schema = await call(capitan, 'GET', `/catalog/${re01d.id}`);
check(Array.isArray(schema.data.fieldSchema) && schema.data.fieldSchema.length === 10,
  `el formulario RE-01D llega con sus 10 campos (${schema.data.fieldSchema?.length})`);

console.log('\n--- Permisos por rol ---');
const vessels = (await call(capitan, 'GET', '/vessels')).data.vessels;
const vessel = vessels[0];
const negado = await call(guardia, 'POST', '/records', {
  recordTypeId: re01d.id, vesselId: vessel.id, data: { descripcion: 'x' },
});
check(negado.status === 403, 'el guardia no puede crear un RE-01D (403)', JSON.stringify(negado.data));

console.log('\n--- Alta y validación ---');
const ajeno = await call(capitan, 'POST', '/records', {
  recordTypeId: re01d.id, vesselId: vessel.id, data: { campo_inventado: 1 },
});
check(ajeno.status === 422, 'un campo ajeno al formulario se rechaza (422)', JSON.stringify(ajeno.data));

const sinBuque = await call(capitan, 'POST', '/records', { recordTypeId: re01d.id, data: {} });
check(sinBuque.status === 422, 'un registro de buque sin buque se rechaza (422)');

const incompleto = await call(capitan, 'POST', '/records', {
  recordTypeId: re01d.id, vesselId: vessel.id, data: {}, submit: true,
});
check(incompleto.status === 422 && /obligatorio/i.test(incompleto.data?.error ?? ''),
  'enviar a revisión sin los campos obligatorios se rechaza', JSON.stringify(incompleto.data));

const clientUuid = crypto.randomUUID();
const alta = await call(capitan, 'POST', '/records', {
  recordTypeId: re01d.id,
  vesselId: vessel.id,
  marea: 'M-200',
  clientUuid,
  data: {
    descripcion: 'Principio de incendio en pañol de popa',
    lugar_inicio: 'Pañol de popa',
    medidas_preventivas: ['Corte suministro eléctrico'],
    elementos_usados: ['Extintores'],
    informa_compania: true,
    hubo_heridos: false,
  },
});
check(alta.status === 201 && alta.data.status === 'borrador', 'alta del borrador', JSON.stringify(alta.data));
const id = alta.data.id;

console.log('\n--- Idempotencia del sync ---');
const reenvio = await call(capitan, 'POST', '/records', {
  recordTypeId: re01d.id, vesselId: vessel.id, clientUuid, data: { descripcion: 'reintento' },
});
check(reenvio.status === 409, 'reenviar el mismo client_uuid no duplica el registro (409)');

console.log('\n--- Firma ---');
const pinMal = await call(capitan, 'POST', `/records/${id}/signatures`, {
  signerRole: 'capitan', fieldKey: 'firma_capitan', method: 'pin', pin: '0000',
});
check(pinMal.status === 403, 'PIN incorrecto rechazado');

const pinOk = await call(capitan, 'POST', `/records/${id}/signatures`, {
  signerRole: 'capitan', fieldKey: 'firma_capitan', method: 'pin', pin: '2345',
});
check(pinOk.status === 201, 'firma por PIN aceptada', JSON.stringify(pinOk.data));

console.log('\n--- Flujo de estados ---');
const enviado = await call(capitan, 'POST', `/records/${id}/submit`);
check(enviado.status === 200 && enviado.data.status === 'pendiente_revision', 'enviado a revisión');

const autorRevisa = await call(capitan, 'POST', `/records/${id}/review`, { decision: 'aprobado' });
check(autorRevisa.status === 403, 'el capitán no puede aprobar su propio registro (403)',
  JSON.stringify(autorRevisa.data));

const sinMotivo = await call(pd, 'POST', `/records/${id}/review`, { decision: 'observado' });
check(sinMotivo.status === 422, 'observar sin motivo escrito se rechaza');

const observado = await call(pd, 'POST', `/records/${id}/review`, {
  decision: 'observado', comment: 'Falta indicar las condiciones meteorológicas.',
});
check(observado.data?.status === 'observado', 'el PD observa el registro');

const reabierto = await call(capitan, 'POST', `/records/${id}/reopen`);
check(reabierto.data?.status === 'borrador', 'el buque lo reabre para corregirlo');

await call(capitan, 'PATCH', `/records/${id}`, {
  data: {
    descripcion: 'Principio de incendio en pañol de popa',
    lugar_inicio: 'Pañol de popa',
    condiciones_meteo: 'Viento SO 20 nudos, mar 1,5 m',
    medidas_preventivas: ['Corte suministro eléctrico'],
    elementos_usados: ['Extintores'],
    informa_compania: true,
    hubo_heridos: false,
  },
});
await call(capitan, 'POST', `/records/${id}/submit`);
const aprobado = await call(pd, 'POST', `/records/${id}/review`, { decision: 'aprobado' });
check(aprobado.data?.status === 'aprobado', 'el PD lo aprueba');

const editarAprobado = await call(capitan, 'PATCH', `/records/${id}`, { data: { descripcion: 'cambio' } });
check(editarAprobado.status === 422, 'un registro aprobado ya no se puede editar (422)');

console.log('\n--- Trazabilidad ---');
const detalle = await call(pd, 'GET', `/records/${id}`);
check(detalle.data.reviews.length === 2, `quedan las dos revisiones en el historial (${detalle.data.reviews.length})`);
check(detalle.data.signatures.length === 1, 'queda la firma asociada al registro');
check(detalle.data.reviews[0].comment?.includes('meteorológicas'),
  'la observación conserva el motivo escrito');

console.log('\n--- Registros enlazados ---');
const ro07a = tipos.find((t) => t.code === 'RO-07A');
const hijo = await call(capitan, 'POST', '/records', {
  recordTypeId: ro07a.id, vesselId: vessel.id, parentId: id,
  data: { fecha_hecho: new Date().toISOString(), descripcion: 'Quemadura leve durante la extinción' },
});
check(hijo.status === 201, 'se crea el RO-07A enlazado al incendio');
const conHijo = await call(capitan, 'GET', `/records/${id}`);
check(conHijo.data.children.some((c) => c.record_code === 'RO-07A'),
  'el registro padre muestra el registro que disparó');

console.log('\n--- Reportes ---');
const compliance = await call(pd, 'GET', '/reports/compliance');
check(compliance.data.rows.some((r) => r.record_code === 'RE-01A' && r.compliance_status === 'vencido'),
  'el reporte de cumplimiento marca el zafarrancho vencido');
const certs = await call(pd, 'GET', '/reports/certificates');
check(certs.data.rows.some((r) => r.status === 'vencido') && certs.data.rows.some((r) => r.status === 'por_vencer'),
  'el reporte de certificados distingue vencido y por vencer');

console.log(`\n=== ${ok} comprobaciones OK, ${fails.length} fallidas ===`);
if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
