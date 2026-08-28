import { expect, test, type Page } from '@playwright/test';
import { CREDENCIALES } from './credenciales.ts';

async function entrar(page: Page, cred: { email: string; password: string }) {
  await page.goto('/');
  await page.getByLabel('Email').fill(cred.email);
  await page.getByLabel('Contraseña').fill(cred.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
}

async function salir(page: Page) {
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
}

/** Dibuja un trazo cualquiera sobre el área de firma. */
async function firmarEnPantalla(page: Page) {
  const pad = page.locator('canvas.pad');
  const caja = (await pad.boundingBox())!;
  await page.mouse.move(caja.x + 30, caja.y + 120);
  await page.mouse.down();
  for (const [dx, dy] of [
    [60, -50],
    [110, 30],
    [170, -40],
    [230, 20],
  ] as const) {
    await page.mouse.move(caja.x + dx, caja.y + 120 + dy);
  }
  await page.mouse.up();
}

test.describe.configure({ mode: 'serial' });

test('el capitán carga un incendio, lo firma y lo envía; tierra lo observa y después lo aprueba', async ({
  page,
}) => {
  await entrar(page, CREDENCIALES.capitan);

  // --- catálogo: los formularios salen del manual de la empresa, no del código
  await expect(page.getByRole('heading', { name: /PE-01/ })).toBeVisible();
  await page.getByRole('link', { name: /RE-01D/ }).click();

  // --- carga
  await page.getByLabel(/Descripción del siniestro/).fill('Principio de incendio en sala de máquinas');
  await page.getByLabel('Lugar de inicio del incendio').fill('Sala de máquinas');
  await page.getByRole('button', { name: 'Cierre de ventilación: No OK' }).click();
  await page
    .getByPlaceholder('¿Qué se encontró? (queda registrado como desvío)')
    .fill('Trampilla trabada');
  await page.getByLabel('Se informa a Compañía').getByRole('button', { name: 'Sí' }).click();
  await page.getByLabel('Se informa a PNA').getByRole('button', { name: 'Sí' }).click();

  // --- el registro que dispara otro registro
  await page.getByLabel('Hubo heridos').getByRole('button', { name: 'Sí' }).click();
  await expect(page.getByText(/también exige cargar/)).toContainText('RO-07A');
  await page.getByLabel('Hubo heridos').getByRole('button', { name: 'No' }).click();
  await page.getByLabel('Necesita remolque').getByRole('button', { name: 'No' }).click();

  // --- firma: este registro exige trazo Y PIN
  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  await firmarEnPantalla(page);
  await page.getByLabel('PIN personal').fill(CREDENCIALES.capitan.pin);
  await page.getByRole('dialog').getByRole('button', { name: 'Firmar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ya firmado' })).toBeVisible();

  // --- envío
  await page.getByRole('button', { name: 'Enviar a tierra' }).click();
  await expect(page.getByText('En revisión')).toBeVisible();

  // --- tierra observa
  await salir(page);
  await entrar(page, CREDENCIALES.pd);
  await page.getByRole('link', { name: 'Para revisar' }).click();
  await page.getByRole('link', { name: /RE-01D/ }).click();
  await page.getByLabel(/Comentario/).fill('Detallá cómo se destrabó la ventilación');
  await page.getByRole('button', { name: 'Observar' }).click();
  await expect(page.getByText('Observado').first()).toBeVisible();

  // --- vuelve a bordo con la observación a la vista
  await salir(page);
  await entrar(page, CREDENCIALES.capitan);
  await page.getByRole('button', { name: 'Mis registros' }).click();
  await page.getByRole('link', { name: /RE-01D/ }).click();
  await expect(page.locator('.aviso').filter({ hasText: 'Tierra observó este registro' })).toContainText(
    'Detallá cómo se destrabó la ventilación',
  );

  await page.getByRole('button', { name: 'Corregir a bordo' }).click();
  await page.getByLabel(/Descripción del siniestro/).fill(
    'Principio de incendio en sala de máquinas. La ventilación se cerró a mano.',
  );
  await page.getByRole('button', { name: 'Enviar a tierra' }).click();
  await expect(page.getByText('En revisión')).toBeVisible();

  // --- tierra aprueba y el registro queda cerrado
  await salir(page);
  await entrar(page, CREDENCIALES.pd);
  await page.getByRole('link', { name: 'Para revisar' }).click();
  await page.getByRole('link', { name: /RE-01D/ }).click();
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.getByText('Aprobado').first()).toBeVisible();

  // el historial conserva las dos decisiones y la firma
  await expect(page.getByText('Detallá cómo se destrabó la ventilación')).toBeVisible();
  await expect(page.getByText('Firma manuscrita')).toBeVisible();
});

// Contra el build de producción: es donde el service worker está activo.
test.describe('sin señal', () => {
  test.use({ baseURL: 'http://127.0.0.1:4173' });

  test('el formulario se sigue cargando sin señal y se sube al recuperarla', async ({ page, context }) => {
  await entrar(page, CREDENCIALES.capitan);
  // Una recarga deja al service worker controlando la página; recién ahí la
  // app puede reabrirse fuera de cobertura.
  await page.reload();
  // La app baja el catálogo y los formularios apenas entra: es lo que después
  // permite abrir un registro nuevo fuera de cobertura.
  await expect(page.getByRole('link', { name: /RO-05C/ })).toBeVisible();
  await page.waitForLoadState('networkidle');

  await context.setOffline(true);
  await page.getByRole('link', { name: /RO-05C/ }).click();

  // El formulario abre sin señal, desde la copia guardada en el equipo.
  await page.getByLabel('Maniobra').selectOption('Zarpada');
  await page.getByRole('button', { name: 'Documentación del buque a bordo: OK' }).click();
  await page.getByLabel('Observaciones').fill('Cargado sin cobertura');

  // apenas hay un dato cargado, la URL apunta al borrador guardado
  await page.waitForURL(/#\/borrador\//);

  // el borrador sobrevive a cerrar y reabrir la app, todavía sin señal
  await page.reload();
  await expect(page.getByLabel('Maniobra')).toHaveValue('Zarpada');
  await expect(page.getByLabel('Observaciones')).toHaveValue('Cargado sin cobertura');

  await page.getByRole('link', { name: 'A bordo' }).click();
  await page.getByRole('button', { name: 'Mis registros' }).click();
  const chipSinSubir = page.locator('.chip', { hasText: 'Sin subir' });
  await expect(chipSinSubir).toBeVisible();

  // al recuperar señal el borrador se sube solo
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: 'Mis registros' }).click();
  await expect(page.locator('.chip', { hasText: 'Sincronizado' })).toBeVisible({ timeout: 15_000 });
  await expect(chipSinSubir).toBeHidden();
  });
});

test('el tablero muestra el cumplimiento y los desvíos', async ({ page }) => {
  await entrar(page, CREDENCIALES.pd);
  await page.getByRole('link', { name: 'Cumplimiento' }).click();

  // el zafarrancho de incendio nunca se cargó
  await expect(page.getByText('RE-01A-INC')).toBeVisible();
  await expect(page.getByText('Sin registro').first()).toBeVisible();

  // certificado vencido
  await expect(page.getByText('Certificado de Seguridad de la Navegación')).toBeVisible();
  await expect(page.getByText('vencido').first()).toBeVisible();

});
