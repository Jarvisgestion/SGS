import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';

/**
 * Muestra un adjunto guardado. Se baja con el token y se arma una URL local:
 * los adjuntos no son públicos, así que no se puede apuntar un <img> directo
 * al servidor.
 */
export function AdjuntoImagen({ id, alto = 140 }: { id: string; alto?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    let objectUrl: string | null = null;

    void api
      .descargarAdjunto(id)
      .then((blob) => {
        if (!vigente) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => vigente && setError(true));

    return () => {
      vigente = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (error) return <p style={{ color: 'var(--tenue)' }}>No se pudo abrir el adjunto.</p>;
  if (!url) return <p style={{ color: 'var(--tenue)' }}>Abriendo…</p>;

  return (
    <img
      src={url}
      alt="Adjunto"
      style={{ maxHeight: alto, borderRadius: 8, border: '1px solid var(--borde)', background: '#fff' }}
    />
  );
}

/**
 * Campo de archivo: en un teléfono abre la cámara directamente, que es como se
 * saca la foto de un acaecimiento estando a bordo.
 */
export function CampoArchivo({
  id,
  value,
  readOnly,
  subir,
  onChange,
}: {
  id: string;
  value: string | undefined;
  readOnly: boolean;
  subir?: (archivo: File) => Promise<string>;
  onChange(v: string | undefined): void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(archivo: File | undefined) {
    if (!archivo || !subir) return;
    setError(null);
    setSubiendo(true);
    try {
      onChange(await subir(archivo));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el archivo');
    } finally {
      setSubiendo(false);
    }
  }

  if (value) {
    return (
      <div>
        <AdjuntoImagen id={value} />
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
        disabled={subiendo || !subir}
        onChange={(e) => void elegir(e.target.files?.[0])}
      />
      {subiendo && <p style={{ color: 'var(--tenue)' }}>Subiendo…</p>}
      {!subir && <p style={{ color: 'var(--tenue)' }}>Hace falta señal para adjuntar.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
