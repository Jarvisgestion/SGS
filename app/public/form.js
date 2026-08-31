// Renderiza un formulario a partir del field_schema de un tipo de registro, y
// vuelve a leer los valores en un objeto `data` con las mismas claves.
//
// Es la pieza que justifica todo el modelo dinámico: acá no hay ni una sola
// referencia a "RE-01D" ni a ningún registro concreto. La app no sabe qué
// formularios existen; los descubre del catálogo de cada empresa.

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};

const INPUT_TYPE = {
  text: 'text', number: 'number', date: 'date', time: 'time', datetime: 'datetime-local',
};

/** Un control simple, usado tanto suelto como dentro de una celda de tabla. */
function simpleControl(field, value, disabled, refs) {
  const t = field.type;
  if (t === 'textarea') {
    return el('textarea', { disabled, name: field.key }, [value ?? '']);
  }
  if (t === 'select') {
    const sel = el('select', { disabled, name: field.key });
    sel.append(el('option', { value: '', text: '—' }));
    for (const o of field.options ?? []) {
      sel.append(el('option', { value: o, text: o, selected: value === o }));
    }
    return sel;
  }
  if (t === 'boolean') {
    return el('label', { class: 'opts' }, [
      el('input', { type: 'checkbox', disabled, checked: value === true }),
      el('span', { text: value === true ? 'Sí' : 'No' }),
    ]);
  }
  if (t === 'user_reference' || t === 'risk_reference') {
    const list = t === 'user_reference' ? refs.users : refs.risks;
    const sel = el('select', { disabled, name: field.key });
    sel.append(el('option', { value: '', text: '—' }));
    for (const o of list ?? []) {
      const label = t === 'user_reference'
        ? o.full_name
        : `${o.code ?? 's/código'} · ${o.work_position} · ${o.hazard_source}`;
      sel.append(el('option', { value: o.id, text: label, selected: value === o.id }));
    }
    return sel;
  }
  return el('input', {
    type: INPUT_TYPE[t] ?? 'text', disabled, name: field.key,
    value: value ?? '', step: t === 'number' ? 'any' : null,
  });
}

function readSimple(field, node) {
  const t = field.type;
  if (t === 'boolean') return node.querySelector('input').checked;
  const input = node.matches('input, select, textarea') ? node : node.querySelector('input, select, textarea');
  if (!input) return null;
  const raw = input.value;
  if (raw === '') return null;
  if (t === 'number') return Number(raw);
  return raw;
}

/**
 * @param schema  field_schema del tipo de registro
 * @param data    valores actuales
 * @param opts    { disabled, refs, signatures, onSign, onTrigger }
 * @returns       { node, read() }
 */
