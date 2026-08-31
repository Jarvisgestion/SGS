// Vista de impresión: reproduce el formulario en papel a partir del mismo
// field_schema con el que se cargó, para poder entregarlo impreso si PNA lo pide.
//
// Reproduce el encabezado y el pie que el MGS usa en todos sus formularios
// (empresa, "MGS ORD. PNA 05/18", revisión, fecha de vigencia, código; firmas al
// pie), porque un registro impreso sin ese marco no es el formulario del manual.

import { el } from './form.js';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('es-AR') : '—');
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('es-AR') : '—');

const marca = (activo) => (activo ? '☑' : '☐');

function valorSimple(field, valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (field.type === 'boolean') return valor === true ? 'Sí' : 'No';
  if (field.type === 'date') return fmtDate(valor);
  if (field.type === 'datetime') return fmtDateTime(valor);
  return String(valor);
}

function bloqueCampo(field, data, refs) {
  const valor = data?.[field.key];

  if (field.type === 'section') {
    return el('h3', { class: 'p-section', text: field.label ?? field.key });
  }

  if (field.type === 'checklist' || field.type === 'multiselect') {
    const marcados = Array.isArray(valor) ? valor : [];
    return el('div', { class: 'p-campo' }, [
      el('div', { class: 'p-label', text: field.label ?? field.key }),
      el('div', { class: 'p-opciones' },
        (field.options ?? []).map((o) =>
          el('span', { class: 'p-opcion', text: `${marca(marcados.includes(o))} ${o}` }))),
    ]);
  }

  if (field.type === 'table') {
    const filas = Array.isArray(valor) ? valor : [];
    const cuerpo = el('tbody');
    // Se imprimen al menos 4 filas: si el formulario se completa a mano después
    // de imprimirlo, tiene que haber renglones donde escribir.
    const total = Math.max(filas.length, 4);
    for (let i = 0; i < total; i++) {
      const fila = filas[i] ?? {};
      cuerpo.append(el('tr', {}, field.columns.map((c) =>
        el('td', { text: valorSimple(c, fila[c.key]) === '—' ? '' : valorSimple(c, fila[c.key]) }))));
    }
    return el('div', { class: 'p-campo' }, [
      el('div', { class: 'p-label', text: field.label ?? field.key }),
      el('table', { class: 'p-tabla' }, [
        el('thead', {}, [el('tr', {}, field.columns.map((c) =>
          el('th', { text: c.label ?? c.key })))]),
        cuerpo,
      ]),
    ]);
  }

  if (field.type === 'signature_block') return null;   // van al pie
  if (field.type === 'file') return null;              // los adjuntos se listan aparte

  if (field.type === 'user_reference') {
    const u = (refs.users ?? []).find((x) => x.id === valor);
    return el('div', { class: 'p-campo p-inline' }, [
      el('span', { class: 'p-label', text: `${field.label ?? field.key}:` }),
      el('span', { class: 'p-valor', text: u ? u.full_name : '—' }),
    ]);
  }
  if (field.type === 'risk_reference') {
    const r = (refs.risks ?? []).find((x) => x.id === valor);
    return el('div', { class: 'p-campo p-inline' }, [
      el('span', { class: 'p-label', text: `${field.label ?? field.key}:` }),
      el('span', { class: 'p-valor', text: r ? `${r.code ?? ''} ${r.hazard_source}`.trim() : '—' }),
    ]);
  }

  const largo = field.type === 'textarea';
  const texto = valorSimple(field, valor);
  return el('div', { class: `p-campo ${largo ? '' : 'p-inline'}` }, [
    el('span', { class: 'p-label', text: `${field.label ?? field.key}${largo ? '' : ':'}` }),
    // En los campos largos sin dato se deja el recuadro vacío: así el impreso
    // también sirve como formulario en blanco para completar a mano.
    el('div', { class: largo ? 'p-valor p-caja' : 'p-valor',
                text: largo && texto === '—' ? '' : texto }),
  ]);
}

