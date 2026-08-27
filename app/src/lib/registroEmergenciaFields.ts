import type { TipoRegistroEmergencia } from "@/lib/types";

export type ExtFieldDef = { key: string; label: string; type: "text" | "boolean" | "date" };

export const TIPOS_EMERGENCIA: TipoRegistroEmergencia[] = [
  "sin_gobierno",
  "colision",
  "incendio",
  "varadura",
  "remolque",
];

export const EXT_FIELDS: Record<TipoRegistroEmergencia, ExtFieldDef[]> = {
  sin_gobierno: [
    { key: "buqueRemolque", label: "Buque remolcador", type: "text" },
    { key: "matriculaRemolque", label: "Matrícula del remolcador", type: "text" },
    { key: "horaInicio", label: "Hora de inicio", type: "text" },
    { key: "duracionEstimada", label: "Duración estimada", type: "text" },
    { key: "fechaUltimoControlAnexoAb", label: "Fecha último control Anexo A/B", type: "date" },
  ],
  colision: [
    { key: "lugar", label: "Lugar", type: "text" },
    { key: "detalleDanos", label: "Detalle de daños", type: "text" },
    { key: "verifIncendio", label: "Se verificó riesgo de incendio", type: "boolean" },
    { key: "verifDerrame", label: "Se verificó riesgo de derrame", type: "boolean" },
    { key: "estadoEstanqueidadTanques", label: "Estado de estanqueidad de tanques", type: "text" },
  ],
  incendio: [
    { key: "lugarInicio", label: "Lugar de inicio", type: "text" },
    { key: "corteSuministro", label: "Corte de suministro eléctrico", type: "boolean" },
    { key: "cierreVentilacion", label: "Cierre de ventilación", type: "boolean" },
    { key: "puertasCortafuego", label: "Puertas cortafuego cerradas", type: "boolean" },
    { key: "puertasEstancas", label: "Puertas estancas cerradas", type: "boolean" },
    { key: "cumpleRolIncendio", label: "Se cumplió el rol de incendio", type: "boolean" },
    { key: "usoEra", label: "Uso de E.R.A", type: "boolean" },
    { key: "usoMangueras", label: "Uso de mangueras de incendio", type: "boolean" },
    { key: "usoExtintores", label: "Uso de extintores", type: "boolean" },
    { key: "usoCo2", label: "Uso de equipo de CO2", type: "boolean" },
    { key: "usoTrajeBombero", label: "Uso de traje de bombero", type: "boolean" },
    { key: "verifPerdidaGobierno", label: "Se verificó pérdida de gobierno", type: "boolean" },
    { key: "verifDerrame", label: "Se verificó riesgo de derrame", type: "boolean" },
  ],
  varadura: [
    { key: "lugar", label: "Lugar", type: "text" },
    { key: "detalleDanos", label: "Detalle de daños", type: "text" },
    { key: "danosSolucionablesAbordo", label: "Daños solucionables a bordo", type: "boolean" },
    { key: "detalleSolucion", label: "Detalle de la solución", type: "text" },
  ],
  remolque: [
    { key: "posicionGeografica", label: "Posición geográfica", type: "text" },
    { key: "buqueRemolque", label: "Buque remolcador", type: "text" },
    { key: "matriculaRemolque", label: "Matrícula del remolcador", type: "text" },
    { key: "horaInicio", label: "Hora de inicio", type: "text" },
    { key: "duracionEstimada", label: "Duración estimada", type: "text" },
    { key: "verificacionesAntesDuranteDespues", label: "Verificaciones antes/durante/después", type: "text" },
  ],
};
