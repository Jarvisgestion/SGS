/**
 * Renderiza un formulario a partir del `field_schema` del tipo de registro.
 * Ningún formulario está escrito en el código: todo sale del catálogo que
 * cada empresa define.
 */
import type { ChangeEvent } from 'react';
import { CampoArchivo } from './Adjunto.tsx';
import {
  CHECKLIST_LABELS,
  label,
  type ChecklistItem,
  type ChecklistStatus,
  type Field,
  type FieldValue,
  type TableColumn,
  type TableRow,
} from '../lib/schema.ts';

interface Props {
  field: Field;
  value: FieldValue;
  error?: string;
  readOnly?: boolean;
  /** Sube un archivo y devuelve el id del adjunto. Sin esto, no se puede adjuntar. */
  subirArchivo?: (archivo: File) => Promise<string>;
  onChange(value: FieldValue): void;
}

/** Campos que no son un control único sino un grupo de botones o una tabla. */
const AGRUPADOS = new Set(['boolean', 'multiselect', 'checklist', 'table']);

export function CampoDinamico({ field, value, error, readOnly, subirArchivo, onChange }: Props) {
  const esGrupo = AGRUPADOS.has(field.type);
  const idEtiqueta = `${field.key}-label`;
  const interno = control({ field, value, error, readOnly, subirArchivo, onChange });

  return (
    <div className="campo">
      <label id={idEtiqueta} htmlFor={esGrupo ? undefined : field.key}>
        {label(field)} {field.required && <span className="obligatorio">*</span>}
      </label>
      {/* Un grupo de botones necesita rol y etiqueta propios: si no, un lector
          de pantalla anuncia "Sí"/"No" sueltos, sin decir de qué campo son. */}
      {esGrupo ? (
        <div role="group" aria-labelledby={idEtiqueta}>
          {interno}
        </div>
      ) : (
        interno
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function control({ field, value, readOnly, subirArchivo, onChange }: Props) {
  const ro = readOnly ?? false;

  switch (field.type) {
    case 'file':
      return (
        <CampoArchivo
          id={field.key}
          value={value ? String(value) : undefined}
          readOnly={ro}
          subir={subirArchivo}
          onChange={(v) => onChange(v ?? '')}
        />
      );

    case 'textarea':
      return (
        <textarea
          id={field.key}
          value={String(value ?? '')}
          readOnly={ro}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        />
      );

    case 'number':
      return (
        <input
          id={field.key}
          type="number"
          inputMode="decimal"
          value={value === '' || value == null ? '' : String(value)}
          readOnly={ro}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );

    case 'date':
    case 'time':
      return (
        <input
          id={field.key}
          type={field.type}
          value={String(value ?? '')}
          readOnly={ro}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'datetime':
      return (
        <input
          id={field.key}
          type="datetime-local"
          value={String(value ?? '')}
          readOnly={ro}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'select':
      return (
        <select
          id={field.key}
          value={String(value ?? '')}
          disabled={ro}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— Elegir —</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );

    case 'multiselect':
      return (
        <MultiSeleccion
          options={field.options ?? []}
          value={(value as string[]) ?? []}
          readOnly={ro}
          onChange={onChange}
        />
      );

    case 'boolean':
      return (
        <div className="si-no">
          <button type="button" aria-pressed={value === true} disabled={ro} onClick={() => onChange(true)}>
            Sí
          </button>
          <button type="button" aria-pressed={value === false} disabled={ro} onClick={() => onChange(false)}>
            No
          </button>
        </div>
      );

    case 'checklist':
      return (
        <Checklist
          options={field.options ?? []}
          value={(value as ChecklistItem[]) ?? []}
          readOnly={ro}
          onChange={onChange}
        />
      );

    case 'table':
      return (
        <TablaFilas
          columns={field.columns ?? []}
          value={(value as TableRow[]) ?? []}
          readOnly={ro}
          onChange={onChange}
        />
      );

    default:
      return (
        <input
          id={field.key}
          type="text"
          value={String(value ?? '')}
          readOnly={ro}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function MultiSeleccion({
  options,
  value,
  readOnly,
  onChange,
}: {
  options: string[];
  value: string[];
  readOnly: boolean;
  onChange(v: string[]): void;
}) {
  return (
    <div className="si-no" style={{ flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value.includes(o)}
          disabled={readOnly}
          onClick={() => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o])}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * Lista de comprobación: cada ítem se marca OK / No OK / N/A. Un "No OK" pide
 * observación, que es lo que después aparece como desvío en el tablero.
 */
function Checklist({
  options,
  value,
  readOnly,
  onChange,
}: {
  options: string[];
  value: ChecklistItem[];
  readOnly: boolean;
  onChange(v: ChecklistItem[]): void;
}) {
  const byItem = new Map(value.map((i) => [i.item, i]));

  function set(item: string, patch: Partial<ChecklistItem>) {
    const current = byItem.get(item) ?? { item, status: 'ok' as ChecklistStatus };
    const next = options
      .map((o) => (o === item ? { ...current, ...patch } : byItem.get(o)))
      .filter((i): i is ChecklistItem => i !== undefined);
    onChange(next);
  }

  return (
    <div>
      {options.map((item) => {
        const current = byItem.get(item);
        return (
          <div className="checklist-item" key={item}>
            <div className="texto">{item}</div>
            <div className="estados">
              {(Object.keys(CHECKLIST_LABELS) as ChecklistStatus[]).map((estado) => (
                <button
                  key={estado}
                  type="button"
                  data-estado={estado}
                  aria-pressed={current?.status === estado}
                  aria-label={`${item}: ${CHECKLIST_LABELS[estado]}`}
                  disabled={readOnly}
                  onClick={() => set(item, { status: estado })}
                >
                  {CHECKLIST_LABELS[estado]}
                </button>
              ))}
            </div>
            {current?.status === 'no_ok' && (
              <input
                type="text"
                style={{ marginTop: 8, width: '100%', padding: 10 }}
                placeholder="¿Qué se encontró? (queda registrado como desvío)"
                value={current.observacion ?? ''}
                readOnly={readOnly}
                onChange={(e) => set(item, { observacion: e.target.value })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Tabla de filas repetibles (pedido de materiales, asistentes, etc.). */
function TablaFilas({
  columns,
  value,
  readOnly,
  onChange,
}: {
  columns: TableColumn[];
  value: TableRow[];
  readOnly: boolean;
  onChange(v: TableRow[]): void;
}) {
  function update(index: number, key: string, cell: unknown) {
    onChange(value.map((row, i) => (i === index ? { ...row, [key]: cell } : row)));
  }

  return (
    <div>
      <div className="tabla-scroll">
        <table className="filas">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{label(c)}</th>
              ))}
              {!readOnly && <th aria-label="Quitar" />}
            </tr>
          </thead>
          <tbody>
            {value.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="vacio">
                  Sin filas
                </td>
              </tr>
            )}
            {value.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}>
                    {c.type === 'select' ? (
                      <select
                        value={String(row[c.key] ?? '')}
                        disabled={readOnly}
                        onChange={(e) => update(i, c.key, e.target.value)}
                      >
                        <option value="">—</option>
                        {(c.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                        value={row[c.key] == null ? '' : String(row[c.key])}
                        readOnly={readOnly}
                        onChange={(e) =>
                          update(
                            i,
                            c.key,
                            c.type === 'number'
                              ? e.target.value === ''
                                ? ''
                                : Number(e.target.value)
                              : e.target.value,
                          )
                        }
                      />
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td>
                    <button
                      type="button"
                      className="boton secundario"
                      style={{ minHeight: 40, padding: '6px 10px' }}
                      onClick={() => onChange(value.filter((_, j) => j !== i))}
                    >
                      Quitar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button
          type="button"
          className="boton secundario"
          style={{ marginTop: 8 }}
          onClick={() => onChange([...value, {}])}
        >
          Agregar fila
        </button>
      )}
    </div>
  );
}
