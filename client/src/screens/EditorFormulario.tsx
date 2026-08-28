import { useEffect, useState } from 'react';
import { mensajeDeError, type Contexto } from '../app.tsx';
import { admin, api, type RecordTypeInput } from '../lib/api.ts';
import { ir } from '../lib/router.ts';
import { emptyForm, label, type Field, type FieldType, type FormData } from '../lib/schema.ts';
import { CampoDinamico } from '../components/Fields.tsx';

const TIPOS: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Texto corto' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' },
  { value: 'time', label: 'Hora' },
  { value: 'datetime', label: 'Fecha y hora' },
  { value: 'select', label: 'Lista desplegable' },
  { value: 'multiselect', label: 'Selección múltiple' },
  { value: 'boolean', label: 'Sí / No' },
  { value: 'checklist', label: 'Lista de comprobación' },
  { value: 'table', label: 'Tabla de filas' },
  { value: 'signature_block', label: 'Bloque de firma' },
  { value: 'file', label: 'Adjunto' },
  { value: 'risk_reference', label: 'Referencia a la matriz de riesgo' },
  { value: 'user_reference', label: 'Referencia a una persona' },
];

const CATEGORIAS = [
  { value: 'master_data', label: 'Ficha maestra' },
  { value: 'scheduled_checklist', label: 'Checklist recurrente' },
  { value: 'incident_event', label: 'Por hecho / siniestro' },
  { value: 'management_review', label: 'Revisión y auditoría' },
  { value: 'risk_assessment', label: 'Evaluación de riesgo' },
  { value: 'inactive_vessel', label: 'Buque inactivo' },
];

const RECURRENCIAS = [
  { value: 'on_event', label: 'Cuando pasa el hecho' },
  { value: 'daily', label: 'Diario' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'fixed_interval_days', label: 'Cada N días' },
  { value: 'none', label: 'Sin recurrencia' },
];

const FIRMAS = [
  { value: 'configurable_por_firmante', label: 'Lo elige quien firma' },
  { value: 'manuscrita', label: 'Firma de puño' },
  { value: 'pin', label: 'Confirmación con PIN' },
  { value: 'ambas', label: 'Firma de puño y PIN' },
  { value: 'none', label: 'Sin firma' },
];

interface Props {
  ctx: Contexto;
  /** id del tipo de registro a editar; sin esto se crea uno nuevo. */
  recordTypeId?: string;
  procedureId?: string;
}

type Borrador = RecordTypeInput & { field_schema: Field[] };

const VACIO: Borrador = {
  code: '',
  name: '',
  category: 'scheduled_checklist',
  scope: 'vessel',
  recurrence_type: 'on_event',
  recurrence_days: null,
  allowed_creator_roles: [],
  allowed_reviewer_roles: [],
  signature_requirement: 'configurable_por_firmante',
  field_schema: [],
};

