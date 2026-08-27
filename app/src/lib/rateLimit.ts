/**
 * Límite de intentos fallidos de PIN, por tripulante.
 *
 * Cierra el agujero obvio de un PIN de 4 dígitos: sin esto, 10.000 intentos
 * lo rompen en segundos. Con 5 intentos y 15 minutos de bloqueo, probar todo
 * el espacio lleva semanas.
 *
 * Limitación conocida: el contador vive en memoria del proceso. Alcanza para
 * el despliegue de un solo proceso del piloto, pero se pierde al reiniciar y
 * no se comparte entre instancias. Al escalar a varias réplicas hay que
 * moverlo a la base o a Redis — es el mismo contrato, otro almacenamiento.
 */

const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

type Registro = { fallos: number; bloqueadoHasta: number | null };

const intentos = new Map<string, Registro>();

export type ResultadoLimite = { permitido: true } | { permitido: false; minutosRestantes: number };

export function chequearLimite(clave: string): ResultadoLimite {
  const reg = intentos.get(clave);
  if (!reg?.bloqueadoHasta) return { permitido: true };

  if (Date.now() < reg.bloqueadoHasta) {
    return {
      permitido: false,
      minutosRestantes: Math.ceil((reg.bloqueadoHasta - Date.now()) / 60000),
    };
  }

  // Venció el bloqueo: arranca de cero.
  intentos.delete(clave);
  return { permitido: true };
}

export function registrarFallo(clave: string) {
  const reg = intentos.get(clave) ?? { fallos: 0, bloqueadoHasta: null };
  reg.fallos += 1;
  if (reg.fallos >= MAX_INTENTOS) reg.bloqueadoHasta = Date.now() + BLOQUEO_MS;
  intentos.set(clave, reg);
}

export function registrarExito(clave: string) {
  intentos.delete(clave);
}
