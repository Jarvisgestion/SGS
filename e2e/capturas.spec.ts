import { expect, test, type Page } from '@playwright/test';
import { CREDENCIALES } from './credenciales.ts';

/**
 * No verifica nada: produce las capturas de e2e/capturas/ para mostrar la app.
 * Se apoya en los datos que dejó ciclo.spec.ts (corre después, por orden
 * alfabético del nombre de archivo... por eso se llama así).
 */
async function entrar(page: Page, cred: { email: string; password: string }) {
  await page.goto('/');
  await page.getByLabel('Email').fill(cred.email);
  await page.getByLabel('Contraseña').fill(cred.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
}

test.use({ viewport: { width: 900, height: 1200 } });

test('capturas de la app', async ({ page }) => {
  await entrar(page, CREDENCIALES.capitan);
  await page.screenshot({ path: 'capturas/01-catalogo.png', fullPage: true });

  await page.getByRole('link', { name: /RE-01D/ }).click();
  await page.getByLabel(/Descripción del siniestro/).fill('Principio de incendio en sala de máquinas');
  await page.getByRole('button', { name: 'Cierre de ventilación: No OK' }).click();
  await page
    .getByPlaceholder('¿Qué se encontró? (queda registrado como desvío)')
    .fill('Trampilla trabada');
  await page.screenshot({ path: 'capturas/02-formulario.png', fullPage: true });

  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  const pad = page.locator('canvas.pad');
  const caja = (await pad.boundingBox())!;
  await page.mouse.move(caja.x + 40, caja.y + 120);
  await page.mouse.down();
  for (const [dx, dy] of [[80, -45], [140, 25], [210, -35], [280, 15]] as const) {
    await page.mouse.move(caja.x + dx, caja.y + 120 + dy);
  }
  await page.mouse.up();
  await page.getByLabel('PIN personal').fill(CREDENCIALES.capitan.pin);
  await page.screenshot({ path: 'capturas/03-firma.png' });
  await page.getByRole('button', { name: 'Cancelar' }).click();

  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Descartar' }).click();

  await page.getByRole('button', { name: 'Salir' }).click();
  await entrar(page, CREDENCIALES.pd);
  await page.getByRole('link', { name: 'Cumplimiento' }).click();
  await page.screenshot({ path: 'capturas/04-tablero.png', fullPage: true });

  await page.goto('/#/');
  await page.getByRole('link', { name: 'Para revisar' }).click();
  await page.screenshot({ path: 'capturas/05-bandeja.png', fullPage: true });

  // el ABM del catálogo: la empresa edita su propio manual
  await page.getByRole('link', { name: 'Catálogo' }).click();
  await page.screenshot({ path: 'capturas/06-catalogo.png', fullPage: true });

  await page.getByRole('link', { name: /RO-05C/ }).click();
  await expect(page.getByRole('heading', { name: /Editar RO-05C/ })).toBeVisible();
  await page.screenshot({ path: 'capturas/07-editor.png', fullPage: true });
});