export function renderForm(schema, data, opts = {}) {
  const { disabled = false, refs = {}, signatures = [], onSign, onTrigger } = opts;
  const container = el('div');
  const readers = [];

  for (const field of schema) {
    if (field.type === 'section') {
      container.append(el('h3', { text: field.label ?? field.key }));
      continue;
    }

    const wrap = el('div', { class: 'field' });
    const label = el('label', {}, [field.label ?? field.key]);
    if (field.required) label.append(el('span', { class: 'req', text: ' *' }));
    wrap.append(label);
    const value = data?.[field.key];

    if (field.type === 'signature_block') {
      const signed = signatures.find((s) => s.field_key === field.key);
      if (signed) {
        wrap.append(el('div', { class: 'hint',
          text: `Firmado por ${signed.signer_name} (${signed.method === 'pin' ? 'PIN' : 'manuscrita'}) el ${new Date(signed.signed_at).toLocaleString('es-AR')}` }));
      } else {
        wrap.append(el('div', { class: 'hint', text: `Rol que firma: ${field.signer_role}` }));
        const btn = el('button', { type: 'button', text: 'Firmar', disabled: !onSign });
        btn.addEventListener('click', () => onSign?.(field));
        wrap.append(btn);
      }
      container.append(wrap);
      continue;
    }

    if (field.type === 'file') {
      wrap.append(el('div', { class: 'readonly-note',
        text: 'Adjuntos: el esquema los soporta (tabla attachments); la carga de archivos no está implementada en el prototipo.' }));
      container.append(wrap);
      continue;
    }

    if (field.type === 'checklist' || field.type === 'multiselect') {
      const box = el('div', { class: 'opts' });
      const current = Array.isArray(value) ? value : [];
      for (const o of field.options ?? []) {
        box.append(el('label', {}, [
          el('input', { type: 'checkbox', value: o, disabled, checked: current.includes(o) }),
          el('span', { text: o }),
        ]));
      }
      wrap.append(box);
      readers.push(() => [field.key, [...box.querySelectorAll('input:checked')].map((i) => i.value)]);
      container.append(wrap);
      continue;
    }

    if (field.type === 'table') {
      const table = el('table', { class: 'subtable' });
      const head = el('tr');
      for (const c of field.columns) head.append(el('th', { text: c.label ?? c.key }));
      if (!disabled) head.append(el('th', { text: '' }));
      table.append(el('thead', {}, [head]));
      const body = el('tbody');

      const addRow = (rowData = {}) => {
        const tr = el('tr');
        for (const c of field.columns) {
          tr.append(el('td', {}, [simpleControl(c, rowData[c.key], disabled, refs)]));
        }
        if (!disabled) {
          tr.append(el('td', {}, [
            el('button', { type: 'button', class: 'danger', text: '×', onclick: () => tr.remove() }),
          ]));
        }
        body.append(tr);
      };
      for (const r of Array.isArray(value) ? value : []) addRow(r);
      if (!disabled && body.children.length === 0) addRow();

      table.append(body);
      wrap.append(table);
      if (!disabled) {
        wrap.append(el('button', { type: 'button', text: '+ Agregar fila',
          onclick: () => addRow() }));
      }
      readers.push(() => [field.key, [...body.children].map((tr) => {
        const row = {};
        field.columns.forEach((c, i) => { row[c.key] = readSimple(c, tr.children[i]); });
        return row;
      }).filter((row) => Object.values(row).some((v) => v !== null && v !== ''))]);
      container.append(wrap);
      continue;
    }

    const control = simpleControl(field, value, disabled, refs);
    wrap.append(control);

    // Un booleano marcado con triggers_record_type ofrece crear el registro
    // enlazado (RE-01D "hubo heridos" -> RO-07A). La regla vive en el catálogo,
    // no en este código.
    if (field.type === 'boolean' && field.triggers_record_type && !onTrigger) {
      const box = control.querySelector('input');
      const nota = el('div', { class: 'hint',
        text: `Al guardar el registro vas a poder crear el ${field.triggers_record_type} enlazado.` });
      const sync = () => { nota.style.display = box.checked ? '' : 'none'; };
      box.addEventListener('change', sync);
      sync();
      wrap.append(nota);
    }
    if (field.type === 'boolean' && field.triggers_record_type && onTrigger) {
      const box = control.querySelector('input');
      const link = el('button', { type: 'button', class: 'primary',
        text: `Crear ${field.triggers_record_type} enlazado`, style: 'margin-top:.4rem' });
      link.addEventListener('click', () => onTrigger(field.triggers_record_type));
      const sync = () => { link.style.display = box.checked ? '' : 'none'; };
      box.addEventListener('change', sync);
      sync();
      wrap.append(link);
    }
    if (field.type === 'boolean') {
      const box = control.querySelector('input');
      const text = control.querySelector('span');
      box.addEventListener('change', () => { text.textContent = box.checked ? 'Sí' : 'No'; });
    }

    readers.push(() => [field.key, readSimple(field, wrap)]);
    container.append(wrap);
  }

  return {
    node: container,
    read() {
      const out = {};
      for (const r of readers) {
        const [k, v] = r();
        // Los vacíos no se mandan: la base rechaza claves ajenas al schema, pero
        // guardar nulls infla el JSON sin aportar nada.
        if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
        out[k] = v;
      }
      return out;
    },
  };
}

export { el };
