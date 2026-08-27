export const boteRescateInclude = {
  confirmadoPor: { select: { id: true, apellidoNombre: true, puesto: true } },
  checklistRegistros: { include: { checklistConfig: true } },
  revisiones: { orderBy: { revisadoAt: "desc" } },
} as const;