export function renderPrintable(r, refs = {}) {
  const hoja = el('div', { class: 'hoja' });

  // --- Encabezado del MGS ---
  hoja.append(el('table', { class: 'p-encabezado' }, [
    el('tbody', {}, [
      el('tr', {}, [
        el('td', { class: 'p-empresa', rowspan: '3' }, [
          el('div', { class: 'p-empresa-nombre', text: r.companyName }),
        ]),
        el('td', { class: 'p-titulo', rowspan: '2' }, [
          el('div', { text: r.regulationReference ? `MGS ${r.regulationReference}` : 'MGS' }),
          el('div', { class: 'p-titulo-fuerte', text: 'SISTEMA DE GESTIÓN DE SEGURIDAD' }),
        ]),
        el('td', { class: 'p-meta', text: `N° de Revisión: ${r.manualRevision ?? '—'}` }),
      ]),
      el('tr', {}, [
        el('td', { class: 'p-meta', text: `Fecha de vigencia: ${fmtDate(r.manualEffectiveDate)}` }),
      ]),
      el('tr', {}, [
        el('td', { class: 'p-meta', text: `${r.procedureCode} — ${r.procedureName ?? ''}` }),
        el('td', { class: 'p-meta', text: `Código: ${r.code}  ·  Formulario v${r.formVersion}` }),
      ]),
    ]),
  ]));

  hoja.append(el('h2', { class: 'p-nombre', text: r.name }));

  // --- Identificación del registro ---
  const ident = [
    ['Buque', r.vesselName ?? '—'],
    ['Matrícula', r.matricula ?? '—'],
    ['Marea / Singladura', r.marea ?? r.singladura ?? '—'],
    ['Fecha', fmtDate(r.occurredAt)],
    ['Hora', r.occurredAt ? new Date(r.occurredAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'],
  ];
  hoja.append(el('table', { class: 'p-ident' }, [
    el('tbody', {}, [
      el('tr', {}, ident.map(([k]) => el('th', { text: k }))),
      el('tr', {}, ident.map(([, v]) => el('td', { text: v }))),
    ]),
  ]));

  // --- Cuerpo ---
  const cuerpo = el('div', { class: 'p-cuerpo' });
  for (const field of r.fieldSchema) {
    const bloque = bloqueCampo(field, r.data, refs);
    if (bloque) cuerpo.append(bloque);
  }
  hoja.append(cuerpo);

  // --- Pie de firmas ---
  const firmas = r.fieldSchema.filter((f) => f.type === 'signature_block');
  if (firmas.length) {
    hoja.append(el('div', { class: 'p-firmas' }, firmas.map((f) => {
      const firmada = (r.signatures ?? []).find((s) => s.field_key === f.key);
      return el('div', { class: 'p-firma' }, [
        el('div', { class: 'p-firma-linea' }),
        el('div', { class: 'p-firma-rol', text: f.label ?? f.signer_role }),
        el('div', { class: 'p-firma-aclara',
          text: firmada ? `${firmada.signer_name} — ${fmtDateTime(firmada.signed_at)}` : 'Aclaración y fecha' }),
      ]);
    })));
  }

  // --- Trazabilidad al pie ---
  const traza = el('div', { class: 'p-traza' });
  traza.append(el('div', { text: `Cargado por ${r.createdByName} el ${fmtDateTime(r.createdAt)}. Estado: ${r.status.replace(/_/g, ' ')}.` }));
  for (const rev of r.reviews ?? []) {
    traza.append(el('div', {
      text: `${rev.decision === 'aprobado' ? 'Aprobado' : 'Observado'} por ${rev.reviewer_name} el ${fmtDateTime(rev.reviewed_at)}${rev.comment ? ` — ${rev.comment}` : ''}`,
    }));
  }
  const firmados = (r.attachments ?? []).filter((a) => a.kind === 'formulario_firmado');
  if (firmados.length) {
    for (const a of firmados) {
      traza.append(el('div', {
        text: `Respaldo en papel adjunto: ${a.file_name} (SHA-256 ${(a.checksum_sha256 ?? '').slice(0, 16)}…)`,
      }));
    }
  } else if (r.requiresSignedAttachment) {
    traza.append(el('div', { class: 'p-alerta',
      text: 'Sin el formulario en papel firmado adjunto.' }));
  }
  // La firma digital no está habilitada por PNA: el impreso lo dice, para que
  // nadie confunda este papel con un documento ya firmado.
  traza.append(el('div', { class: 'p-nota-legal',
    text: 'La firma digital no se encuentra habilitada. Este impreso reproduce los datos cargados en la plataforma; la evidencia firmada es el formulario en papel.' }));
  hoja.append(traza);

  return hoja;
}
