/**
 * Cliente HTTP de la API. Guarda la sesión y distingue los errores de red
 * (estamos sin señal) de los de negocio (el servidor rechazó algo), porque el
 * formulario reacciona distinto a cada uno.
 */
import type { Field, FormData } from './schema.ts';

const BASE = import.meta.env.VITE_API_URL ?? '/api';
const TOKEN_KEY = 'sgs.session';

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/** El dispositivo no llegó al servidor: hay que reintentar cuando haya señal. */
export class OfflineError extends Error {
  constructor() {
    super('Sin conexión con tierra');
  }
}

export interface Session {
  token: string;
  expires_at: string;
  user: {
    id: string;
    full_name: string;
    companies: string[];
    roles: { code: string; companyId: string; vesselId: string | null }[];
  };
}

let session: Session | null = readSession();

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return new Date(parsed.expires_at) > new Date() ? parsed : null;
  } catch {
    return null;
  }
}

export function currentSession(): Session | null {
  return session;
}

export function setSession(next: Session | null) {
  session = next;
  if (next) localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new OfflineError();
  }

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    if (res.status === 401 && session) setSession(null);
    const err = payload as { error?: string; detail?: unknown };
    throw new ApiError(res.status, err.error ?? 'Error inesperado', err.detail);
  }
  return payload as T;
}

// --- catálogo -------------------------------------------------------------

export interface RecordTypeSummary {
  id: string;
  code: string;
  name: string;
  category: string;
  scope: 'company' | 'vessel';
  version: number;
  recurrence_type: string;
  signature_requirement: SignatureRequirement;
  procedure_code: string;
  procedure_name: string;
}

export type SignatureRequirement =
  | 'none'
  | 'manuscrita'
  | 'pin'
  | 'ambas'
  | 'configurable_por_firmante';

export interface RecordTypeDetail extends RecordTypeSummary {
  field_schema: Field[];
}

export interface Rol {
  code: string;
  name: string;
}

export interface Vessel {
  id: string;
  name: string;
  matricula: string;
  status: string;
}

export interface RecordSummary {
  id: string;
  record_type_code: string;
  record_type_name: string;
  vessel_name: string | null;
  status: RecordStatus;
  occurred_at: string;
  submitted_at: string | null;
}

export type RecordStatus = 'borrador' | 'pendiente_revision' | 'aprobado' | 'observado';

export interface RecordDetail {
  id: string;
  record_type_id: string;
  record_type_code: string;
  record_type_name: string;
  signature_requirement: SignatureRequirement;
  field_schema: Field[];
  vessel_id: string | null;
  marea: string | null;
  status: RecordStatus;
  occurred_at: string;
  data: FormData;
  signatures:
    | { id: string; signer_name: string; signer_role: string; field_key: string; method: string; signed_at: string }[]
    | null;
  reviews:
    | { id: string; decision: string; comment: string | null; reviewed_at: string; reviewer: string | null }[]
    | null;
}

export const api = {
  login: (email: string, password: string) =>
    request<Session>('POST', '/auth/login', { email, password }),

  recordTypes: () =>
    request<{ record_types: RecordTypeSummary[] }>('GET', '/catalog/record-types'),

  recordType: (id: string) => request<RecordTypeDetail>('GET', `/catalog/record-types/${id}`),

  vessels: () => request<{ vessels: Vessel[] }>('GET', '/catalog/vessels'),

  roles: () => request<{ roles: Rol[] }>('GET', '/catalog/roles'),

  records: (query: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(query)
        .filter((e): e is [string, string | number] => e[1] !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );
    return request<{ records: RecordSummary[] }>('GET', `/records?${qs}`);
  },

  record: (id: string) => request<RecordDetail>('GET', `/records/${id}`),

  createRecord: (body: {
    record_type_id: string;
    vessel_id?: string | null;
    occurred_at?: string;
    marea?: string | null;
    data: FormData;
    parent_record_instance_id?: string | null;
  }) => request<{ id: string }>('POST', '/records', body),

  updateRecord: (
    id: string,
    body: { data?: FormData; marea?: string | null; occurred_at?: string },
  ) => request<{ id: string; status: RecordStatus }>('PATCH', `/records/${id}`, body),

  submitRecord: (id: string) =>
    request<{ id: string; status: RecordStatus }>('POST', `/records/${id}/submit`),

  addAttachment: (id: string, body: { file_url: string; file_type: string; file_name?: string }) =>
    request<{ id: string }>('POST', `/records/${id}/attachments`, body),

  sign: (
    id: string,
    body: { field_key: string; method?: 'canvas' | 'pin'; pin?: string; signature_image_id?: string },
  ) => request<{ id: string; method: string }>('POST', `/records/${id}/signatures`, body),

  review: (id: string, body: { decision: 'aprobado' | 'observado'; comment?: string }) =>
    request<{ id: string }>('POST', `/records/${id}/reviews`, body),

  pendingReviews: () =>
    request<{ pending: (RecordSummary & { created_by_name: string | null })[] }>(
      'GET',
      '/dashboard/pending-reviews',
    ),

  compliance: (onlyPending = false) =>
    request<{ compliance: ComplianceRow[] }>(
      'GET',
      `/dashboard/compliance?only_pending=${onlyPending}`,
    ),

  certificates: () => request<{ certificates: CertificateRow[] }>('GET', '/dashboard/certificates'),
};

export interface ComplianceRow {
  vessel_id: string | null;
  vessel_name: string | null;
  record_type_code: string;
  record_type_name: string;
  next_due_at: string | null;
  last_approved_at: string | null;
  pending_count: number;
  compliance_status: 'al_dia' | 'por_vencer' | 'vencido' | 'sin_registro' | 'no_aplica';
}

export interface CertificateRow {
  id: string;
  vessel_name: string;
  certificate_label: string;
  certificate_number: string | null;
  expires_at: string | null;
  days_to_expiry: number | null;
  status: 'vigente' | 'por_vencer' | 'vencido';
}
