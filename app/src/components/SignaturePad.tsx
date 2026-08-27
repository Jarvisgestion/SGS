"use client";

import { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

type Props = {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
};

export function SignaturePad({ label, value, onChange }: Props) {
  const padRef = useRef<SignatureCanvas>(null);

  function handleEnd() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return;
    onChange(pad.getTrimmedCanvas().toDataURL("image/png"));
  }

  function handleClear() {
    padRef.current?.clear();
    onChange(null);
  }

  if (value) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-700">{label}</p>
        <div className="rounded border border-neutral-300 bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={`Firma — ${label}`} className="h-24" />
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-blue-700 underline"
        >
          Firmar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-neutral-700">{label}</p>
      <div className="rounded border border-neutral-300 bg-white">
        <SignatureCanvas
          ref={padRef}
          penColor="black"
          canvasProps={{ className: "h-24 w-full touch-none" }}
          onEnd={handleEnd}
        />
      </div>
      <button type="button" onClick={handleClear} className="text-xs text-blue-700 underline">
        Limpiar
      </button>
    </div>
  );
}
