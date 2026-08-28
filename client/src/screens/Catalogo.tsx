import { useEffect, useState } from 'react';
import { mensajeDeError, type Contexto } from '../app.tsx';
import {
  admin,
  type ManualVersion,
  type Procedure,
  type RecordTypeSummary,
  type UsuarioAdmin,
} from '../lib/api.ts';
import { ir } from '../lib/router.ts';

type Solapa = 'manual' | 'formularios' | 'flota' | 'personas';

/** ABM del catálogo: es lo que permite que la empresa maneje su propio manual. */
export function Catalogo({ ctx }: { ctx: Contexto }) {
  const [solapa, setSolapa] = useState<Solapa>('formularios');

  return (
    <>
      <div className="si-no" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        {(
          [
            ['formularios', 'Formularios'],
            ['manual', 'Manual'],
            ['flota', 'Flota'],
            ['personas', 'Personas'],
          ] as const
        ).map(([clave, texto]) => (
          <button key={clave} type="button" aria-pressed={solapa === clave} onClick={() => setSolapa(clave)}>
            {texto}
          </button>
        ))}
      </div>

      {solapa === 'formularios' && <Formularios ctx={ctx} />}
      {solapa === 'manual' && <Manual />}
      {solapa === 'flota' && <Flota ctx={ctx} />}
      {solapa === 'personas' && <Personas ctx={ctx} />}
    </>
  );
}

