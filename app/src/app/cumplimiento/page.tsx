import Link from "next/link";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { getBuqueActivo } from "@/lib/buque";
import { obtenerCumplimiento } from "@/lib/cumplimientoQuery";
import { ESTADO_CUMPLIMIENTO_LABEL, type EstadoCumplimiento } from "@/lib/cumplimiento";

const BADGE: Record<EstadoCumplimiento, string> = {
  vencido: "bg-red-100 text-red-800",
  por_vencer: "bg-amber-100 text-amber-800",
  nunca: "bg-neutral-200 text-neutral-700",
  al_dia: "bg-green-100 text-green-800",
};

function detalle(dias: number | null, estado: EstadoCumplimiento) {
  if (estado === "nunca") return "Nunca se registró un ejercicio aprobado";
  if (dias === null) return "";
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} día(s)`;
  if (dias === 0) return "Vence hoy";
  return `Faltan ${dias} día(s)`;
}

export default async function CumplimientoPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login?destino=/cumplimiento");

  const buque = await getBuqueActivo();
  const filas = await obtenerCumplimiento(buque.id);

  const vencidos = filas.filter((f) => f.estado === "vencido").length;
  const porVencer = filas.filter((f) => f.estado === "por_vencer").length;

  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-10">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← Inicio
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Cumplimiento de zafarranchos</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {buque.nombre} — según la periodicidad definida para cada tipo. Sólo cuentan los ejercicios
        aprobados por tierra: uno cargado y sin revisar todavía no es evidencia ante una inspección.
      </p>

      {(vencidos > 0 || porVencer > 0) && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {vencidos > 0 && <strong>{vencidos} vencido(s).</strong>}
          {vencidos > 0 && porVencer > 0 && " "}
          {porVencer > 0 && <>{porVencer} por vencer.</>}
        </p>
      )}

      <div className="mt-6 space-y-2">
        {filas.map((f) => (
          <div
            key={f.tipoId}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm"
          >
            <div>
              <span className="font-medium">{f.nombre}</span>
              <span className="ml-2 text-xs text-neutral-500">cada {f.periodicidadDias} días</span>
              <p className="mt-0.5 text-xs text-neutral-600">
                {f.ultimoAprobado
                  ? `Último aprobado: ${f.ultimoAprobado.toLocaleDateString("es-AR")}`
                  : "Sin ejercicios aprobados"}
                {f.proximoVencimiento && (
                  <> · Vence: {f.proximoVencimiento.toLocaleDateString("es-AR")}</>
                )}
              </p>
              {f.pendientesRevision > 0 && (
                <p className="mt-0.5 text-xs text-blue-700">
                  {f.pendientesRevision} ejercicio(s) cargado(s) esperando revisión de tierra
                </p>
              )}
            </div>
            <div className="text-right">
              <span className={`inline-block rounded px-2 py-0.5 text-xs ${BADGE[f.estado]}`}>
                {ESTADO_CUMPLIMIENTO_LABEL[f.estado]}
              </span>
              <p className="mt-0.5 text-xs text-neutral-500">{detalle(f.diasRestantes, f.estado)}</p>
            </div>
          </div>
        ))}
        {filas.length === 0 && (
          <p className="text-sm text-neutral-500">
            No hay tipos de zafarrancho activos. Cargalos desde Administración → Catálogos.
          </p>
        )}
      </div>

      <p className="mt-6 text-xs text-neutral-500">
        El aviso de &quot;por vencer&quot; se dispara al 20% restante del período (6 días para uno
        de 30, 73 para uno anual). Es un criterio elegido para esta versión, no algo que fije la
        especificación — se puede ajustar.
      </p>
    </main>
  );
}
