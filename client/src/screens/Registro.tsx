import { useEffect, useState } from 'react';
import { mensajeDeError, type Contexto } from '../app.tsx';
import { api, type RecordDetail } from '../lib/api.ts';
import { ir } from '../lib/router.ts';
import { trabajaEnTierra } from '../lib/roles.ts';
import { emptyForm, label, type Field } from '../lib/schema.ts';
import { drafts, newDraft } from '../store/drafts.ts';
import { CampoDinamico } from '../components/Fields.tsx';

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  pendiente_revision: 'En revisión',
  aprobado: 'Aprobado',
  observado: 'Observado',
};

/** Un registro ya enviado: se ve como quedó, quién firmó y qué dijo tierra. */
export function Registro({ ctx, id }: { ctx: Contexto; id: string }) {
  const [registro, setRegistro] = useState<RecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');
  const [revisando, setRevisando] = useState(false);

  useEffect(() => {
    void recargar();
  }, [id]);

  async function recargar() {
    try {
      setRegistro(await api.record(id));
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  async function revisar(decision: 'aprobado' | 'observado') {
    setError(null);
    if (decision === 'observado' && comentario.trim() === '') {
      return setError('Para observar hay que decir qué corregir.');
    }
    setRevisando(true);
    try {
      await api.review(id, { decision, comment: comentario.trim() || undefined });
      setComentario('');
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setRevisando(false);
    }
  }

  /**
   * Un registro observado vuelve a bordo como borrador, con los datos cargados.
   *
   * Las firmas que ya tiene se dan por hechas: cada bloque admite una sola
   * firma y las firmas no se borran, así que la del capitán sigue valiendo
   * sobre el registro corregido. La corrección queda trazada por la
   * observación y por la bitácora.
   */
  async function corregirABordo() {
    if (!registro) return;
    const copia = newDraft({
      userId: ctx.session.user.id,
      companyId: ctx.session.user.companies[0]!,
      recordTypeId: registro.record_type_id,
      recordTypeCode: registro.record_type_code,
      recordTypeName: registro.record_type_name,
      vesselId: registro.vessel_id,
      data: { ...emptyForm(registro.field_schema), ...registro.data },
    });
    const conOrigen = {
      ...copia,
      serverId: registro.id,
      marea: registro.marea,
      signedKeys: (registro.signatures ?? []).map((f) => f.field_key).filter((k): k is string => !!k),
    };
    await drafts.save(conOrigen);
    await ctx.recargarBorradores();
    ir(`borrador/${conOrigen.localId}`);
  }

  if (error && !registro) return <div className="aviso error">{error}</div>;
  if (!registro) return <p className="vacio">Cargando…</p>;

  const ultimaObservacion = (registro.reviews ?? [])
    .filter((r) => r.decision === 'observado')
    .at(-1);
  const puedeRevisar = trabajaEnTierra(ctx.session) && registro.status === 'pendiente_revision';

  return (
    <>
      <section className="panel">
        <h2>
          <span className="codigo">{registro.record_type_code}</span> · {registro.record_type_name}
        </h2>
        <div className="dato">
          <span className="k">Estado</span>
          <span className="v">
            <span className={`chip ${registro.status}`}>{ETIQUETA_ESTADO[registro.status]}</span>
          </span>
        </div>
        <div className="dato">
          <span className="k">Fecha del hecho</span>
          <span className="v">{new Date(registro.occurred_at).toLocaleString('es-AR')}</span>
        </div>
        {registro.marea && (
          <div className="dato">
            <span className="k">Marea</span>
            <span className="v">{registro.marea}</span>
          </div>
        )}
      </section>

      {registro.status === 'observado' && ultimaObservacion && (
        <div className="aviso alerta">
          <strong>Tierra observó este registro:</strong> {ultimaObservacion.comment}
          <div style={{ marginTop: 10 }}>
            <button type="button" className="boton" onClick={() => void corregirABordo()}>
              Corregir a bordo
            </button>
          </div>
        </div>
      )}

      <section className="panel">
        <h2>Lo cargado</h2>
        {registro.field_schema
          .filter((f: Field) => f.type !== 'signature_block')
          .map((f: Field) => (
            <CampoDinamico key={f.key} field={f} value={registro.data[f.key]} readOnly onChange={() => {}} />
          ))}
      </section>

      <section className="panel">
        <h2>Firmas</h2>
        {(registro.signatures ?? []).length === 0 ? (
          <p className="vacio">Sin firmas.</p>
        ) : (
          (registro.signatures ?? []).map((f) => (
            <div className="dato" key={f.id}>
              <span className="k">{f.signer_role.replace(/_/g, ' ')}</span>
              <span className="v">
                {f.signer_name}
                <br />
                <small style={{ color: 'var(--tenue)' }}>
                  {f.method === 'pin' ? 'Confirmado con PIN' : 'Firma manuscrita'} ·{' '}
                  {new Date(f.signed_at).toLocaleString('es-AR')}
                </small>
              </span>
            </div>
          ))
        )}
      </section>

      <section className="panel">
        <h2>Historial de revisión</h2>
        {(registro.reviews ?? []).length === 0 ? (
          <p className="vacio">Todavía no lo revisó nadie.</p>
        ) : (
          (registro.reviews ?? []).map((r) => (
            <div className="dato" key={r.id}>
              <span className="k">
                <span className={`chip ${r.decision}`}>{ETIQUETA_ESTADO[r.decision]}</span>
              </span>
              <span className="v">
                {r.reviewer ?? '—'}
                {r.comment && (
                  <>
                    <br />
                    <small style={{ color: 'var(--tenue)' }}>{r.comment}</small>
                  </>
                )}
                <br />
                <small style={{ color: 'var(--tenue)' }}>{new Date(r.reviewed_at).toLocaleString('es-AR')}</small>
              </span>
            </div>
          ))
        )}
      </section>

      {puedeRevisar && (
        <section className="panel">
          <h2>Revisar</h2>
          <div className="campo">
            <label htmlFor="comentario">Comentario (obligatorio para observar)</label>
            <textarea id="comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </div>
          {error && <div className="aviso error">{error}</div>}
          <div className="acciones">
            <button type="button" className="boton" disabled={revisando} onClick={() => void revisar('aprobado')}>
              Aprobar
            </button>
            <button type="button" className="boton peligro" disabled={revisando} onClick={() => void revisar('observado')}>
              Observar
            </button>
          </div>
        </section>
      )}

      {error && registro && !puedeRevisar && <div className="aviso error">{error}</div>}
    </>
  );
}

export { label };