function Formularios({ ctx }: { ctx: Contexto }) {
  const [procedimientos, setProcedimientos] = useState<Procedure[] | null>(null);
  // Para administrar se listan todos, incluidos los de revisiones superadas y
  // los derogados: el catálogo de a bordo sólo muestra los vigentes.
  const [tiposRegistro, setTiposRegistro] = useState<RecordTypeSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([admin.procedures(), admin.tiposRegistro()])
      .then(([p, rt]) => {
        setProcedimientos(p.procedures);
        setTiposRegistro(rt.record_types);
      })
      .catch((err) => setError(mensajeDeError(err)));
  }, [ctx.recordTypes]);

  if (error) return <div className="aviso error">{error}</div>;
  if (!procedimientos) return <p className="vacio">Cargando…</p>;

  return (
    <>
      {procedimientos.length === 0 && (
        <div className="aviso info">
          Todavía no hay procedimientos. Creá primero una revisión del manual y sus procedimientos
          en la solapa <strong>Manual</strong>.
        </div>
      )}

      {procedimientos.map((p) => {
        const tipos = tiposRegistro.filter((rt) => rt.procedure_code === p.code);
        return (
          <section className="panel" key={p.id}>
            <h2>
              <span className="codigo">{p.code}</span> · {p.name}
            </h2>
            {tipos.length === 0 ? (
              <p className="vacio">Sin formularios.</p>
            ) : (
              <ul className="lista">
                {tipos.map((rt) => (
                  <li key={rt.id}>
                    <a href={`#/admin/formulario/${rt.id}`}>
                      <span className="titulo">
                        <span className="codigo">{rt.code}</span>
                        <br />
                        {rt.name}
                      </span>
                      <span className={`chip ${rt.status === 'vigente' ? 'aprobado' : 'borrador'}`}>
                        {rt.status === 'vigente' ? `v${rt.version}` : 'derogado'}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="boton secundario"
              style={{ marginTop: 10 }}
              onClick={() => ir(`admin/nuevo-formulario/${p.id}`)}
            >
              Agregar formulario a {p.code}
            </button>
          </section>
        );
      })}
    </>
  );
}

function Manual() {
  const [revisiones, setRevisiones] = useState<ManualVersion[] | null>(null);
  const [procedimientos, setProcedimientos] = useState<Procedure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nuevaRevision, setNuevaRevision] = useState('');
  const [nuevoProc, setNuevoProc] = useState({ code: '', name: '' });

  async function recargar() {
    try {
      const [r, p] = await Promise.all([admin.manualVersions(), admin.procedures()]);
      setRevisiones(r.manual_versions);
      setProcedimientos(p.procedures);
      setError(null);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  useEffect(() => {
    void recargar();
  }, []);

  const vigente = revisiones?.find((r) => r.status === 'vigente');

  async function crearRevision() {
    if (!nuevaRevision.trim()) return;
    try {
      await admin.crearManual({ revision_number: nuevaRevision.trim() });
      setNuevaRevision('');
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  async function crearProcedimiento() {
    if (!vigente || !nuevoProc.code.trim()) return;
    try {
      await admin.crearProcedimiento({
        manual_version_id: vigente.id,
        code: nuevoProc.code.trim(),
        name: nuevoProc.name.trim() || nuevoProc.code.trim(),
      });
      setNuevoProc({ code: '', name: '' });
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  return (
    <>
      {error && <div className="aviso error">{error}</div>}

      <section className="panel">
        <h2>Revisiones del manual</h2>
        {!revisiones ? (
          <p className="vacio">Cargando…</p>
        ) : (
          <ul className="lista">
            {revisiones.map((r) => (
              <li key={r.id}>
                <span className="fila" style={{ display: 'flex', padding: '14px 4px', gap: 10 }}>
                  <span className="titulo">
                    {r.revision_number}
                    <br />
                    <small style={{ color: 'var(--tenue)' }}>
                      {r.regulation ?? '—'} · {r.procedimientos} procedimientos
                      {r.effective_date ? ` · vigencia ${new Date(r.effective_date).toLocaleDateString('es-AR')}` : ''}
                    </small>
                  </span>
                  <span className={`chip ${r.status === 'vigente' ? 'aprobado' : r.status === 'borrador' ? 'borrador' : 'no_aplica'}`}>
                    {r.status}
                  </span>
                  {r.status !== 'vigente' && (
                    <button
                      type="button"
                      className="boton secundario"
                      style={{ minHeight: 38 }}
                      onClick={() => admin.publicarManual(r.id).then(recargar).catch((e) => setError(mensajeDeError(e)))}
                    >
                      Poner en vigencia
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3>Nueva revisión</h3>
        <div className="campo">
          <label htmlFor="rev">Número de revisión</label>
          <input id="rev" type="text" placeholder="Rev. 05" value={nuevaRevision} onChange={(e) => setNuevaRevision(e.target.value)} />
        </div>
        <button type="button" className="boton secundario" onClick={() => void crearRevision()}>
          Crear revisión
        </button>
        <p style={{ color: 'var(--tenue)', fontSize: 14 }}>
          Nace en borrador. Al ponerla en vigencia, la anterior queda superada; los registros ya
          cargados siguen leyéndose con el formulario que tenían.
        </p>
      </section>

      <section className="panel">
        <h2>Procedimientos {vigente ? `de ${vigente.revision_number}` : ''}</h2>
        {procedimientos.length === 0 ? (
          <p className="vacio">Sin procedimientos.</p>
        ) : (
          <ul className="lista">
            {procedimientos.map((p) => (
              <li key={p.id}>
                <span className="fila" style={{ display: 'flex', padding: '14px 4px', gap: 10 }}>
                  <span className="titulo">
                    <span className="codigo">{p.code}</span> · {p.name}
                    <br />
                    <small style={{ color: 'var(--tenue)' }}>{p.registros} formularios</small>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3>Nuevo procedimiento</h3>
        <div className="campo">
          <label htmlFor="pcode">Código</label>
          <input id="pcode" type="text" placeholder="PO-11" value={nuevoProc.code} onChange={(e) => setNuevoProc({ ...nuevoProc, code: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="pname">Nombre</label>
          <input id="pname" type="text" value={nuevoProc.name} onChange={(e) => setNuevoProc({ ...nuevoProc, name: e.target.value })} />
        </div>
        <button type="button" className="boton secundario" disabled={!vigente} onClick={() => void crearProcedimiento()}>
          Agregar procedimiento
        </button>
        {!vigente && <p className="aviso info">Poné una revisión en vigencia para poder agregarle procedimientos.</p>}
      </section>
    </>
  );
}

function Flota({ ctx }: { ctx: Contexto }) {
  const [nuevo, setNuevo] = useState({ name: '', matricula: '' });
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    try {
      await admin.crearBuque({ name: nuevo.name.trim(), matricula: nuevo.matricula.trim() });
      setNuevo({ name: '', matricula: '' });
      setError(null);
      await ctx.refrescarCatalogo();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  return (
    <section className="panel">
      <h2>Buques</h2>
      {ctx.vessels.length === 0 ? (
        <p className="vacio">Sin buques cargados.</p>
      ) : (
        <ul className="lista">
          {ctx.vessels.map((v) => (
            <li key={v.id}>
              <span className="fila" style={{ display: 'flex', padding: '14px 4px', gap: 10 }}>
                <span className="titulo">
                  {v.name}
                  <br />
                  <small style={{ color: 'var(--tenue)' }}>{v.matricula}</small>
                </span>
                <span className={`chip ${v.status === 'activo' ? 'aprobado' : 'borrador'}`}>{v.status.replace(/_/g, ' ')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3>Nuevo buque</h3>
      {error && <div className="aviso error">{error}</div>}
      <div className="campo">
        <label htmlFor="bname">Nombre</label>
        <input id="bname" type="text" value={nuevo.name} onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })} />
      </div>
      <div className="campo">
        <label htmlFor="bmat">Matrícula</label>
        <input id="bmat" type="text" value={nuevo.matricula} onChange={(e) => setNuevo({ ...nuevo, matricula: e.target.value })} />
      </div>
      <button type="button" className="boton secundario" onClick={() => void crear()}>
        Agregar buque
      </button>
    </section>
  );
}

function Personas({ ctx }: { ctx: Contexto }) {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({
    full_name: '',
    email: '',
    password: '',
    pin: '',
    role_code: '',
    vessel_id: '',
  });

  async function recargar() {
    try {
      setUsuarios((await admin.usuarios()).users);
      setError(null);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  useEffect(() => {
    void recargar();
  }, []);

  const rolElegido = ctx.roles.find((r) => r.code === nuevo.role_code);

  async function crear() {
    try {
      await admin.crearUsuario({
        full_name: nuevo.full_name.trim(),
        email: nuevo.email.trim() || undefined,
        password: nuevo.password || undefined,
        pin: nuevo.pin || undefined,
        role_code: nuevo.role_code || undefined,
        vessel_id: nuevo.vessel_id || null,
      });
      setNuevo({ full_name: '', email: '', password: '', pin: '', role_code: '', vessel_id: '' });
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  async function cerrarRol(userId: string, roleId: string) {
    try {
      await admin.cerrarRol(userId, roleId);
      await recargar();
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Personas</h2>
        {error && <div className="aviso error">{error}</div>}
        {!usuarios ? (
          <p className="vacio">Cargando…</p>
        ) : (
          <ul className="lista">
            {usuarios.map((u) => (
              <li key={u.id}>
                <span className="fila" style={{ display: 'flex', padding: '14px 4px', gap: 10, flexWrap: 'wrap' }}>
                  <span className="titulo">
                    {u.full_name}
                    <br />
                    <small style={{ color: 'var(--tenue)' }}>
                      {u.email ?? 'sin email'}
                      {!u.tiene_clave && ' · sin clave'}
                      {!u.tiene_pin && ' · sin PIN'}
                    </small>
                  </span>
                  {(u.roles ?? []).map((r) => (
                    <span key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="chip aprobado">
                        {ctx.roles.find((x) => x.code === r.role_code)?.name ?? r.role_code}
                      </span>
                      <button
                        type="button"
                        className="boton secundario"
                        style={{ minHeight: 34, padding: '2px 10px' }}
                        onClick={() => void cerrarRol(u.id, r.id)}
                      >
                        Cerrar
                      </button>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Alta de persona</h2>
        <div className="campo">
          <label htmlFor="unombre">Nombre y apellido</label>
          <input id="unombre" type="text" value={nuevo.full_name} onChange={(e) => setNuevo({ ...nuevo, full_name: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="uemail">Email</label>
          <input id="uemail" type="email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="uclave">Contraseña inicial</label>
          <input id="uclave" type="text" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="upin">PIN (4 a 8 dígitos)</label>
          <input id="upin" type="text" inputMode="numeric" value={nuevo.pin} onChange={(e) => setNuevo({ ...nuevo, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
        </div>
        <div className="campo">
          <label htmlFor="urol">Rol</label>
          <select id="urol" value={nuevo.role_code} onChange={(e) => setNuevo({ ...nuevo, role_code: e.target.value })}>
            <option value="">— Sin rol —</option>
            {ctx.roles.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        </div>
        {rolElegido?.is_shipboard && (
          <div className="campo">
            <label htmlFor="ubuque">Buque</label>
            <select id="ubuque" value={nuevo.vessel_id} onChange={(e) => setNuevo({ ...nuevo, vessel_id: e.target.value })}>
              <option value="">— Elegir —</option>
              {ctx.vessels.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}
        <button type="button" className="boton secundario" onClick={() => void crear()}>
          Dar de alta
        </button>
      </section>
    </>
  );
}
