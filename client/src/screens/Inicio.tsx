import { useEffect, useState } from 'react';
import type { Contexto } from '../app.tsx';
import { api, OfflineError, type RecordSummary } from '../lib/api.ts';

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  pendiente_revision: 'En revisión',
  aprobado: 'Aprobado',
  observado: 'Observado',
};

export function Inicio({ ctx }: { ctx: Contexto }) {
  const [solapa, setSolapa] = useState<'nuevo' | 'mios'>('nuevo');

  return (
    <>
      <div className="si-no" style={{ marginBottom: 12 }}>
        <button type="button" aria-pressed={solapa === 'nuevo'} onClick={() => setSolapa('nuevo')}>
          Cargar registro
        </button>
        <button type="button" aria-pressed={solapa === 'mios'} onClick={() => setSolapa('mios')}>
          Mis registros
        </button>
      </div>
      {solapa === 'nuevo' ? <Catalogo ctx={ctx} /> : <MisRegistros ctx={ctx} />}
    </>
  );
}

/** Catálogo de la empresa, agrupado por procedimiento del manual. */
function Catalogo({ ctx }: { ctx: Contexto }) {
  const porProcedimiento = new Map<string, typeof ctx.recordTypes>();
  for (const rt of ctx.recordTypes) {
    const clave = `${rt.procedure_code} — ${rt.procedure_name}`;
    porProcedimiento.set(clave, [...(porProcedimiento.get(clave) ?? []), rt]);
  }

  if (ctx.recordTypes.length === 0) {
    return <p className="vacio">Todavía no se descargó el catálogo. Conectate una vez para tenerlo a bordo.</p>;
  }

  return (
    <>
      {[...porProcedimiento].map(([procedimiento, tipos]) => (
        <section className="panel" key={procedimiento}>
          <h2>{procedimiento}</h2>
          <ul className="lista">
            {tipos.map((rt) => (
              <li key={rt.id}>
                <a href={`#/nuevo/${rt.id}`}>
                  <span className="titulo">
                    <span className="codigo">{rt.code}</span>
                    <br />
                    {rt.name}
                  </span>
                  <span aria-hidden>›</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** Borradores del equipo + lo ya enviado a tierra. */
function MisRegistros({ ctx }: { ctx: Contexto }) {
  const [enviados, setEnviados] = useState<RecordSummary[] | null>(null);
  const [sinSenal, setSinSenal] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { records } = await api.records({ limit: 30 });
        setEnviados(records);
        setSinSenal(false);
      } catch (err) {
        if (err instanceof OfflineError) setSinSenal(true);
      }
    })();
  }, [ctx.enLinea]);

  return (
    <>
      <section className="panel">
        <h2>En el equipo</h2>
        {ctx.borradores.length === 0 ? (
          <p className="vacio">No hay borradores guardados.</p>
        ) : (
          <ul className="lista">
            {ctx.borradores.map((b) => (
              <li key={b.localId}>
                <a href={`#/borrador/${b.localId}`}>
                  <span className="titulo">
                    <span className="codigo">{b.recordTypeCode}</span>
                    <br />
                    {b.recordTypeName}
                  </span>
                  <span className={`chip ${b.dirty ? 'borrador' : 'pendiente_revision'}`}>
                    {b.dirty ? 'Sin subir' : 'Sincronizado'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Enviados a tierra</h2>
        {sinSenal && <div className="aviso info">Sin señal: se muestra lo último que se descargó.</div>}
        {enviados === null ? (
          <p className="vacio">Cargando…</p>
        ) : enviados.length === 0 ? (
          <p className="vacio">Todavía no enviaste ningún registro.</p>
        ) : (
          <ul className="lista">
            {enviados.map((r) => (
              <li key={r.id}>
                <a href={`#/registro/${r.id}`}>
                  <span className="titulo">
                    <span className="codigo">{r.record_type_code}</span>
                    <br />
                    {r.record_type_name}
                    <br />
                    <small style={{ color: 'var(--tenue)' }}>
                      {new Date(r.occurred_at).toLocaleDateString('es-AR')}
                      {r.vessel_name ? ` · ${r.vessel_name}` : ''}
                    </small>
                  </span>
                  <span className={`chip ${r.status}`}>{ETIQUETA_ESTADO[r.status]}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
