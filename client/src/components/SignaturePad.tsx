/**
 * Firma de un bloque del formulario.
 *
 * Qué pide depende del `signature_requirement` del tipo de registro, que es la
 * misma regla que aplica el servidor: manuscrita pide el trazo, pin pide el
 * PIN, y "ambas" pide las dos cosas.
 */
import { useEffect, useRef, useState } from 'react';
import type { SignatureRequirement } from '../lib/api.ts';

interface Props {
  fieldLabel: string;
  signerRole: string;
  requirement: SignatureRequirement;
  onCancel(): void;
  onSign(input: { pin?: string; imagen?: Blob; method?: 'canvas' | 'pin' }): Promise<void>;
}

/** El trazo se sube como archivo PNG, no como texto embebido en el registro. */
function comoPng(canvas: HTMLCanvasElement | null): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    if (!canvas) return resolve(undefined);
    canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/png');
  });
}

export function SignaturePad({ fieldLabel, signerRole, requirement, onCancel, onSign }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trazado, setTrazado] = useState(false);
  const [pin, setPin] = useState('');
  const [metodo, setMetodo] = useState<'canvas' | 'pin'>('canvas');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const elegible = requirement === 'configurable_por_firmante';
  const pideTrazo = requirement === 'manuscrita' || requirement === 'ambas' || (elegible && metodo === 'canvas');
  const pidePin = requirement === 'pin' || requirement === 'ambas' || (elegible && metodo === 'pin');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pideTrazo) return;

    // El canvas se dibuja a la resolución real del dispositivo para que el
    // trazo no salga borroso en una tablet.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#17212b';

    let dibujando = false;

    const punto = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const abajo = (e: PointerEvent) => {
      dibujando = true;
      canvas.setPointerCapture(e.pointerId);
      const p = punto(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      setTrazado(true);
    };
    const mover = (e: PointerEvent) => {
      if (!dibujando) return;
      const p = punto(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const arriba = () => {
      dibujando = false;
    };

    canvas.addEventListener('pointerdown', abajo);
    canvas.addEventListener('pointermove', mover);
    canvas.addEventListener('pointerup', arriba);
    canvas.addEventListener('pointerleave', arriba);
    return () => {
      canvas.removeEventListener('pointerdown', abajo);
      canvas.removeEventListener('pointermove', mover);
      canvas.removeEventListener('pointerup', arriba);
      canvas.removeEventListener('pointerleave', arriba);
    };
  }, [pideTrazo]);

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTrazado(false);
  }

  async function confirmar() {
    setError(null);
    if (pideTrazo && !trazado) return setError('Falta la firma');
    if (pidePin && pin.length < 4) return setError('Ingresá el PIN');

    setEnviando(true);
    try {
      await onSign({
        pin: pidePin ? pin : undefined,
        imagen: pideTrazo ? await comoPng(canvasRef.current) : undefined,
        method: elegible ? metodo : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo firmar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fondo" role="dialog" aria-modal="true" aria-label={`Firmar ${fieldLabel}`}>
      <div className="modal">
        <h2>Firmar: {fieldLabel}</h2>
        <p style={{ color: 'var(--tenue)', marginTop: 0 }}>Firmás en carácter de {signerRole}.</p>

        {elegible && (
          <div className="si-no" style={{ marginBottom: 14 }}>
            <button type="button" aria-pressed={metodo === 'canvas'} onClick={() => setMetodo('canvas')}>
              Firmar de puño
            </button>
            <button type="button" aria-pressed={metodo === 'pin'} onClick={() => setMetodo('pin')}>
              Confirmar con PIN
            </button>
          </div>
        )}

        {pideTrazo && (
          <>
            <canvas ref={canvasRef} className="pad" aria-label="Área de firma" />
            <button type="button" className="boton secundario" style={{ marginTop: 8 }} onClick={limpiar}>
              Borrar y firmar de nuevo
            </button>
          </>
        )}

        {pidePin && (
          <div className="campo" style={{ marginTop: 16 }}>
            <label htmlFor="pin">PIN personal</label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
          </div>
        )}

        {error && <div className="aviso error">{error}</div>}

        <div className="acciones">
          <button type="button" className="boton" onClick={confirmar} disabled={enviando}>
            {enviando ? 'Firmando…' : 'Firmar'}
          </button>
          <button type="button" className="boton secundario" onClick={onCancel} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