export function EditorFormulario({ ctx, recordTypeId, procedureId }: Props) {
  const [tipo, setTipo] = useState<Borrador | null>(recordTypeId ? null : { ...VACIO, procedure_id: procedureId });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!recordTypeId) return;
    void (async () => {
      try {
        const rt = await api.recordType(recordTypeId);
        setTipo({
          procedure_id: undefined,
          code: rt.code,
          name: rt.name,
          category: rt.category,
          scope: rt.scope,
          recurrence_type: rt.recurrence_type,
          recurrence_days: rt.recurrence_days ?? null,
          allowed_creator_roles: rt.allowed_creator_roles ?? [],
          allowed_reviewer_roles: rt.allowed_reviewer_roles ?? [],
          signature_requirement: rt.signature_requirement,
          field_schema: rt.field_schema,
        });
      } catch (err) {
        setError(mensajeDeError(err));
      }
    })();
  }, [recordTypeId]);

  if (error && !tipo) return <div className="aviso error">{error}</div>;
  if (!tipo) return <p className="vacio">Cargando…</p>;

  function set(patch: Partial<Borrador>) {
    setTipo({ ...tipo!, ...patch });
  }

  function setCampo(i: number, patch: Partial<Field>) {
    set({ field_schema: tipo!.field_schema.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  }

  function mover(i: number, delta: number) {
    const copia = [...tipo!.field_schema];
    const destino = i + delta;
    if (destino < 0 || destino >= copia.length) return;
    [copia[i], copia[destino]] = [copia[destino]!, copia[i]!];
    set({ field_schema: copia });
  }

  async function guardar() {
    setError(null);
    setAviso(null);

    const claves = tipo!.field_schema.map((f) => f.key);
    if (claves.some((k) => !/^[a-z][a-z0-9_]*$/.test(k))) {
      return setError('Hay claves de campo inválidas: usá minúsculas y guiones bajos.');
    }
    if (new Set(claves).size !== claves.length) {
      return setError('Hay claves de campo repetidas.');
    }

    setGuardando(true);
    try {
      if (recordTypeId) {
        const r = await admin.editarTipoRegistro(recordTypeId, tipo!);
        setAviso(`Guardado. El formulario quedó en la versión ${r.version}; los registros ya cargados conservan la anterior.`);
      } else {
        const creado = await admin.crearTipoRegistro(tipo!);
        await ctx.refrescarCatalogo();
        ir(`admin/formulario/${creado.id}`);
        return;
      }
      await ctx.refrescarCatalogo();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  const previsualizacion: FormData = emptyForm(tipo.field_schema);

  return (
    <>
      <section className="panel">
        <h2>{recordTypeId ? `Editar ${tipo.code}` : 'Nuevo tipo de registro'}</h2>

        <div className="campo">
          <label htmlFor="code">Código</label>
          <input id="code" type="text" value={tipo.code ?? ''} onChange={(e) => set({ code: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="name">Nombre</label>
          <input id="name" type="text" value={tipo.name ?? ''} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="category">Naturaleza</label>
          <select id="category" value={tipo.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="scope">Alcance</label>
          <select
            id="scope"
            value={tipo.scope}
            onChange={(e) => set({ scope: e.target.value as 'company' | 'vessel' })}
          >
            <option value="vessel">Por buque</option>
            <option value="company">De la compañía</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="recurrence">Periodicidad</label>
          <select
            id="recurrence"
            value={tipo.recurrence_type}
            onChange={(e) =>
              set({
                recurrence_type: e.target.value,
                recurrence_days: e.target.value === 'fixed_interval_days' ? (tipo.recurrence_days ?? 30) : null,
              })
            }
          >
            {RECURRENCIAS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        {tipo.recurrence_type === 'fixed_interval_days' && (
          <div className="campo">
            <label htmlFor="dias">Cada cuántos días</label>
            <input
              id="dias"
              type="number"
              value={tipo.recurrence_days ?? 30}
              onChange={(e) => set({ recurrence_days: Number(e.target.value) })}
            />
          </div>
        )}
        <div className="campo">
          <label htmlFor="firma">Cómo se firma</label>
          <select
            id="firma"
            value={tipo.signature_requirement}
            onChange={(e) => set({ signature_requirement: e.target.value as Borrador['signature_requirement'] })}
          >
            {FIRMAS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        <SelectorRoles
          etiqueta="Quién puede emitirlo"
          ayuda="Vacío = cualquiera con acceso a la empresa"
          roles={ctx.roles}
          valor={tipo.allowed_creator_roles ?? []}
          onChange={(v) => set({ allowed_creator_roles: v })}
        />
        <SelectorRoles
          etiqueta="Quién puede revisarlo"
          ayuda="Vacío = cualquiera con acceso a la empresa"
          roles={ctx.roles}
          valor={tipo.allowed_reviewer_roles ?? []}
          onChange={(v) => set({ allowed_reviewer_roles: v })}
        />
      </section>

      <section className="panel">
        <h2>Campos del formulario</h2>
        {tipo.field_schema.length === 0 && <p className="vacio">Todavía no tiene campos.</p>}

        {tipo.field_schema.map((campo, i) => (
          <EditorCampo
            key={i}
            indice={i}
            campo={campo}
            roles={ctx.roles}
            codigosRegistro={ctx.recordTypes.map((rt) => rt.code)}
            primero={i === 0}
            ultimo={i === tipo.field_schema.length - 1}
            onChange={(patch) => setCampo(i, patch)}
            onMover={(d) => mover(i, d)}
            onQuitar={() => set({ field_schema: tipo.field_schema.filter((_, j) => j !== i) })}
          />
        ))}

        <button
          type="button"
          className="boton secundario"
          onClick={() =>
            set({
              field_schema: [
                ...tipo.field_schema,
                { key: `campo_${tipo.field_schema.length + 1}`, type: 'text', label: '' },
              ],
            })
          }
        >
          Agregar campo
        </button>
      </section>

      {tipo.field_schema.length > 0 && (
        <section className="panel">
          <h2>Vista previa</h2>
          <p style={{ color: 'var(--tenue)', marginTop: 0 }}>Así lo va a ver la tripulación.</p>
          {tipo.field_schema
            .filter((f) => f.type !== 'signature_block')
            .map((f, i) => (
              <CampoDinamico key={i} field={f} value={previsualizacion[f.key]} onChange={() => {}} />
            ))}
          {tipo.field_schema
            .filter((f) => f.type === 'signature_block')
            .map((f, i) => (
              <div className="firma" key={i}>
                <div className="cabecera">
                  <strong>{label(f)}</strong>
                  <span className="chip borrador">Sin firmar</span>
                </div>
              </div>
            ))}
        </section>
      )}

      {error && <div className="aviso error">{error}</div>}
      {aviso && <div className="aviso info">{aviso}</div>}

      <div className="acciones">
        <button type="button" className="boton" onClick={() => void guardar()} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="boton secundario" onClick={() => ir('admin')}>
          Volver
        </button>
      </div>
    </>
  );
}

function SelectorRoles({
  etiqueta,
  ayuda,
  roles,
  valor,
  onChange,
}: {
  etiqueta: string;
  ayuda: string;
  roles: { code: string; name: string }[];
  valor: string[];
  onChange(v: string[]): void;
}) {
  const id = etiqueta.replace(/\s/g, '-');
  return (
    <div className="campo">
      <label id={id}>{etiqueta}</label>
      <p style={{ color: 'var(--tenue)', fontSize: 14, margin: '0 0 6px' }}>{ayuda}</p>
      <div className="si-no" style={{ flexWrap: 'wrap' }} role="group" aria-labelledby={id}>
        {roles.map((r) => (
          <button
            key={r.code}
            type="button"
            aria-pressed={valor.includes(r.code)}
            onClick={() =>
              onChange(valor.includes(r.code) ? valor.filter((v) => v !== r.code) : [...valor, r.code])
            }
          >
            {r.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function EditorCampo({
  indice,
  campo,
  roles,
  codigosRegistro,
  primero,
  ultimo,
  onChange,
  onMover,
  onQuitar,
}: {
  indice: number;
  campo: Field;
  roles: { code: string; name: string }[];
  codigosRegistro: string[];
  primero: boolean;
  ultimo: boolean;
  onChange(patch: Partial<Field>): void;
  onMover(delta: number): void;
  onQuitar(): void;
}) {
  const conOpciones = ['select', 'multiselect', 'checklist'].includes(campo.type);
  // Cada control necesita su id propio: son campos dinámicos y sin esto la
  // etiqueta no queda asociada a nada (ni para el usuario ni para un lector).
  const id = (parte: string) => `campo-${indice}-${parte}`;

  return (
    <div className="firma">
      <div className="cabecera">
        <strong>{campo.label || campo.key}</strong>
        <button type="button" className="boton secundario" style={{ minHeight: 36, padding: '4px 10px' }}
                disabled={primero} onClick={() => onMover(-1)} aria-label="Subir">↑</button>
        <button type="button" className="boton secundario" style={{ minHeight: 36, padding: '4px 10px' }}
                disabled={ultimo} onClick={() => onMover(1)} aria-label="Bajar">↓</button>
        <button type="button" className="boton secundario" style={{ minHeight: 36, padding: '4px 10px' }}
                onClick={onQuitar}>Quitar</button>
      </div>

      <div className="campo">
        <label htmlFor={id('etiqueta')}>Etiqueta</label>
        <input id={id('etiqueta')} type="text" value={campo.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} />
      </div>

      <div className="campo">
        <label htmlFor={id('tipo')}>Tipo</label>
        <select id={id('tipo')} value={campo.type} onChange={(e) => onChange({ type: e.target.value as FieldType })}>
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor={id('clave')}>Clave interna</label>
        <input
          id={id('clave')}
          type="text"
          value={campo.key}
          onChange={(e) => onChange({ key: e.target.value })}
          aria-describedby={id('ayuda')}
        />
        <p id={id('ayuda')} style={{ color: 'var(--tenue)', fontSize: 13, margin: '4px 0 0' }}>
          Minúsculas y guiones bajos. Es con lo que se guarda el dato: cambiarla en un
          formulario ya usado deja huérfano lo cargado antes.
        </p>
      </div>

      {campo.type !== 'signature_block' && (
        <div className="campo">
          <label id={id('obligatorio')}>¿Es obligatorio?</label>
          <div className="si-no" role="group" aria-labelledby={id('obligatorio')}>
            <button type="button" aria-pressed={campo.required === true} onClick={() => onChange({ required: true })}>Sí</button>
            <button type="button" aria-pressed={campo.required !== true} onClick={() => onChange({ required: false })}>No</button>
          </div>
        </div>
      )}

      {conOpciones && (
        <div className="campo">
          <label htmlFor={id('opciones')}>Opciones (una por línea)</label>
          <textarea
            id={id('opciones')}
            value={(campo.options ?? []).join('\n')}
            onChange={(e) => onChange({ options: e.target.value.split('\n').filter((o) => o.trim() !== '') })}
          />
        </div>
      )}

      {campo.type === 'table' && (
        <div className="campo">
          <label htmlFor={id('columnas')}>Columnas (una por línea, como <code>clave:tipo</code>)</label>
          <textarea
            id={id('columnas')}
            value={(campo.columns ?? []).map((c) => `${c.key}:${c.type}`).join('\n')}
            onChange={(e) =>
              onChange({
                columns: e.target.value
                  .split('\n')
                  .map((linea) => linea.trim())
                  .filter(Boolean)
                  .map((linea) => {
                    const [clave, tipo] = linea.split(':');
                    return { key: (clave ?? '').trim(), type: (tipo ?? 'text').trim() as never };
                  }),
              })
            }
          />
        </div>
      )}

      {campo.type === 'signature_block' && (
        <div className="campo">
          <label htmlFor={id('firmante')}>Quién firma acá</label>
          <select id={id('firmante')} value={campo.signer_role ?? ''} onChange={(e) => onChange({ signer_role: e.target.value })}>
            <option value="">— Elegir —</option>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      {campo.type === 'boolean' && (
        <div className="campo">
          <label htmlFor={id('dispara')}>Si contestan que sí, ¿exige cargar otro registro?</label>
          <select
            id={id('dispara')}
            value={campo.triggers_record_type ?? ''}
            onChange={(e) => onChange({ triggers_record_type: e.target.value || undefined })}
          >
            <option value="">No</option>
            {codigosRegistro.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
