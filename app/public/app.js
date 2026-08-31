import { renderForm, el } from './form.js';

const state = {
  token: localStorage.getItem('sgs.token'),
  user: null,
  view: 'catalogo',
  refs: { users: [], risks: [], vessels: [] },
};

const DRAFTS_KEY = 'sgs.drafts';           // borradores locales pendientes de enviar
const loadDrafts = () => JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}');
const saveDrafts = (d) => localStorage.setItem(DRAFTS_KEY, JSON.stringify(d));

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.error ?? `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

const root = () => document.getElementById('app');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('es-AR') : '—');
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('es-AR') : '—');
const badge = (s) => el('span', { class: `badge ${s}`, text: s.replace(/_/g, ' ') });

function showError(container, message) {
  container.prepend(el('div', { class: 'error', text: message }));
}

// ---------------------------------------------------------------- login
function renderLogin(message) {
  const form = el('div', { class: 'panel' });
  const email = el('input', { type: 'email', value: 'capitan@demo.local', autocomplete: 'username' });
  const pass = el('input', { type: 'password', value: 'demo1234', autocomplete: 'current-password' });
  const btn = el('button', { class: 'primary', text: 'Ingresar' });

  const submit = async () => {
    btn.disabled = true;
    try {
      const out = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.value, password: pass.value }),
      });
      state.token = out.token;
      state.user = out.user;
      localStorage.setItem('sgs.token', out.token);
      await boot();
    } catch (err) {
      showError(form, err.message);
    } finally {
      btn.disabled = false;
    }
  };
  pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  btn.addEventListener('click', submit);

  form.append(
    el('h2', { text: 'Sistema de Gestión de Seguridad' }),
    el('p', { class: 'hint', text: 'Prototipo. Usuarios de demo: capitan@ · pd@ · jm@ · guardia@demo.local — contraseña demo1234' }),
    el('div', { class: 'field' }, [el('label', { text: 'Correo' }), email]),
    el('div', { class: 'field' }, [el('label', { text: 'Contraseña' }), pass]),
    btn,
  );
  const wrap = el('div', { class: 'login' }, [form]);
  if (message) showError(form, message);
  root().replaceChildren(wrap);
}

// ---------------------------------------------------------------- chrome
function renderChrome(content) {
  const pending = Object.keys(loadDrafts()).length;
  const tabs = [
    ['catalogo', 'Catálogo'],
    ['registros', 'Registros'],
    ['revision', 'Bandeja de revisión'],
    ['cumplimiento', 'Cumplimiento'],
    ['certificados', 'Certificados'],
  ];
  const nav = el('nav');
  for (const [key, label] of tabs) {
    const b = el('button', { class: state.view === key ? 'active' : '', text: label });
    b.addEventListener('click', () => go(key));
    if (key === 'registros' && pending) b.append(el('span', { class: 'pending-badge', text: String(pending) }));
    nav.append(b);
  }
  const logout = el('button', { text: 'Salir' });
  logout.addEventListener('click', () => {
    localStorage.removeItem('sgs.token');
    state.token = null; state.user = null;
    renderLogin();
  });

  root().replaceChildren(
    el('header', { class: 'topbar' }, [
      el('h1', { text: 'SGS' }), nav, el('div', { class: 'spacer' }),
      el('div', { class: 'who' }, [
        el('div', { text: state.user.fullName }),
        el('div', { text: state.user.roles.join(', ') || 'sin rol asignado' }),
      ]),
      logout,
    ]),
    el('main', {}, [content]),
  );
}

async function go(view, arg) {
  state.view = view;
  const main = el('div', {}, [el('p', { class: 'hint', text: 'Cargando…' })]);
  renderChrome(main);
  try {
    const content = await VIEWS[view](arg);
    renderChrome(content);
  } catch (err) {
    if (err.status === 401) { renderLogin('La sesión venció. Ingresá de nuevo.'); return; }
    const panel = el('div', { class: 'panel' });
    showError(panel, err.message);
    renderChrome(panel);
  }
}

// ---------------------------------------------------------------- catálogo
async function viewCatalogo() {
  const { procedures } = await api('/catalog');
  const wrap = el('div');
  wrap.append(el('div', { class: 'panel' }, [
    el('h2', { text: 'Catálogo de registros' }),
    el('p', { class: 'hint', text: `${procedures.reduce((n, p) => n + p.recordTypes.length, 0)} tipos de registro en ${procedures.length} procedimientos. Nada de esto está en el código: sale del catálogo de la empresa.` }),
  ]));

  for (const proc of procedures) {
    const rows = el('tbody');
    for (const rt of proc.recordTypes) {
      const tr = el('tr');
      const nuevo = el('button', {
        text: rt.fieldCount === 0 ? 'Sin campos' : 'Nuevo',
        disabled: !rt.canCreate || rt.fieldCount === 0,
        title: !rt.canCreate ? 'Tu rol no puede crear este registro'
          : rt.fieldCount === 0 ? 'Este tipo todavía no tiene campos relevados' : '',
      });
      nuevo.addEventListener('click', () => go('nuevo', rt.id));
      tr.append(
        el('td', {}, [el('strong', { text: rt.code })]),
        el('td', { text: rt.name }),
        el('td', {}, [el('span', { class: 'muted', text: rt.category })]),
        el('td', { text: rt.recurrenceType === 'fixed_interval_days' ? `cada ${rt.recurrenceDays} días` : rt.recurrenceType }),
        el('td', { text: rt.scope }),
        el('td', {}, [nuevo]),
      );
      rows.append(tr);
    }
    wrap.append(el('div', { class: 'panel' }, [
      el('h2', { text: `${proc.code} — ${proc.name}` }),
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Código' }), el('th', { text: 'Registro' }),
          el('th', { text: 'Categoría' }), el('th', { text: 'Recurrencia' }),
          el('th', { text: 'Alcance' }), el('th', { text: '' }),
        ])]),
        rows,
      ]),
    ]));
  }
  return wrap;
}

// ---------------------------------------------------------------- registros
async function viewRegistros() {
  const wrap = el('div');
  const drafts = loadDrafts();
  const draftKeys = Object.keys(drafts);

  if (draftKeys.length) {
    const panel = el('div', { class: 'panel' });
    const btn = el('button', { class: 'primary', text: `Sincronizar ${draftKeys.length} borrador(es)` });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      let ok = 0; const errores = [];
      for (const key of draftKeys) {
        try {
          await api('/records', { method: 'POST', body: JSON.stringify(drafts[key]) });
          delete drafts[key]; ok++;
        } catch (err) {
          // 409 = el registro ya había llegado en un intento anterior. El
          // client_uuid hace que reintentar sea seguro en vez de duplicar.
          if (err.status === 409) { delete drafts[key]; ok++; }
          else errores.push(err.message);
        }
      }
      saveDrafts(drafts);
      if (errores.length) showError(panel, errores.join('\n'));
      else go('registros');
    });
    panel.append(
      el('h2', { text: 'Pendientes de sincronizar' }),
      el('p', { class: 'hint', text: 'Guardados en este dispositivo. Si la señal se cortó durante el envío, reintentar es seguro: el client_uuid evita que se dupliquen.' }),
      btn,
    );
    wrap.append(panel);
  }

  const { records } = await api('/records');
  const rows = el('tbody');
  for (const r of records) {
    const tr = el('tr', { class: 'clickable' });
    tr.addEventListener('click', () => go('registro', r.id));
    tr.append(
      el('td', {}, [el('strong', { text: r.record_code })]),
      el('td', { text: r.record_name }),
      el('td', { text: r.vessel_name ?? '—' }),
      el('td', { text: fmtDate(r.occurred_at) }),
      el('td', { text: r.created_by_name }),
      el('td', {}, [badge(r.status)]),
    );
    rows.append(tr);
  }
  wrap.append(el('div', { class: 'panel' }, [
    el('h2', { text: 'Registros' }),
    el('p', { class: 'hint', text: `${records.length} registros visibles. El filtro por empresa lo aplica la base (RLS), no esta pantalla.` }),
    el('table', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Código' }), el('th', { text: 'Registro' }), el('th', { text: 'Buque' }),
        el('th', { text: 'Fecha' }), el('th', { text: 'Cargó' }), el('th', { text: 'Estado' }),
      ])]),
      rows,
    ]),
  ]));
  return wrap;
}

// ---------------------------------------------------------------- alta
async function viewNuevo(recordTypeId, parentId) {
  const rt = await api(`/catalog/${recordTypeId}`);
  const panel = el('div', { class: 'panel' });

  const vesselSel = el('select');
  if (rt.scope !== 'company') {
    // Los de alcance vessel_optional pueden no tener buque; los de alcance vessel
    // lo exigen, así que se preselecciona uno en vez de dejar que el envío falle.
    if (rt.scope !== 'vessel') {
      vesselSel.append(el('option', { value: '', text: '— sin buque (nivel empresa) —' }));
    }
    for (const v of state.refs.vessels) {
      vesselSel.append(el('option', { value: v.id, text: `${v.name} (${v.matricula})` }));
    }
    const preferido = state.user.defaultVesselId ?? (rt.scope === 'vessel' ? state.refs.vessels[0]?.id : '');
    if (preferido) vesselSel.value = preferido;
    if (rt.scope === 'vessel' && state.refs.vessels.length === 0) {
      vesselSel.append(el('option', { value: '', text: 'La empresa no tiene buques cargados' }));
    }
  }
  const occurred = el('input', { type: 'datetime-local', value: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) });
  const marea = el('input', { type: 'text', placeholder: 'Marea / singladura (opcional)' });

  const form = renderForm(rt.fieldSchema, {}, {
    refs: state.refs,
    onSign: () => alert('Las firmas se cargan una vez creado el registro.'),
  });

  const clientUuid = crypto.randomUUID();
  const payload = () => ({
    recordTypeId,
    vesselId: vesselSel.value || null,
    occurredAt: occurred.value ? new Date(occurred.value).toISOString() : null,
    marea: marea.value || null,
    data: form.read(),
    clientUuid,
    parentId: parentId ?? null,
  });

  const guardarLocal = el('button', { text: 'Guardar en el dispositivo' });
  guardarLocal.addEventListener('click', () => {
    const drafts = loadDrafts();
    drafts[clientUuid] = payload();
    saveDrafts(drafts);
    go('registros');
  });

  const guardar = el('button', { text: 'Guardar borrador' });
  guardar.addEventListener('click', async () => {
    try {
      const out = await api('/records', { method: 'POST', body: JSON.stringify(payload()) });
      go('registro', out.id);
    } catch (err) { showError(panel, err.message); }
  });

  const enviar = el('button', { class: 'primary', text: 'Guardar y enviar a revisión' });
  enviar.addEventListener('click', async () => {
    try {
      const out = await api('/records', { method: 'POST', body: JSON.stringify({ ...payload(), submit: true }) });
      go('registro', out.id);
    } catch (err) { showError(panel, err.message); }
  });

  panel.append(
    el('h2', { text: `${rt.code} — ${rt.name}` }),
    el('p', { class: 'hint', text: `${rt.procedureCode} · versión ${rt.version} del formulario · firma: ${rt.signatureRequirement}` }),
    el('div', { class: 'grid2' }, [
      rt.scope === 'company' ? null : el('div', { class: 'field' }, [el('label', { text: 'Buque' }), vesselSel]),
      el('div', { class: 'field' }, [el('label', { text: 'Fecha y hora del hecho' }), occurred]),
      el('div', { class: 'field' }, [el('label', { text: 'Marea' }), marea]),
    ].filter(Boolean)),
    form.node,
    el('div', { class: 'row-actions' }, [enviar, guardar, guardarLocal]),
  );
  return panel;
}

// ---------------------------------------------------------------- detalle
async function viewRegistro(id) {
  const r = await api(`/records/${id}`);
  const wrap = el('div');
  const panel = el('div', { class: 'panel' });
  const editable = r.status === 'borrador';

  const form = renderForm(r.fieldSchema, r.data, {
    disabled: !editable,
    refs: state.refs,
    signatures: r.signatures,
    onSign: (field) => openSignModal(r, field, () => go('registro', id)),
    onTrigger: async (code) => {
      const { procedures } = await api('/catalog');
      const target = procedures.flatMap((p) => p.recordTypes).find((t) => t.code === code);
      if (!target) { alert(`El catálogo de esta empresa no tiene un registro ${code}.`); return; }
      go('nuevo-hijo', { recordTypeId: target.id, parentId: r.id });
    },
  });

  const acciones = el('div', { class: 'row-actions' });
  if (editable) {
    const guardar = el('button', { text: 'Guardar cambios' });
    guardar.addEventListener('click', async () => {
      try {
        await api(`/records/${id}`, { method: 'PATCH', body: JSON.stringify({ data: form.read() }) });
        go('registro', id);
      } catch (err) { showError(panel, err.message); }
    });
    const enviar = el('button', { class: 'primary', text: 'Enviar a revisión' });
    enviar.addEventListener('click', async () => {
      try {
        await api(`/records/${id}`, { method: 'PATCH', body: JSON.stringify({ data: form.read() }) });
        await api(`/records/${id}/submit`, { method: 'POST' });
        go('registro', id);
      } catch (err) { showError(panel, err.message); }
    });
    acciones.append(enviar, guardar);
  }
  if (r.status === 'observado') {
    const reabrir = el('button', { class: 'primary', text: 'Corregir (volver a borrador)' });
    reabrir.addEventListener('click', async () => {
      try { await api(`/records/${id}/reopen`, { method: 'POST' }); go('registro', id); }
      catch (err) { showError(panel, err.message); }
    });
    acciones.append(reabrir);
  }
  if (r.status === 'pendiente_revision' && r.canReview) {
    const aprobar = el('button', { class: 'primary', text: 'Aprobar' });
    aprobar.addEventListener('click', async () => {
      try {
        await api(`/records/${id}/review`, { method: 'POST', body: JSON.stringify({ decision: 'aprobado' }) });
        go('registro', id);
      } catch (err) { showError(panel, err.message); }
    });
    const observar = el('button', { text: 'Observar' });
    observar.addEventListener('click', async () => {
      const comment = prompt('Motivo de la observación (obligatorio):');
      if (!comment) return;
      try {
        await api(`/records/${id}/review`, { method: 'POST', body: JSON.stringify({ decision: 'observado', comment }) });
        go('registro', id);
      } catch (err) { showError(panel, err.message); }
    });
    acciones.append(aprobar, observar);
  }

  // Node.append() convierte null en el texto "null": hay que filtrar antes.
  panel.append(...[
    el('h2', {}, [`${r.code} — ${r.name}  `, badge(r.status)]),
    el('p', { class: 'hint', text: `${r.procedureCode} · ${r.vesselName ?? 'nivel empresa'} · ${fmtDateTime(r.occurredAt)} · cargó ${r.createdByName}` }),
    r.status === 'aprobado'
      ? el('div', { class: 'notice', text: 'Registro aprobado. Es de solo lectura: la base rechaza cualquier modificación.' })
      : null,
    r.status === 'observado' && r.reviews.length
      ? el('div', { class: 'error', text: `Observado: ${r.reviews[r.reviews.length - 1].comment}` })
      : null,
    form.node,
    acciones,
  ].filter(Boolean));
  wrap.append(panel);

  if (r.reviews.length) {
    const rows = el('tbody');
    for (const rev of r.reviews) {
      rows.append(el('tr', {}, [
        el('td', {}, [badge(rev.decision)]),
        el('td', { text: rev.reviewer_name }),
        el('td', { text: rev.comment ?? '—' }),
        el('td', { text: fmtDateTime(rev.reviewed_at) }),
      ]));
    }
    wrap.append(el('div', { class: 'panel' }, [
      el('h2', { text: 'Historial de revisión' }),
      el('p', { class: 'hint', text: 'Append-only: nunca se pisa una decisión anterior.' }),
      el('table', {}, [el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Decisión' }), el('th', { text: 'Revisor' }),
        el('th', { text: 'Comentario' }), el('th', { text: 'Fecha' }),
      ])]), rows]),
    ]));
  }

  if (r.children.length) {
    const list = el('div', { class: 'panel' }, [el('h2', { text: 'Registros enlazados' })]);
    for (const c of r.children) {
      const b = el('button', { text: `${c.record_code} (${c.status})` });
      b.addEventListener('click', () => go('registro', c.id));
      list.append(b);
    }
    wrap.append(list);
  }
  if (r.parentId) {
    const b = el('button', { text: 'Ver el registro que lo originó' });
    b.addEventListener('click', () => go('registro', r.parentId));
    wrap.append(el('div', { class: 'panel' }, [b]));
  }
  return wrap;
}

// ---------------------------------------------------------------- firma
function openSignModal(record, field, onDone) {
  const bg = el('div', { class: 'modal-bg' });
  const modal = el('div', { class: 'modal' });
  const close = () => bg.remove();

  const canvas = el('canvas', { class: 'sigpad' });
  const pin = el('input', { type: 'password', inputmode: 'numeric', placeholder: 'PIN' });
  const modo = el('select');
  const req = record.signatureRequirement;
  const opciones = req === 'pin' ? [['pin', 'PIN']]
    : req === 'manuscrita' ? [['canvas', 'Firma manuscrita']]
    : [['canvas', 'Firma manuscrita'], ['pin', 'PIN']];
  for (const [v, t] of opciones) modo.append(el('option', { value: v, text: t }));

  const canvasBox = el('div', {}, [canvas, el('p', { class: 'hint', text: 'Firmá con el dedo o el mouse.' })]);
  const pinBox = el('div', { class: 'field' }, [el('label', { text: 'PIN de confirmación' }), pin]);
  const sync = () => {
    canvasBox.style.display = modo.value === 'canvas' ? '' : 'none';
    pinBox.style.display = modo.value === 'pin' ? '' : 'none';
  };
  modo.addEventListener('change', sync);

  let dibujo = false, hayTrazo = false;
  requestAnimationFrame(() => {
    canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#16202c';
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const p = e.touches?.[0] ?? e;
      return [p.clientX - r.left, p.clientY - r.top];
    };
    const start = (e) => { e.preventDefault(); dibujo = true; hayTrazo = true; ctx.beginPath(); ctx.moveTo(...pos(e)); };
    const move = (e) => { if (!dibujo) return; e.preventDefault(); ctx.lineTo(...pos(e)); ctx.stroke(); };
    const end = () => { dibujo = false; };
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    sync();
  });

  const firmar = el('button', { class: 'primary', text: 'Firmar' });
  firmar.addEventListener('click', async () => {
    firmar.disabled = true;
    try {
      const body = { signerRole: field.signer_role, fieldKey: field.key, method: modo.value };
      if (modo.value === 'canvas') {
        if (!hayTrazo) throw new Error('Falta trazar la firma.');
        body.signatureImage = canvas.toDataURL('image/png');
      } else {
        body.pin = pin.value;
      }
      await api(`/records/${record.id}/signatures`, { method: 'POST', body: JSON.stringify(body) });
      close(); onDone();
    } catch (err) {
      showError(modal, err.message);
      firmar.disabled = false;
    }
  });

  modal.append(
    el('h2', { text: field.label ?? field.key }),
    el('p', { class: 'hint', text: `Firma como: ${field.signer_role}` }),
    el('div', { class: 'field' }, [el('label', { text: 'Método' }), modo]),
    canvasBox, pinBox,
    el('div', { class: 'row-actions' }, [
      firmar, el('button', { text: 'Cancelar', onclick: close }),
    ]),
  );
  bg.append(modal);
  document.getElementById('modal-root').append(bg);
}

// ---------------------------------------------------------------- reportes
async function viewRevision() {
  const { rows } = await api('/reports/pending');
  const body = el('tbody');
  for (const r of rows) {
    const tr = el('tr', { class: 'clickable' });
    tr.addEventListener('click', () => go('registro', r.record_instance_id));
    tr.append(
      el('td', {}, [el('strong', { text: r.record_code })]),
      el('td', { text: r.record_name }),
      el('td', { text: r.vessel_name ?? '—' }),
      el('td', { text: r.submitted_by }),
      el('td', { text: fmtDateTime(r.submitted_at) }),
      el('td', { text: r.canReview ? 'podés revisarlo' : 'otro rol lo revisa' }),
    );
    body.append(tr);
  }
  return el('div', { class: 'panel' }, [
    el('h2', { text: 'Bandeja de revisión' }),
    el('p', { class: 'hint', text: 'Registros enviados desde los buques esperando aprobación u observación.' }),
    el('table', {}, [el('thead', {}, [el('tr', {}, [
      el('th', { text: 'Código' }), el('th', { text: 'Registro' }), el('th', { text: 'Buque' }),
      el('th', { text: 'Cargó' }), el('th', { text: 'Enviado' }), el('th', { text: '' }),
    ])]), body]),
  ]);
}

async function viewCumplimiento() {
  const { rows } = await api('/reports/compliance');
  const body = el('tbody');
  for (const r of rows) {
    body.append(el('tr', {}, [
      el('td', {}, [el('strong', { text: r.record_code })]),
      el('td', { text: r.record_name }),
      el('td', { text: r.vessel_name ?? 'empresa' }),
      el('td', { text: r.recurrence_type === 'fixed_interval_days' ? `cada ${r.recurrence_days} d` : r.recurrence_type }),
      el('td', { text: fmtDate(r.last_occurred_at) }),
      el('td', { text: fmtDate(r.next_due_at) }),
      el('td', {}, [badge(r.compliance_status)]),
    ]));
  }
  return el('div', { class: 'panel' }, [
    el('h2', { text: 'Cumplimiento del SGS' }),
    el('p', { class: 'hint', text: 'Es el RA-06C (Monitoreo y Control) resuelto como cálculo: no es un formulario que alguien complete, es el estado real de los registros recurrentes.' }),
    el('table', {}, [el('thead', {}, [el('tr', {}, [
      el('th', { text: 'Código' }), el('th', { text: 'Registro' }), el('th', { text: 'Buque' }),
      el('th', { text: 'Recurrencia' }), el('th', { text: 'Último' }),
      el('th', { text: 'Vence' }), el('th', { text: 'Estado' }),
    ])]), body]),
  ]);
}

async function viewCertificados() {
  const { rows } = await api('/reports/certificates');
  const body = el('tbody');
  for (const r of rows) {
    body.append(el('tr', {}, [
      el('td', { text: r.vessel_name }),
      el('td', { text: r.certificate_name }),
      el('td', { text: r.certificate_number ?? '—' }),
      el('td', { text: fmtDate(r.expires_at) }),
      el('td', { text: r.days_to_expiry === null ? '—' : `${r.days_to_expiry} d` }),
      el('td', {}, [badge(r.status)]),
    ]));
  }
  return el('div', { class: 'panel' }, [
    el('h2', { text: 'Certificados' }),
    el('p', { class: 'hint', text: 'El estado no está guardado en ninguna columna: se calcula, así no queda obsoleto solo con que pase el tiempo.' }),
    el('table', {}, [el('thead', {}, [el('tr', {}, [
      el('th', { text: 'Buque' }), el('th', { text: 'Certificado' }), el('th', { text: 'Número' }),
      el('th', { text: 'Vence' }), el('th', { text: 'Faltan' }), el('th', { text: 'Estado' }),
    ])]), body]),
  ]);
}

const VIEWS = {
  catalogo: viewCatalogo,
  registros: viewRegistros,
  revision: viewRevision,
  cumplimiento: viewCumplimiento,
  certificados: viewCertificados,
  nuevo: (id) => viewNuevo(id),
  'nuevo-hijo': ({ recordTypeId, parentId }) => viewNuevo(recordTypeId, parentId),
  registro: viewRegistro,
};

async function boot() {
  if (!state.token) { renderLogin(); return; }
  try {
    const { user } = await api('/me');
    state.user = user;
    const [vessels, users, risks] = await Promise.all([
      api('/vessels').then((r) => r.vessels).catch(() => []),
      api('/users').then((r) => r.users).catch(() => []),
      api('/risks').then((r) => r.risks).catch(() => []),
    ]);
    state.refs = { vessels, users, risks };
    go('catalogo');
  } catch (err) {
    localStorage.removeItem('sgs.token');
    state.token = null;
    renderLogin(err.status === 401 ? null : err.message);
  }
}

boot();
