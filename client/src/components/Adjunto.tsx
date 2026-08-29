import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { archivos, esReferenciaLocal } from '../store/archivos.ts';

/**
 * Muestra un adjunto, esté donde esté: si todavía espera señal se lee del
 * dispositivo, y si ya está en tierra se baja con el token — los adjuntos no
 * son públicos, así que no se puede apuntar un <img> directo al servidor.
 */
export function VistaAdjunto({ referencia, alto = 140 }: { referencia: string; alto?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    let objectUrl: string | null = null;

    const contenido = esReferenciaLocal(referencia)
      ? archivos.obtener(referencia).then((a) => a?.contenido)
      : api.descargarAdjunto(referencia);

    void contenido
      .then((blob) => {
        if (!vigente) return;
        if (!blob) return setError(true);
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => vigente && setError(true));

    return () => {
      vigente = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [referencia]);

  if (error) return <p style={{ color: 'var(--tenue)' }}>No se pudo abrir el adjunto.</p>;
  if (!url) return <p style={{ color: 'var(--tenue)' }}>Abriendo…</p>;

  return (
    <div>
      <img
        src={url}
        alt="Adjunto"
        style={{ maxHeight: alto, borderRadius: 8, border: '1px solid var(--borde)', background: '#fff' }}
      />
      {esReferenciaLocal(referencia) && (
        <p style={{ color: 'var(--tenue)', fontSize: 13, margin: '4px 0 0' }}>
          Guardado en el equipo; se sube cuando haya señal.
        </p>
      )}
    </div>
  );
}

/**
 * Campo de archivo: en un teléfono abre la cámara directamente, que es como se
 * saca la foto de un acaecimiento estando a bordo.
 *
 * El archivo queda primero en el dispositivo y se sube con el resto del
 * borrador: sacar una foto fuera de cobertura no puede depender de la señal.
 */
export function CampoArchivo({
  id,
  value,
  readOnly,
  guardar,
  onChange,
}: {
  id: string;
  value: string | undefined;
  readOnly: boolean;
  guardar?: (archivo: File) => Promise<string>;
  onChange(v: string | undefined): void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function elegir(archivo: File | undefined) {
    if (!archivo || !guardar) return;
    setError(null);
    try {
      onChange(await guardar(archivo));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el archivo');
    }
  }

  if (value) {
    return (
      <div>
        <VistaAdjunto referencia={value} />
        {!readOnly && (
          <button
            type="button"
            className="boton secundario"
            style={{ display: 'block', marginTop: 8 }}
            onClick={() => onChange(undefined)}
          >
            Quitar
          </button>
        )}
      </div>
    );
  }

  if (readOnly) return <p style={{ color: 'var(--tenue)' }}>Sin adjuntar.</p>;

  return (
    <div>
      <input
        id={id}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={(e) => void elegir(e.target.files?.[0])}
      />
      {error && <p className="error">{error}</p>}
    </div>
  );
}
