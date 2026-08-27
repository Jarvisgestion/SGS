import { PrismaClient } from "@prisma/client";
import { hashPin } from "../src/lib/pin";

const prisma = new PrismaClient();

async function main() {
  const buque = await prisma.buque.upsert({
    where: { matricula: "PESANTAR-1" },
    update: {},
    create: {
      nombre: "Pesantar 1",
      matricula: "PESANTAR-1",
      esloraMetros: 76,
      estado: "en_construccion",
    },
  });

  await prisma.procedimientoConfig.upsert({
    where: {
      buqueId_codigo_revision: {
        buqueId: buque.id,
        codigo: "PE-01",
        revision: "borrador-pesantar-1",
      },
    },
    update: {},
    create: {
      buqueId: buque.id,
      codigo: "PE-01",
      nombre: "Preparación para Emergencias a Bordo",
      revision: "borrador-pesantar-1",
      fechaVigencia: new Date(),
    },
  });

  // PIN de demo para poder probar la confirmación de checklists (RE-01 F).
  // Son de juguete y están a la vista a propósito: sirven para el piloto local.
  // Al pasar a un entorno real hay que asignar PIN reales por tripulante desde
  // la pantalla de administración (todavía no construida) y NO sembrar ninguno.
  const tripulantesSeed = [
    { apellidoNombre: "Fernández, Carlos", dni: "20111222", puesto: "Capitán", pin: "1234" },
    { apellidoNombre: "Gómez, Luis", dni: "22333444", puesto: "Jefe de Máquinas", pin: "2345" },
    { apellidoNombre: "Pérez, Ana", dni: "24555666", puesto: "Oficial de Cubierta", pin: "3456" },
    { apellidoNombre: "Suárez, Jorge", dni: "26777888", puesto: "Marinero", pin: "4567" },
  ];
  for (const { pin, ...t } of tripulantesSeed) {
    const pinHash = await hashPin(pin);
    await prisma.tripulante.upsert({
      where: { buqueId_dni: { buqueId: buque.id, dni: t.dni } },
      update: { pinHash },
      create: { ...t, pinHash, buqueId: buque.id },
    });
  }

  // Catálogo de referencia relevado del manual de Xeitosiño S.A. (Rev. 15).
  // Son valores de PARTIDA editables — ver docs/especificacion-plataforma-sgs.md,
  // sección 5.2 — a ajustar cuando Pesantar defina su propio manual.
  const tiposZafarrancho = [
    { codigo: "incendio", nombre: "Incendio", periodicidadDias: 30 },
    { codigo: "abandono", nombre: "Abandono de buque", periodicidadDias: 30 },
    { codigo: "colision", nombre: "Colisión", periodicidadDias: 60 },
    { codigo: "varadura", nombre: "Varadura", periodicidadDias: 60 },
    { codigo: "derrame_hidrocarburos", nombre: "Derrame de hidrocarburos", periodicidadDias: 60 },
    { codigo: "sin_gobierno", nombre: "Buque sin gobierno", periodicidadDias: 60 },
    { codigo: "hombre_al_agua", nombre: "Hombre al agua", periodicidadDias: 60 },
    { codigo: "espacios_confinados", nombre: "Espacios confinados", periodicidadDias: 60 },
    { codigo: "buque_tierra", nombre: "Comunicación buque-tierra", periodicidadDias: 365 },
  ];
  for (const tz of tiposZafarrancho) {
    await prisma.tipoZafarrancho.upsert({
      where: { buqueId_codigo: { buqueId: buque.id, codigo: tz.codigo } },
      update: {},
      create: { ...tz, buqueId: buque.id },
    });
  }

  // PM-04 Anexo A (equipos críticos) — mismo criterio: catálogo de referencia editable.
  const anexoAItems = [
    "VHF",
    "BLU",
    "INMARSAT/MOMPESAT",
    "AIS",
    "GPS",
    "Teléfono satelital",
    "Radar",
    "Cabos",
    "Cables de acero",
    "Luces de navegación",
  ];
  for (const [i, item] of anexoAItems.entries()) {
    await prisma.checklistConfig.upsert({
      where: {
        buqueId_tipo_item: { buqueId: buque.id, tipo: "pm04_anexoA", item },
      },
      update: {},
      create: {
        buqueId: buque.id,
        tipo: "pm04_anexoA",
        item,
        orden: i + 1,
      },
    });
  }

  // RE-01 F — Control del bote de rescate. Los cuatro grupos que define la
  // especificación (sección 5.2, campo `tipo` de checklist_config). Igual que
  // el resto de los catálogos: son ítems de PARTIDA, editables por buque.
  // `cantidadEsperada` sólo aplica al inventario (cuántas unidades debe haber).
  const boteChecklists: Record<string, { item: string; cantidad?: number }[]> = {
    bote_exterior: [
      { item: "Casco sin fisuras ni golpes" },
      { item: "Cabos de vida en buen estado" },
      { item: "Luz de posición operativa" },
      { item: "Cintas retrorreflectivas visibles" },
      { item: "Tapón de drenaje colocado" },
    ],
    bote_interior: [
      { item: "Motor arranca y funciona" },
      { item: "Nivel de combustible suficiente" },
      { item: "Achicador y balde presentes" },
      { item: "Asientos y sujeciones firmes" },
    ],
    bote_pescante: [
      { item: "Pescante sin corrosión" },
      { item: "Cable de izado en buen estado" },
      { item: "Gancho de escape operativo" },
      { item: "Winche lubricado y operativo" },
    ],
    bote_inventario: [
      { item: "Remos", cantidad: 2 },
      { item: "Bengalas de mano", cantidad: 6 },
      { item: "Chalecos salvavidas", cantidad: 6 },
      { item: "Botiquín de primeros auxilios", cantidad: 1 },
      { item: "Linterna estanca", cantidad: 1 },
      { item: "Bichero", cantidad: 1 },
    ],
  };
  for (const [tipo, items] of Object.entries(boteChecklists)) {
    for (const [i, { item, cantidad }] of items.entries()) {
      await prisma.checklistConfig.upsert({
        where: { buqueId_tipo_item: { buqueId: buque.id, tipo, item } },
        update: {},
        create: {
          buqueId: buque.id,
          tipo,
          item,
          cantidadEsperada: cantidad ?? null,
          orden: i + 1,
        },
      });
    }
  }

  console.log("Seed completo:", { buqueId: buque.id, buque: buque.nombre });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
