import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyForm,
  toPayload,
  triggeredRecordTypes,
  validateForm,
  type Field,
} from '../src/lib/schema.ts';

const incendio: Field[] = [
  { key: 'descripcion', type: 'textarea', label: 'Descripción', required: true },
  { key: 'lugar_inicio', type: 'text' },
  {
    key: 'medidas_preventivas',
    type: 'checklist',
    options: ['Corte suministro eléctrico', 'Cierre de ventilación'],
  },
  { key: 'informa_pna', type: 'boolean' },
  { key: 'hubo_heridos', type: 'boolean', triggers_record_type: 'RO-07A' },
  { key: 'firma_capitan', type: 'signature_block', signer_role: 'capitan' },
];

const pedido: Field[] = [
  { key: 'sector', type: 'select', options: ['Puente', 'Máquina'] },
  {
    key: 'items',
    type: 'table',
    columns: [
      { key: 'cantidad_pedida', type: 'number' },
      { key: 'descripcion', type: 'text' },
    ],
  },
];

describe('formulario en blanco', () => {
  it('no crea entradas para los bloques de firma', () => {
    const data = emptyForm(incendio);
    assert.ok(!('firma_capitan' in data));
  });

  it('deja los booleanos sin contestar', () => {
    const data = emptyForm(incendio);
    assert.equal(data.informa_pna, undefined);
  });

  it('arranca el checklist con todos los ítems en OK', () => {
    const data = emptyForm(incendio);
    assert.deepEqual(data.medidas_preventivas, [
      { item: 'Corte suministro eléctrico', status: 'ok' },
      { item: 'Cierre de ventilación', status: 'ok' },
    ]);
  });
});

describe('validación', () => {
  it('reclama los campos obligatorios vacíos', () => {
    const errores = validateForm(incendio, emptyForm(incendio));
    assert.deepEqual(errores, [{ key: 'descripcion', message: 'Este campo es obligatorio' }]);
  });

  it('un booleano en falso es una respuesta, no un vacío', () => {
    const schema: Field[] = [{ key: 'informa_pna', type: 'boolean', required: true }];
    assert.deepEqual(validateForm(schema, { informa_pna: false }), []);
  });

  it('un booleano obligatorio sin contestar sí es un vacío', () => {
    const schema: Field[] = [{ key: 'informa_pna', type: 'boolean', required: true }];
    assert.deepEqual(validateForm(schema, {}), [{ key: 'informa_pna', message: 'Falta contestar' }]);
  });

  it('rechaza una opción que no está en la lista', () => {
    const errores = validateForm(pedido, { sector: 'Cocina', items: [] });
    assert.equal(errores[0]?.message, 'Opción inválida');
  });

  it('rechaza un ítem que no pertenece al checklist', () => {
    const errores = validateForm(incendio, {
      descripcion: 'x',
      medidas_preventivas: [{ item: 'Inventado', status: 'ok' }],
    });
    assert.equal(errores[0]?.key, 'medidas_preventivas');
  });

  it('rechaza una columna que no pertenece a la tabla', () => {
    const errores = validateForm(pedido, { items: [{ inventada: 1 }] });
    assert.equal(errores[0]?.message, 'Columna que no pertenece a la tabla');
  });

  it('exige fecha completa', () => {
    const schema: Field[] = [{ key: 'fecha', type: 'date' }];
    assert.equal(validateForm(schema, { fecha: '2026-08' })[0]?.message, 'Fecha incompleta');
  });
});

describe('armado del envío', () => {
  it('saca los campos vacíos y los bloques de firma', () => {
    const payload = toPayload(incendio, {
      ...emptyForm(incendio),
      descripcion: 'Principio de incendio',
      lugar_inicio: '   ',
    });
    // los booleanos sin contestar no viajan: el registro no afirma nada que
    // nadie haya respondido
    assert.deepEqual(Object.keys(payload).sort(), ['descripcion', 'medidas_preventivas']);
  });

  it('descarta las filas de tabla que quedaron en blanco', () => {
    const payload = toPayload(pedido, {
      sector: 'Puente',
      items: [{ cantidad_pedida: 2, descripcion: 'Guantes' }, {}, { descripcion: '' }],
    });
    assert.equal((payload.items as unknown[]).length, 1);
  });

  it('convierte a número lo que el input dejó como texto', () => {
    const payload = toPayload([{ key: 'duracion', type: 'number' }], { duracion: '45' });
    assert.equal(payload.duracion, 45);
  });

  it('conserva un booleano en falso, que es una respuesta', () => {
    const payload = toPayload(incendio, { ...emptyForm(incendio), descripcion: 'x', informa_pna: false });
    assert.equal(payload.informa_pna, false);
  });
});

describe('registros que disparan otros registros', () => {
  it('detecta el registro hijo cuando la casilla queda en verdadero', () => {
    assert.deepEqual(triggeredRecordTypes(incendio, { hubo_heridos: true }), ['RO-07A']);
  });

  it('no dispara nada si la respuesta fue que no', () => {
    assert.deepEqual(triggeredRecordTypes(incendio, { hubo_heridos: false }), []);
  });
});
