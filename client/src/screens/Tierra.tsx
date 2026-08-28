import { useEffect, useState } from 'react';
import { mensajeDeError, type Contexto } from '../app.tsx';
import { api, type CertificateRow, type ComplianceRow, type RecordSummary } from '../lib/api.ts';

const ETIQUETA_CUMPLIMIENTO: Record<string, string> = {
  al_dia: 'Al día',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  sin_registro: 'Sin registro',
  no_aplica: 'Por evento',
};

/** Bandeja de la Persona Designada: lo que el buque mandó y espera respuesta. */
export function Bandeja({ ctx }: { ctx: Contexto }) {
  const [pendientes, setPendientes] = useState<RecordSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { pending } = await api.pendingReviews();
        setPendientes(pending);
      } catch (err) {
        setError(mensajeDeError(err));
      }
    })();
  }, [ctx.enLinea]);

  if (error) return <div className="aviso error">{error}</div>;

  return (
    <section className="panel">
      <h2>Registros esperando revisión</h2>
      {pendientes === null ? (
        <p className="vacio">Cargando…</p>
      ) : pendientes.length === 0 ? (
        <p className="vacio">No hay nada pendiente.</p>
      ) : (
        <ul className="lista">
          {pendientes.map((r) => (
            <li key={r.id}>
              <a href={`#/registro/${r.id}`}>
                <span className="titulo">
                  <span className="codigo">{r.record_type_code}</span>
                  <br />
                  {r.record_type_name}
                  <br />
                  <small style={{ color: 'var(--tenue)' }}>
                    {r.vessel_name ?? 'Compañía'} ·{' '}
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleString('es-AR') : ''}
                  </small>
                </span>
                <span className="chip pendiente_revision">Revisar</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Tablero de cumplimiento: es el RA-06C del manual, calculado sobre los
 * registros cargados en vez de completarse a mano.
 */
export function Tablero() {
  const [filas, setFilas] = useState<ComplianceRow[] | null>(null);
  const [certificados, setCertificados] = useState<CertificateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [cumplimiento, certs] = await Promise.all([api.compliance(), api.certificates()]);
        setFilas(cumplimiento.compliance);
        setCertificados(certs.certificates);
      } catch (err) {
        setError(mensajeDeError(err));
      }
    })();
  }, []);

  if (error) return <div className="aviso error">{error}</div>;

  const atencion = (filas ?? []).filter((f) =>
    ['vencido', 'por_vencer', 'sin_registro'].includes(f.compliance_status),
  );

  return (
    <>
      <section className="panel">
        <h2>Requiere atención</h2>
        {filas === null ? (
          <p className="vacio">Cargando…</p>
        ) : atencion.length === 0 ? (
          <p className="vacio">Todo al día.</p>
        ) : (
          <ul className="lista">
            {atencion.map((f) => (
              <li key={`${f.record_type_code}-${f.vessel_id ?? 'cia'}`}>
                <span className="fila" style={{ display: 'flex', padding: '14px 4px', gap: 10 }}>
                  <span className="titulo">
                    <span className="codigo">{f.record_type_code}</span>
                    <br />
                    {f.record_type_name}
                    <br />
                    <small style={{ color: 'var(--tenue)' }}>
                      {f.vessel_name ?? 'Compañía'}
                      {f.next_due_at ? ` · vence ${new Date(f.next_due_at).toLocaleDateString('es-AR')}` : ''}
                      {f.pending_count > 0 ? ` · ${f.pending_count} sin revisar` : ''}
                    </small>
                  </span>
                  <span className={`chip ${f.compliance_status}`}>
                    {ETIQUETA_CUMPLIMIENTO[f.compliance_status]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Certificados</h2>
        {certificados === null ? (
          <p className="vacio">Cargando…</p>
        ) : certificados.length === 0 ? (
          <p className="vacio">No hay certificados cargados.</p>
        ) : (
          <ul className="lista">
            {certificados.map((c) => (
              <li key={c.id}>
                <span className="fila" style={{ display: 'flex', padding: '14px 4px', gap: 10 }}>
                  <span className="titulo">
                    {c.certificate_label}
                    <br />
                    <small style={{ color: 'var(--tenue)' }}>
                      {c.vessel_name}
                      {c.expires_at ? ` · vence ${new Date(c.expires_at).toLocaleDateString('es-AR')}` : ''}
                    </small>
                  </span>
                  <span className={`chip ${c.status}`}>{c.status.replace('_', ' ')}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
