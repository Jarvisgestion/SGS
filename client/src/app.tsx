import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, currentSession, OfflineError, setSession, type RecordTypeSummary, type Rol, type Session, type Vessel } from './lib/api.ts';
import { buquePorDefecto, navegaABordo, trabajaEnTierra } from './lib/roles.ts';
import { ir, useEnLinea, useRuta } from './lib/router.ts';
import { syncAll } from './lib/sync.ts';
import { cache } from './store/idb.ts';
import { drafts, type Draft } from './store/drafts.ts';
import { Login } from './screens/Login.tsx';
import { Inicio } from './screens/Inicio.tsx';
import { Formulario } from './screens/Formulario.tsx';
import { Registro } from './screens/Registro.tsx';
import { Bandeja, Tablero } from './screens/Tierra.tsx';
import { Catalogo } from './screens/Catalogo.tsx';
import { EditorFormulario } from './screens/EditorFormulario.tsx';

export interface Contexto {
  session: Session;
  recordTypes: RecordTypeSummary[];
  vessels: Vessel[];
  roles: Rol[];
  borradores: Draft[];
  recargarBorradores(): Promise<void>;
  refrescarCatalogo(): Promise<void>;
  sincronizar(): Promise<void>;
  enLinea: boolean;
}

export function App() {
  const [session, setSesion] = useState<Session | null>(currentSession);
  const [recordTypes, setRecordTypes] = useState<RecordTypeSummary[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [borradores, setBorradores] = useState<Draft[]>([]);
  const [avisoSync, setAvisoSync] = useState<string | null>(null);
  const enLinea = useEnLinea();
  const ruta = useRuta();

  const recargarBorradores = useCallback(async () => {
    if (!session) return setBorradores([]);
    setBorradores(
      (await drafts.all(session.user.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }, [session]);

  /**
   * El catálogo se guarda en IndexedDB apenas se baja: es lo que permite abrir
   * un formulario nuevo estando sin señal. También se vuelve a llamar cuando se
   * edita el catálogo desde la administración.
   */
  const refrescarCatalogo = useCallback(async () => {
    try {
      const [tipos, buques, rolesApi] = await Promise.all([
        api.recordTypes(),
        api.vessels(),
        api.roles(),
      ]);
      setRecordTypes(tipos.record_types);
      setVessels(buques.vessels);
      setRoles(rolesApi.roles);
      await cache.set('record_types', tipos.record_types);
      await cache.set('vessels', buques.vessels);
      await cache.set('roles', rolesApi.roles);
      await precargarFormularios(tipos.record_types);
    } catch (err) {
      if (!(err instanceof OfflineError)) console.warn('no se pudo refrescar el catálogo', err);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const [tiposCache, buquesCache, rolesCache] = await Promise.all([
        cache.get<RecordTypeSummary[]>('record_types'),
        cache.get<Vessel[]>('vessels'),
        cache.get<Rol[]>('roles'),
      ]);
      if (tiposCache) setRecordTypes(tiposCache);
      if (buquesCache) setVessels(buquesCache);
      if (rolesCache) setRoles(rolesCache);
      await refrescarCatalogo();
    })();
    void recargarBorradores();
  }, [session, recargarBorradores, refrescarCatalogo]);

  const sincronizar = useCallback(async () => {
    if (!session) return;
    const pendientes = (await drafts.all(session.user.id)).filter((d) => d.dirty);
    if (pendientes.length === 0) {
      setAvisoSync(null);
      return;
    }
    const tally = await syncAll(
      pendientes,
      {
        createRecord: api.createRecord,
        updateRecord: api.updateRecord,
        isOffline: (err) => err instanceof OfflineError,
      },
      drafts.save,
    );
    await recargarBorradores();
    setAvisoSync(
      tally.offline > 0
        ? 'Sin señal: los borradores quedan guardados en el equipo.'
        : tally.rejected > 0
          ? 'Tierra rechazó algún borrador. Abrilo para ver el motivo.'
          : null,
    );
  }, [recargarBorradores, session]);

  // Al recuperar señal se suben solos los borradores que quedaron pendientes.
  useEffect(() => {
    if (session && enLinea) void sincronizar();
  }, [session, enLinea, sincronizar]);

  function entrar(nueva: Session) {
    setSession(nueva);
    setSesion(nueva);
    ir(trabajaEnTierra(nueva) && !navegaABordo(nueva) ? 'tierra' : '');
  }

  function salir() {
    setSession(null);
    setSesion(null);
    ir('');
  }

  if (!session) return <Login onEntrar={entrar} />;

  const ctx: Contexto = {
    session,
    recordTypes,
    vessels,
    roles,
    borradores,
    recargarBorradores,
    refrescarCatalogo,
    sincronizar,
    enLinea,
  };
  const pendientes = borradores.filter((b) => b.dirty).length;

  return (
    <>
      <header className="app-header">
        <h1>
          SGS
          <span className="sub">{session.user.full_name}</span>
        </h1>
        <span className={`estado-conexion${enLinea ? '' : ' sin-senal'}`}>
          {enLinea ? 'En línea' : 'Sin señal'}
        </span>
        <button type="button" className="boton secundario" style={{ color: '#fff', minHeight: 40 }} onClick={salir}>
          Salir
        </button>
      </header>

      <nav className="nav">
        {navegaABordo(session) && (
          <>
            <a href="#/" className={ruta.length === 0 ? 'activo' : ''}>
              A bordo
            </a>
          </>
        )}
        {trabajaEnTierra(session) && (
          <>
            <a href="#/tierra" className={ruta[0] === 'tierra' ? 'activo' : ''}>
              Para revisar
            </a>
            <a href="#/tablero" className={ruta[0] === 'tablero' ? 'activo' : ''}>
              Cumplimiento
            </a>
          </>
        )}
        {session.user.can_manage_catalog && (
          <a href="#/admin" className={ruta[0] === 'admin' ? 'activo' : ''}>
            Catálogo
          </a>
        )}
      </nav>

      <main>
        {pendientes > 0 && (
          <div className="aviso alerta">
            {pendientes} {pendientes === 1 ? 'borrador sin subir' : 'borradores sin subir'}.{' '}
            {enLinea ? (
              <button type="button" className="boton secundario" style={{ minHeight: 36, padding: '6px 12px' }} onClick={() => void sincronizar()}>
                Sincronizar ahora
              </button>
            ) : (
              'Se van a subir solos cuando haya señal.'
            )}
          </div>
        )}
        {avisoSync && <div className="aviso error">{avisoSync}</div>}

        <Pantalla ruta={ruta} ctx={ctx} />
      </main>
    </>
  );
}

function Pantalla({ ruta, ctx }: { ruta: string[]; ctx: Contexto }) {
  const [seccion, parametro] = ruta;

  switch (seccion) {
    case undefined:
      return <Inicio ctx={ctx} />;
    case 'nuevo':
      return <Formulario ctx={ctx} recordTypeId={parametro!} />;
    case 'borrador':
      return <Formulario ctx={ctx} localId={parametro!} />;
    case 'registro':
      return <Registro ctx={ctx} id={parametro!} />;
    case 'tierra':
      return <Bandeja ctx={ctx} />;
    case 'tablero':
      return <Tablero />;
    case 'admin':
      if (!ctx.session.user.can_manage_catalog) {
        return <p className="vacio">Tu rol no habilita a editar el catálogo.</p>;
      }
      if (parametro === 'formulario') return <EditorFormulario ctx={ctx} recordTypeId={ruta[2]!} />;
      if (parametro === 'nuevo-formulario') return <EditorFormulario ctx={ctx} procedureId={ruta[2]!} />;
      return <Catalogo ctx={ctx} />;
    default:
      return <p className="vacio">No encontramos esa pantalla.</p>;
  }
}

/**
 * Baja el formulario de cada tipo de registro y lo guarda en el equipo.
 *
 * Sin esto, tener la lista del catálogo no alcanza: al abrir un registro nuevo
 * fuera de cobertura no habría con qué dibujar el formulario.
 */
async function precargarFormularios(tipos: RecordTypeSummary[]) {
  for (const tipo of tipos) {
    const clave = `schema:${tipo.id}`;
    const guardado = await cache.get<{ version: number }>(clave);
    if (guardado?.version === tipo.version) continue; // ya está, y en la misma versión
    try {
      await cache.set(clave, await api.recordType(tipo.id));
    } catch (err) {
      if (err instanceof OfflineError) return;
      console.warn(`no se pudo precargar ${tipo.code}`, err);
    }
  }
}

/** Mensaje de error uniforme: distingue "sin señal" de "tierra lo rechazó". */
export function mensajeDeError(err: unknown): string {
  if (err instanceof OfflineError) return 'Sin conexión con tierra. Lo que cargaste queda guardado en el equipo.';
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : 'Error inesperado';
}

export { buquePorDefecto };
