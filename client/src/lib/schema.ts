/**
 * Tipos del `field_schema` que define cada tipo de registro, y las funciones
 * puras que el formulario usa para armar y validar los valores.
 *
 * La validación de acá es para que el usuario vea el error mientras carga, en
 * el buque y sin señal. La autoridad sigue siendo la base: al enviar, el
 * servidor vuelve a validar todo (docs/03-esquema-sql.md §3).
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'time'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'checklist'
  | 'table'
  | 'signature_block'
  | 'file'
  | 'risk_reference'
  | 'user_reference';

export interface TableColumn {
  key: string;
  type: Exclude<FieldType, 'table' | 'signature_block'>;
  label?: string;
  options?: string[];
}

export interface Field {
  key: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  options?: string[];
  columns?: TableColumn[];
  signer_role?: string;
  /** Marca que este campo, en verdadero, ofrece crear otro registro. */
  triggers_record_type?: string;
}

export type ChecklistStatus = 'ok' | 'no_ok' | 'na';
export interface ChecklistItem {
  item: string;
  status: ChecklistStatus;
  observacion?: string;
}
export type TableRow = Record<string, unknown>;
export type FieldValue = unknown;
export type FormData = Record<string, FieldValue>;

export const CHECKLIST_LABELS: Record<ChecklistStatus, string> = {
  ok: 'OK',
  no_ok: 'No OK',
  na: 'N/A',
};

/** Valor inicial de cada campo al abrir un formulario en blanco. */
export function emptyValue(field: Field): FieldValue {
  switch (field.type) {
    case 'boolean':
      // Sin responder, no "No": dejar "No" pre-marcado haría que un registro
      // diga "no se informó a PNA" sin que nadie lo haya contestado.
      return undefined;
    case 'multiselect':
      return [];
    case 'checklist':
      return (field.options ?? []).map((item): ChecklistItem => ({ item, status: 'ok' }));
    case 'table':
      return [];
    default:
      return '';
  }
}

export function emptyForm(schema: Field[]): FormData {
  const data: FormData = {};
  for (const field of schema) {
    if (field.type === 'signature_block') continue;
    data[field.key] = emptyValue(field);
  }
  return data;
}

export function signatureBlocks(schema: Field[]): Field[] {
  return schema.filter((f) => f.type === 'signature_block');
}

export function label(field: Field | TableColumn): string {
  if (field.label) return field.label;
  const texto = field.key.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** ¿El valor cuenta como vacío a los efectos de "campo obligatorio"? */
export function isEmpty(value: FieldValue): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export interface FieldError {
  key: string;
  message: string;
}

export function validateForm(schema: Field[], data: FormData): FieldError[] {
  const errors: FieldError[] = [];

  for (const field of schema) {
    if (field.type === 'signature_block') continue;
    const value = data[field.key];

    // Un booleano en falso es una respuesta; uno sin contestar, no.
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean' && field.required) {
        errors.push({ key: field.key, message: 'Falta contestar' });
      }
      continue;
    }

    if (isEmpty(value)) {
      if (field.required) {
        errors.push({ key: field.key, message: 'Este campo es obligatorio' });
      }
      continue;
    }

    switch (field.type) {
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          errors.push({ key: field.key, message: 'Tiene que ser un número' });
        }
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
          errors.push({ key: field.key, message: 'Fecha incompleta' });
        }
        break;
      case 'time':
        if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(value))) {
          errors.push({ key: field.key, message: 'Hora incompleta' });
        }
        break;
      case 'select':
        if (!field.options?.includes(String(value))) {
          errors.push({ key: field.key, message: 'Opción inválida' });
        }
        break;
      case 'multiselect':
        if ((value as string[]).some((v) => !field.options?.includes(v))) {
          errors.push({ key: field.key, message: 'Opción inválida' });
        }
        break;
      case 'checklist': {
        const items = value as ChecklistItem[];
        if (items.some((i) => !field.options?.includes(i.item))) {
          errors.push({ key: field.key, message: 'Ítem que no está en la lista' });
        }
        if (field.required && items.length === 0) {
          errors.push({ key: field.key, message: 'Completá la lista de comprobación' });
        }
        break;
      }
      case 'table': {
        const rows = value as TableRow[];
        const cols = new Set((field.columns ?? []).map((c) => c.key));
        if (rows.some((r) => Object.keys(r).some((k) => !cols.has(k)))) {
          errors.push({ key: field.key, message: 'Columna que no pertenece a la tabla' });
        }
        break;
      }
      default:
        break;
    }
  }

  return errors;
}

/**
 * Deja el objeto listo para mandar: saca los campos vacíos (el servidor los
 * trata como ausentes) y las filas de tabla que quedaron en blanco.
 */
export function toPayload(schema: Field[], data: FormData): FormData {
  const payload: FormData = {};

  for (const field of schema) {
    if (field.type === 'signature_block') continue;
    let value = data[field.key];

    if (field.type === 'table') {
      value = (value as TableRow[] | undefined)?.filter((row) =>
        Object.values(row).some((v) => !isEmpty(v)),
      );
    }
    if (field.type === 'number' && typeof value === 'string' && value.trim() !== '') {
      value = Number(value);
    }
    // El booleano sin contestar no viaja: que el registro no afirme nada que
    // la tripulación no haya respondido.
    if (field.type === 'boolean') {
      if (typeof value === 'boolean') payload[field.key] = value;
      continue;
    }
    if (isEmpty(value)) continue;

    payload[field.key] = value;
  }

  return payload;
}

/** Campos booleanos en verdadero que habilitan crear un registro hijo. */
export function triggeredRecordTypes(schema: Field[], data: FormData): string[] {
  return schema
    .filter((f) => f.triggers_record_type && data[f.key] === true)
    .map((f) => f.triggers_record_type!);
}
