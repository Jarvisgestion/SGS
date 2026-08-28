import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buquePorDefecto, mensajeDeError, type Contexto } from '../app.tsx';
import { api, ApiError, OfflineError, type RecordTypeDetail } from '../lib/api.ts';
import { ir } from '../lib/router.ts';
import {
  emptyForm,
  label,
  signatureBlocks,
  toPayload,
  triggeredRecordTypes,
  validateForm,
  type Field,
  type FormData,
} from '../lib/schema.ts';
import { syncDraft } from '../lib/sync.ts';
import { cache } from '../store/idb.ts';
import { drafts, newDraft, type Draft } from '../store/drafts.ts';
import { CampoDinamico } from '../components/Fields.tsx';
import { SignaturePad } from '../components/SignaturePad.tsx';

interface Props {
  ctx: Contexto;
  recordTypeId?: string;
  localId?: string;
}

export function Formulario({ ctx, recordTypeId, localId }: Props) {
  const [tipo, setTipo] = useState<RecordTypeDetail | null>(null);
  const [borrador, setBorrador] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intentoEnviar, setIntentoEnviar] = useState(false);
  const [firmando, setFirmando] = useState<Field | null>(null);
  const [enviando, setEnviando] = useState(false);
  const guardado = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimo = useRef<Draft | null>(null);

  // --- carga del tipo de registro y del borrador --------------------------
  useEffect(() => {
    void (async () => {
      try {
        const existente = localId ? await drafts.get(localId) : null;
        const idTipo = recordTypeId ?? existente?.recordTypeId;
        if (!idTipo) return setError('No encontramos ese borrador.');

        const detalle = await cargarTipo(idTipo);
        setTipo(detalle);

        setBorrador(
          existente ??
            newDraft({
              companyId: ctx.session.user.companies[0]!,
              recordTypeId: detalle.id,
              recordTypeCode: detalle.code,
              recordTypeName: detalle.name,
              vesselId: detalle.scope === 'vessel' ? buquePorDefecto(ctx.session) : null,
              data: emptyForm(detalle.field_schema),
            }),
        );
      } catch (err) {
        setError(mensajeDeError(err));
      }
    })();
  }, [recordTypeId, localId, ctx.session]);

  /** Guardado local con retardo: escribir en cada tecla castiga a la tablet. */
  const guardarLocal = useCallback(
    (siguiente: Draft) => {
      setBorrador(siguiente);
      if (guardado.current) clearTimeout(guardado.current);
      ultimo.current = siguiente;
      guardado.current = setTimeout(() => {
        void drafts.save(siguiente).then(() => ctx.recargarBorradores());
        // Al primer dato cargado la URL pasa a apuntar al borrador: si la app
        // se cierra o el equipo se reinicia, al volver se retoma lo cargado en
        // vez de arrancar un formulario en blanco. Se usa replaceState para no
        // remontar la pantalla mientras se está escribiendo.
        if (window.location.hash.startsWith('#/nuevo/')) {
          history.replaceState(null, '', `#/borrador/${siguiente.localId}`);
        }
      }, 400);
    },
    [ctx],
  );

  /**
   * Si la app se cierra (se apaga la tablet, se mata la aplicación) hay que
   * bajar lo pendiente antes de irse: el retardo del autoguardado no puede
   * costarle a nadie lo último que escribió.
   */
  useEffect(() => {
    function volcar() {
      if (!ultimo.current) return;
      if (guardado.current) clearTimeout(guardado.current);
      void drafts.save(ultimo.current);
    }
    window.addEventListener('pagehide', volcar);
    document.addEventListener('visibilitychange', volcar);
    return () => {
      window.removeEventListener('pagehide', volcar);
      document.removeEventListener('visibilitychange', volcar);
      volcar();
    };
  }, []);

  const errores = useMemo(
    () => (tipo && borrador ? validateForm(tipo.field_schema, borrador.data) : []),
    [tipo, borrador],
  );
  const erroresPorCampo = new Map(errores.map((e) => [e.key, e.message]));

  if (error) return <div className="aviso error">{error}</div>;
  if (!tipo || !borrador) return <p className="vacio">Cargando el formulario…</p>;

  const bloquesDeFirma = signatureBlocks(tipo.field_schema);
  const faltanFirmas = bloquesDeFirma.filter((b) => !borrador.signedKeys.includes(b.key));
  const disparados = triggeredRecordTypes(tipo.field_schema, borrador.data);

  function cambiar(key: string, value: unknown) {
    guardarLocal({ ...borrador!, data: { ...borrador!.data, [key]: value }, dirty: true });
  }

  /** Sube el borrador y devuelve el id que le dio tierra. La firma lo necesita. */
  async function asegurarEnTierra(actual: Draft): Promise<Draft> {
    if (actual.serverId && !actual.dirty) return actual;

    const payload = { ...actual, data: toPayload(tipo!.field_schema, actual.data) };
    const salida = await syncDraft(payload, {
      createRecord: api.createRecord,
      updateRecord: api.updateRecord,
      isOffline: (err) => err instanceof OfflineError,
    });
    if (salida.result === 'offline') throw new OfflineError();
    if (salida.result === 'rejected') throw new ApiError(422, salida.error);

    const actualizado = { ...actual, serverId: salida.draft.serverId, dirty: false };
    await drafts.save(actualizado);
    setBorrador(actualizado);
    return actualizado;
  }

  async function firmar(bloque: Field, entrada: { pin?: string; imageDataUrl?: string; method?: 'canvas' | 'pin' }) {
    const conId = await asegurarEnTierra(borrador!);

    let imagenId: string | undefined;
    if (entrada.imageDataUrl) {
      // Provisorio: la imagen viaja como data URL hasta que haya almacenamiento
      // de archivos (ver api/README.md, "Pendientes").
      const adjunto = await api.addAttachment(conId.serverId!, {
        file_url: entrada.imageDataUrl,
        file_type: 'image',
        file_name: `firma-${bloque.key}.png`,
      });
      imagenId = adjunto.id;
    }

    try {
      await api.sign(conId.serverId!, {
        field_key: bloque.key,
        method: entrada.method,
        pin: entrada.pin,
        signature_image_id: imagenId,
      });
    } catch (err) {
      // 409 = ese bloque ya estaba firmado; el estado local se había perdido.
      if (!(err instanceof ApiError) || err.status !== 409) throw err;
    }

    const firmado = { ...conId, signedKeys: [...conId.signedKeys, bloque.key] };
    await drafts.save(firmado);
    setBorrador(firmado);
    setFirmando(null);
  }

  async function enviar() {
    setIntentoEnviar(true);
    setError(null);
    if (errores.length > 0) return;
    if (faltanFirmas.length > 0) {
      return setError(`Falta firmar: ${faltanFirmas.map((b) => label(b)).join(', ')}`);
    }

    setEnviando(true);
    try {
      const conId = await asegurarEnTierra(borrador!);
      await api.submitRecord(conId.serverId!);
      // Se corta el autoguardado antes de borrar: si no, al desmontarse la
      // pantalla el volcado pendiente reviviría el borrador ya enviado.
      ultimo.current = null;
      if (guardado.current) clearTimeout(guardado.current);
      await drafts.remove(conId.localId);
      await ctx.recargarBorradores();
      ir(`registro/${conId.serverId}`);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function descartar() {
    if (!confirm('¿Descartar este borrador? No se puede deshacer.')) return;
    ultimo.current = null;
    if (guardado.current) clearTimeout(guardado.current);
    await drafts.remove(borrador!.localId);
    await ctx.recargarBorradores();
    ir('');
  }

  return (
    <>
      <section className="panel">
        <h2>
          <span className="codigo">{tipo.code}</span> · {tipo.name}
        </h2>

        {tipo.scope === 'vessel' && (
          <div className="campo">
            <label htmlFor="buque">Buque</label>
            <select
              id="buque"
              value={borrador.vesselId ?? ''}
              onChange={(e) => guardarLocal({ ...borrador, vesselId: e.target.value || null, dirty: true })}
            >
              <option value="">— Elegir —</option>
              {ctx.vessels.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.matricula})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="campo">
          <label htmlFor="marea">Marea / Singladura</label>
          <input
            id="marea"
            type="text"
            value={borrador.marea ?? ''}
            onChange={(e) => guardarLocal({ ...borrador, marea: e.target.value, dirty: true })}
          />
        </div>

        {tipo.field_schema
          .filter((f) => f.type !== 'signature_block')
          .map((f) => (
            <CampoDinamico
              key={f.key}
              field={f}
              value={borrador.data[f.key]}
              error={intentoEnviar ? erroresPorCampo.get(f.key) : undefined}
              onChange={(v) => cambiar(f.key, v)}
            />
          ))}
      </section>

      {disparados.length > 0 && (
        <div className="aviso alerta">
          Por lo que marcaste, este hecho también exige cargar: <strong>{disparados.join(', ')}</strong>. Podés
          hacerlo después de enviar este registro.
        </div>
      )}

      {bloquesDeFirma.length > 0 && (
        <section className="panel">
          <h2>Firmas</h2>
          {!ctx.enLinea && <div className="aviso info">Para firmar hace falta señal. El borrador ya está guardado.</div>}
          {bloquesDeFirma.map((bloque) => {
            const firmado = borrador.signedKeys.includes(bloque.key);
            return (
              <div className="firma" key={bloque.key}>
                <div className="cabecera">
                  <strong>{label(bloque)}</strong>
                  <span className={`chip ${firmado ? 'aprobado' : 'borrador'}`}>
                    {firmado ? 'Firmado' : 'Sin firmar'}
                  </span>
                </div>
                <button
                  type="button"
                  className="boton secundario"
                  disabled={firmado || !ctx.enLinea}
                  onClick={() => setFirmando(bloque)}
                >
                  {firmado ? 'Ya firmado' : 'Firmar'}
                </button>
              </div>
            );
          })}
        </section>
      )}

      {intentoEnviar && errores.length > 0 && (
        <div className="aviso error">
          Faltan datos: {errores.map((e) => e.key.replace(/_/g, ' ')).join(', ')}
        </div>
      )}
      {error && <div className="aviso error">{error}</div>}

      <div className="acciones">
        <button type="button" className="boton" onClick={() => void enviar()} disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar a tierra'}
        </button>
        <button type="button" className="boton secundario" onClick={() => ir('')}>
          Seguir después
        </button>
        <button type="button" className="boton secundario" onClick={() => void descartar()}>
          Descartar
        </button>
      </div>

      {firmando && (
        <SignaturePad
          fieldLabel={label(firmando)}
          signerRole={
            ctx.roles.find((r) => r.code === firmando.signer_role)?.name ??
            (firmando.signer_role ?? '').replace(/_/g, ' ')
          }
          requirement={tipo.signature_requirement}
          onCancel={() => setFirmando(null)}
          onSign={(entrada) => firmar(firmando, entrada)}
        />
      )}
    </>
  );
}

/**
 * El esquema sale de la copia local si está (es lo que hace que el formulario
 * abra al instante y sin señal), y se refresca contra tierra en segundo plano.
 */
async function cargarTipo(id: string): Promise<RecordTypeDetail> {
  const clave = `schema:${id}`;
  const guardado = await cache.get<RecordTypeDetail>(clave);
  if (guardado) {
    void api
      .recordType(id)
      .then((fresco) => cache.set(clave, fresco))
      .catch(() => {});
    return guardado;
  }

  const fresco = await api.recordType(id);
  await cache.set(clave, fresco);
  return fresco;
}

export type { FormData };
