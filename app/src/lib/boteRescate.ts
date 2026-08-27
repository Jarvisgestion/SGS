export const boteRescateInclude = {
  creadoPor: { select: { id: true, nombre: true, rol: true } },
  confirmadoPor: { select: { id: true, apellidoNombre: true, puesto: true } },
  checklistRegistros: { include: { checklistConfig: true } },
  revisiones: { orderBy: { revisadoAt: "desc" } },
} as const;
