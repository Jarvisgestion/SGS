/** Mismos datos que crea e2e/setup.ts. Se declaran aparte para que el spec no
 *  arrastre pg ni el resto del setup al proceso de Playwright. */
export const CREDENCIALES = {
  capitan: { email: 'capitan@e2e.test', password: 'clave-de-prueba-123', pin: '4821' },
  pd: { email: 'pd@e2e.test', password: 'clave-de-prueba-123', pin: '9134' },
};
