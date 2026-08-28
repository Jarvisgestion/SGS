import type { Session } from './api.ts';

const ROLES_DE_TIERRA = new Set([
  'persona_designada',
  'asesor_externo',
  'armador',
  'area_tecnica',
  'auditor',
  'responsable_sh',
  'admin_plataforma',
]);

export function codigosDeRol(session: Session): string[] {
  return session.user.roles.map((r) => r.code);
}

export function trabajaEnTierra(session: Session): boolean {
  return codigosDeRol(session).some((c) => ROLES_DE_TIERRA.has(c));
}

export function navegaABordo(session: Session): boolean {
  return codigosDeRol(session).some((c) => !ROLES_DE_TIERRA.has(c));
}

/** Buque en el que la persona tiene un rol embarcado vigente. */
export function buquePorDefecto(session: Session): string | null {
  return session.user.roles.find((r) => r.vesselId)?.vesselId ?? null;
}
