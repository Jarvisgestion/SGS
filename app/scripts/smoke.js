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
check(cat.data.pilotProcedures?.join(',') === 'PE-01', 'la API declara que el piloto es PE-01');
check(tipos.length === 7, `el catálogo ofrece solo los 7 registros de PE-01 (${tipos.length})`);
check(tipos.every((t) => t.fieldCount > 0), 'los 7 registros de PE-01 tienen sus campos cargados');

const re01a = tipos.find((t) => t.code === 'RE-01A');
check(re01a?.requiresSignedAttachment === true, 'RE-01A exige el PDF del formulario firmado');
check(tipos.filter((t) => t.requiresSignedAttachment).length === 1,
  'es el único de PE-01 que lo exige: el resto se completa e imprime');

const re01d = tipos.find((t) => t.code === 'RE-01D');
check(re01d?.canCreate === true, 'el capitán puede crear un RE-01D');
check(!tipos.some((t) => t.code === 'RMGS-01'),
  'los procedimientos fuera del piloto no se ofrecen para carga');

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

console.log('\n--- Registros enlazados dentro del piloto ---');
const re01r = tipos.find((t) => t.code === 'RE-01R');
const hijo = await call(capitan, 'POST', '/records', {
  recordTypeId: re01r.id, vesselId: vessel.id, parentId: id,
  data: { motivo: 'Sin propulsión tras el incendio', rol: 'Remolcado',
          otro_buque_nombre: 'Remolcador Austral' },
});
check(hijo.status === 201, 'se crea el RE-01R enlazado al incendio');
const conHijo = await call(capitan, 'GET', `/records/${id}`);
check(conHijo.data.children.some((c) => c.record_code === 'RE-01R'),
  'el registro padre muestra el registro que disparó');

console.log('\n--- Zafarrancho: el circuito con respaldo en papel ---');
const zafa = await call(capitan, 'POST', '/records', {
  recordTypeId: re01a.id, vesselId: vessel.id, marea: 'M-201',
  data: {
    tipo_ejercicio: 'Abandono',
    tema_tratado: 'Zafarrancho de abandono con arriado de balsa',
    duracion_min: 40,
    asistentes: [{ nombre: 'Luis Ocampo', dni: '20333444', puesto: 'Capitán' }],
  },
  submit: true,
});
check(zafa.status === 201, 'el capitán carga y envía el zafarrancho', JSON.stringify(zafa.data));
const zafaId = zafa.data.id;

const sinPapel = await call(pd, 'POST', `/records/${zafaId}/review`, { decision: 'aprobado' });
check(sinPapel.status === 422 && /papel/i.test(sinPapel.data?.error ?? ''),
  'no se puede aprobar el zafarrancho sin el formulario en papel firmado',
  JSON.stringify(sinPapel.data));

const detalleSinPapel = await call(pd, 'GET', `/records/${zafaId}`);
check(detalleSinPapel.data.backingStatus === 'falta_respaldo',
  'el registro informa que le falta el respaldo');

// Un PDF mínimo pero real, para ejercitar la subida de verdad.
const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
  'trailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');

const subirMal = await fetch(
  `${BASE}/api/records/${zafaId}/attachments?fileName=nota.txt&kind=formulario_firmado`,
  { method: 'POST', headers: { 'content-type': 'text/plain', authorization: `Bearer ${capitan}` },
    body: 'no es un PDF' });
check(subirMal.status === 415, 'un archivo de texto se rechaza (415)');

const subida = await fetch(
  `${BASE}/api/records/${zafaId}/attachments?fileName=RE-01A%20firmado.pdf&kind=formulario_firmado`,
  { method: 'POST', headers: { 'content-type': 'application/pdf', authorization: `Bearer ${capitan}` },
    body: pdf });
const subidaBody = await subida.json().catch(() => null);
check(subida.status === 201, 'se sube el PDF del formulario firmado', JSON.stringify(subidaBody));
check(/^[0-9a-f]{64}$/.test(subidaBody?.checksum_sha256 ?? ''),
  'queda registrado el SHA-256 del archivo');

const descarga = await fetch(`${BASE}/api/attachments/${subidaBody.id}`,
  { headers: { authorization: `Bearer ${pd}` } });
const bytes = Buffer.from(await descarga.arrayBuffer());
check(descarga.status === 200 && bytes.equals(pdf),
  'el PD descarga exactamente el mismo archivo que subió el buque');

const sinSesion = await fetch(`${BASE}/api/attachments/${subidaBody.id}`);
check(sinSesion.status === 401, 'sin sesión no se descarga el adjunto');

const conPapel = await call(pd, 'POST', `/records/${zafaId}/review`, { decision: 'aprobado' });
check(conPapel.data?.status === 'aprobado', 'con el PDF adjunto, el PD aprueba el zafarrancho',
  JSON.stringify(conPapel.data));

const borrarTrasAprobar = await call(capitan, 'DELETE', `/attachments/${subidaBody.id}`);
check(borrarTrasAprobar.status === 422,
  'ya aprobado, el respaldo no se puede quitar');

console.log('\n--- Impresión ---');
const paraImprimir = await call(pd, 'GET', `/records/${zafaId}`);
check(!!paraImprimir.data.companyName && !!paraImprimir.data.manualRevision
      && !!paraImprimir.data.formVersion,
  'el registro trae el encabezado del MGS para poder imprimirlo');
check(Array.isArray(paraImprimir.data.fieldSchema) && paraImprimir.data.fieldSchema.length > 0,
  'y trae el formulario con el que se completó, no solo los datos');

console.log('\n--- Reportes ---');
const compliance = await call(pd, 'GET', '/reports/compliance');
check(compliance.data.rows.every((r) => r.procedure_code === 'PE-01'),
  'el reporte de cumplimiento queda acotado al piloto');
check(compliance.data.rows.some((r) => r.record_code === 'RE-01A'),
  'el zafarrancho figura en el control de cumplimiento');
const certs = await call(pd, 'GET', '/reports/certificates');
check(certs.data.rows.some((r) => r.status === 'vencido') && certs.data.rows.some((r) => r.status === 'por_vencer'),
  'el reporte de certificados distingue vencido y por vencer');

console.log(`\n=== ${ok} comprobaciones OK, ${fails.length} fallidas ===`);
if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
