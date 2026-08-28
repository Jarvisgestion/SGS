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
    can_manage_catalog: boolean;
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
  recurrence_days: number | null;
  allowed_creator_roles: string[];
  allowed_reviewer_roles: string[];
  signature_requirement: SignatureRequirement;
  status: 'vigente' | 'derogado';
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
  is_shipboard: boolean;
}

// --- administración del catálogo -----------------------------------------

export interface ManualVersion {
  id: string;
  revision_number: string;
  regulation: string | null;
  effective_date: string | null;
  status: 'borrador' | 'vigente' | 'superada';
  procedimientos: string;
}

export interface Procedure {
  id: string;
  manual_version_id: string;
  code: string;
  name: string;
  sort_order: number;
  status: string;
  registros: string;
}

export interface UsuarioAdmin {
  id: string;
  full_name: string;
  email: string | null;
  dni: string | null;
  status: string;
  tiene_clave: boolean;
  tiene_pin: boolean;
  roles: { id: string; role_code: string; vessel_id: string | null; valid_from: string }[] | null;
}

export interface RecordTypeInput {
  procedure_id?: string;
  code?: string;
  name?: string;
  category?: string;
  scope?: 'company' | 'vessel';
  recurrence_type?: string;
  recurrence_days?: number | null;
  allowed_creator_roles?: string[];
  allowed_reviewer_roles?: string[];
  signature_requirement?: SignatureRequirement;
  field_schema?: Field[];
  status?: 'vigente' | 'derogado';
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

  recordTypes: (todasLasRevisiones = false) =>
    request<{ record_types: RecordTypeSummary[] }>(
      'GET',
      `/catalog/record-types?todas_las_revisiones=${todasLasRevisiones}`,
    ),

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

export const admin = {
  /** Para administrar hacen falta también los de revisiones superadas. */
  tiposRegistro: () =>
    request<{ record_types: RecordTypeSummary[] }>(
      'GET',
      '/catalog/record-types?todas_las_revisiones=true&include_derogados=true',
    ),

  manualVersions: () =>
    request<{ manual_versions: ManualVersion[] }>('GET', '/admin/manual-versions'),

  crearManual: (body: { revision_number: string; regulation?: string; effective_date?: string }) =>
    request<ManualVersion>('POST', '/admin/manual-versions', body),

  publicarManual: (id: string) =>
    request<ManualVersion>('POST', `/admin/manual-versions/${id}/publicar`),

  procedures: (manualVersionId?: string) =>
    request<{ procedures: Procedure[] }>(
      'GET',
      `/admin/procedures${manualVersionId ? `?manual_version_id=${manualVersionId}` : ''}`,
    ),

  crearProcedimiento: (body: {
    manual_version_id: string;
    code: string;
    name: string;
    sort_order?: number;
  }) => request<Procedure>('POST', '/admin/procedures', body),

  crearTipoRegistro: (body: RecordTypeInput) =>
    request<{ id: string }>('POST', '/admin/record-types', body),

  editarTipoRegistro: (id: string, body: RecordTypeInput) =>
    request<{ id: string; version: number }>('PATCH', `/admin/record-types/${id}`, body),

  crearBuque: (body: Record<string, unknown>) => request<Vessel>('POST', '/admin/vessels', body),

  editarBuque: (id: string, body: Record<string, unknown>) =>
    request<Vessel>('PATCH', `/admin/vessels/${id}`, body),

  usuarios: () => request<{ users: UsuarioAdmin[] }>('GET', '/admin/users'),

  crearUsuario: (body: {
    full_name: string;
    email?: string;
    dni?: string;
    password?: string;
    pin?: string;
    role_code?: string;
    vessel_id?: string | null;
  }) => request<UsuarioAdmin>('POST', '/admin/users', body),

  asignarRol: (userId: string, body: { role_code: string; vessel_id?: string | null }) =>
    request<{ id: string }>('POST', `/admin/users/${userId}/roles`, body),

  cerrarRol: (userId: string, roleId: string) =>
    request<{ id: string }>('DELETE', `/admin/users/${userId}/roles/${roleId}`),
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
