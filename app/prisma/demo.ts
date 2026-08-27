/**
 * Datos de demostración: un escenario coherente para recorrer la plataforma.
 *
 * Borra los registros operativos (no los catálogos ni los usuarios) y crea
 * un estado realista, con casos en cada situación posible: zafarranchos al
 * día, por vencer, vencidos y nunca hechos; un registro esperando revisión;
 * uno observado esperando corrección a bordo.
 *
 * `npm run db:demo`. No usarlo contra datos reales — borra los registros.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Fecha a N días de hoy (negativo = pasado). */
function hace(dias: number, hora = 10) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(hora, 0, 0, 0);
  return d;
}

async function main() {
  const buque = await prisma.buque.findFirst({ orderBy: { createdAt: "asc" } });
  if (!buque) throw new Error("No hay buque. Corré `npm run db:seed` primero.");

  const capitan = await prisma.usuario.findUnique({ where: { email: "capitan@pesantar.test" } });
  const asesor = await prisma.usuario.findUnique({ where: { email: "asesor@pesantar.test" } });
  if (!capitan || !asesor) throw new Error("Faltan los usuarios de demo. Corré `npm run db:seed`.");

  // Limpieza de lo operativo. El orden respeta las dependencias.
  await prisma.checklistRegistro.deleteMany();
  await prisma.boteRescateControlRevision.deleteMany();
  await prisma.boteRescateControl.deleteMany();
  await prisma.registroEmergenciaRevision.deleteMany();
  await prisma.registroEmergencia.deleteMany();
  await prisma.zafarranchoRevision.deleteMany();
  await prisma.zafarranchoParticipante.deleteMany();
  await prisma.zafarranchoEjercicio.deleteMany();

  const tripulantes = await prisma.tripulante.findMany({
    where: { buqueId: buque.id, activo: true },
    orderBy: { apellidoNombre: "asc" },
  });
  const tipos = await prisma.tipoZafarrancho.findMany({ where: { buqueId: buque.id } });
  const tipoPorCodigo = (c: string) => tipos.find((t) => t.codigo === c);

  // --- Zafarranchos (RE-01 A), uno por cada estado de cumplimiento ---
  const escenarios: {
    codigo: string;
    diasAtras: number;
    estado: string;
    temas: string;
    observacionRevision?: string;
  }[] = [
    {
      codigo: "incendio",
      diasAtras: 10,
      estado: "aprobado",
      temas:
        "Uso de extintores portátiles y equipos de respiración autónoma. Recorrido de los puntos de reunión y verificación del rol de incendio.",
    },
    {
      codigo: "abandono",
      diasAtras: 27,
      estado: "aprobado",
      temas:
        "Arriado de balsas salvavidas, colocación de trajes de inmersión y conteo de tripulación en el punto de reunión.",
    },
    {
      codigo: "hombre_al_agua",
      diasAtras: 72,
      estado: "aprobado",
      temas: "Maniobra Williamson, lanzamiento de aro salvavidas con luz y señal de humo.",
    },
    {
      codigo: "colision",
      diasAtras: 2,
      estado: "pendiente_revision",
      temas:
        "Cierre de puertas estancas, sondeo de tanques y evaluación de vías de agua tras un impacto simulado en la amura de babor.",
    },
    {
      codigo: "varadura",
      diasAtras: 5,
      estado: "observado",
      temas: "Sondeo alrededor del casco y evaluación de asiento.",
      observacionRevision:
        "Falta indicar la foja del libro de navegación y quiénes participaron de la maniobra de sondeo.",
    },
  ];

  for (const e of escenarios) {
    const tipo = tipoPorCodigo(e.codigo);
    if (!tipo) continue;
    const fecha = hace(e.diasAtras);

    const ejercicio = await prisma.zafarranchoEjercicio.create({
      data: {
        buqueId: buque.id,
        tipoZafarranchoId: tipo.id,
        creadoPorId: capitan.id,
        marea: "14",
        singladura: String(e.diasAtras),
        fecha,
        hora: "10:00",
        temasDesarrollados: e.temas,
        libroNavegacionFoja: e.estado === "observado" ? null : String(120 - e.diasAtras),
        estado: e.estado,
        submittedAt: fecha,
        participantes: {
          create: tripulantes.slice(0, 4).map((t) => ({
            tripulanteId: t.id,
            dni: t.dni,
            puesto: t.puesto,
          })),
        },
      },
    });

    if (e.estado === "aprobado") {
      await prisma.zafarranchoRevision.create({
        data: {
          ejercicioId: ejercicio.id,
          decision: "aprobado",
          revisadoPor: asesor.nombre,
          revisadoPorId: asesor.id,
          revisadoAt: hace(e.diasAtras - 1),
        },
      });
    }
    if (e.estado === "observado") {
      await prisma.zafarranchoRevision.create({
        data: {
          ejercicioId: ejercicio.id,
          decision: "observado",
          comentario: e.observacionRevision,
          revisadoPor: asesor.nombre,
          revisadoPorId: asesor.id,
          revisadoAt: hace(e.diasAtras - 1),
        },
      });
    }
  }

  // --- Registros de emergencia (RE-01 B/C/D/E/R) ---
  const incendio = await prisma.registroEmergencia.create({
    data: {
      buqueId: buque.id,
      creadoPorId: capitan.id,
      tipo: "incendio",
      marea: "14",
      singladura: "31",
      fecha: hace(6),
      hora: "03:20",
      descripcion:
        "Principio de incendio en el tablero eléctrico de la sala de máquinas, detectado por el guardia de máquinas. Sofocado con extintor de CO2 en aproximadamente 4 minutos.",
      condicionesHidrometeorologicas: "Viento SO 18 nudos, mar de fondo 2 m, visibilidad buena.",
      seInformaCompania: true,
      seInformaPna: true,
      huboHeridos: false,
      necesitaRemolque: false,
      estado: "pendiente_revision",
      submittedAt: hace(6),
      extIncendio: {
        create: {
          lugarInicio: "Sala de máquinas, tablero principal de babor",
          corteSuministro: true,
          cierreVentilacion: true,
          puertasCortafuego: true,
          cumpleRolIncendio: true,
          usoCo2: true,
          usoExtintores: true,
          verifDerrame: true,
        },
      },
    },
  });

  const colision = await prisma.registroEmergencia.create({
    data: {
      buqueId: buque.id,
      creadoPorId: capitan.id,
      tipo: "colision",
      fecha: hace(45),
      hora: "16:45",
      descripcion:
        "Toque con el muelle durante la maniobra de atraque por corriente inesperada. Sin ingreso de agua.",
      condicionesHidrometeorologicas: "Viento racheado del S, corriente de reflujo.",
      seInformaCompania: true,
      estado: "aprobado",
      submittedAt: hace(45),
      extColision: {
        create: {
          lugar: "Muelle 3, Puerto Madryn",
          detalleDanos: "Raspón superficial en la amura de babor, sin comprometer estanqueidad.",
          verifIncendio: true,
          verifDerrame: true,
          estadoEstanqueidadTanques: "Sondeos sin novedad en todos los tanques.",
        },
      },
    },
  });

  await prisma.registroEmergenciaRevision.create({
    data: {
      registroId: colision.id,
      decision: "aprobado",
      revisadoPor: asesor.nombre,
      revisadoPorId: asesor.id,
      revisadoAt: hace(44),
    },
  });

  // --- Control del bote de rescate (RE-01 F) ---
  const itemsBote = await prisma.checklistConfig.findMany({
    where: {
      buqueId: buque.id,
      activo: true,
      tipo: { in: ["bote_exterior", "bote_interior", "bote_pescante", "bote_inventario"] },
    },
    orderBy: [{ tipo: "asc" }, { orden: "asc" }],
  });

  const jefeMaquinas = tripulantes.find((t) => t.puesto.includes("Máquinas")) ?? tripulantes[0];

  // Uno con desvíos, observado por tierra: muestra el ciclo completo.
  const conDesvios = await prisma.boteRescateControl.create({
    data: {
      buqueId: buque.id,
      creadoPorId: capitan.id,
      confirmadoPorId: jefeMaquinas.id,
      confirmadoAt: hace(3),
      marea: "14",
      fechaHora: hace(3, 9),
      ubicacionPosicion: "Pescante de babor, cubierta principal",
      observaciones: "Se solicita repuesto de bengalas al próximo arribo.",
      estado: "observado",
      submittedAt: hace(3),
    },
  });
  await prisma.checklistRegistro.createMany({
    data: itemsBote.map((i) => {
      const noConforme = i.item === "Bengalas de mano" || i.item === "Nivel de combustible suficiente";
      return {
        checklistConfigId: i.id,
        registroPadreTipo: "bote_rescate_control",
        registroPadreId: conDesvios.id,
        boteRescateControlId: conDesvios.id,
        fecha: hace(3, 9),
        estado: noConforme ? "NO_OK" : "OK",
        observacion: noConforme
          ? i.item === "Bengalas de mano"
            ? "Sólo 3 de 6 bengalas; dos vencidas en el mes anterior."
            : "Tanque al 30%, se completa en el próximo arribo."
          : null,
      };
    }),
  });
  await prisma.boteRescateControlRevision.create({
    data: {
      controlId: conDesvios.id,
      decision: "observado",
      comentario:
        "Reponer las bengalas antes de la próxima marea y completar combustible. Volver a controlar y reenviar.",
      revisadoPor: asesor.nombre,
      revisadoPorId: asesor.id,
      revisadoAt: hace(2),
    },
  });

  // Uno anterior, aprobado y sin desvíos.
  const conforme = await prisma.boteRescateControl.create({
    data: {
      buqueId: buque.id,
      creadoPorId: capitan.id,
      confirmadoPorId: jefeMaquinas.id,
      confirmadoAt: hace(33),
      fechaHora: hace(33, 9),
      ubicacionPosicion: "Pescante de babor, cubierta principal",
      estado: "aprobado",
      submittedAt: hace(33),
    },
  });
  await prisma.checklistRegistro.createMany({
    data: itemsBote.map((i) => ({
      checklistConfigId: i.id,
      registroPadreTipo: "bote_rescate_control",
      registroPadreId: conforme.id,
      boteRescateControlId: conforme.id,
      fecha: hace(33, 9),
      estado: "OK",
      observacion: null,
    })),
  });
  await prisma.boteRescateControlRevision.create({
    data: {
      controlId: conforme.id,
      decision: "aprobado",
      revisadoPor: asesor.nombre,
      revisadoPorId: asesor.id,
      revisadoAt: hace(32),
    },
  });

  console.log("Datos de demo cargados:", {
    zafarranchos: escenarios.length,
    registrosEmergencia: 2,
    controlesBote: 2,
    incendioPendiente: incendio.id.slice(-6),
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
