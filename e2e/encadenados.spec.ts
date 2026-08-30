import { expect, test, type Page } from '@playwright/test';
import { CREDENCIALES } from './credenciales.ts';

/**
 * Último patrón del relevamiento: hay registros que obligan a cargar otro.
 * Acá se comprueba que la obligación quede asentada y se pueda cumplir.
 */
async function entrar(page: Page, cred: { email: string; password: string }) {
  await page.goto('/');
  await page.getByLabel('Email').fill(cred.email);
  await page.getByLabel('Contraseña').fill(cred.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
}

async function firmarEnPantalla(page: Page) {
  const pad = page.locator('canvas.pad');
  const caja = (await pad.boundingBox())!;
  await page.mouse.move(caja.x + 30, caja.y + 120);
  await page.mouse.down();
  await page.mouse.move(caja.x + 120, caja.y + 80);
  await page.mouse.move(caja.x + 200, caja.y + 140);
  await page.mouse.up();
}

test.describe.configure({ mode: 'serial' });

test('un incendio con heridos exige el acaecimiento médico y queda enlazado', async ({ page }) => {
  await entrar(page, CREDENCIALES.capitan);
  await page.getByRole('link', { name: /RE-01D/ }).click();

  await page.getByLabel(/Descripción del siniestro/).fill('Incendio con un tripulante herido');
  await page.getByLabel('Hubo heridos').getByRole('button', { name: 'Sí' }).click();
  await page.getByLabel('Necesita remolque').getByRole('button', { name: 'No' }).click();
  await expect(page.getByText(/también exige cargar/)).toContainText('RO-07A');

  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  await firmarEnPantalla(page);
  await page.getByLabel('PIN personal').fill(CREDENCIALES.capitan.pin);
  await page.getByRole('dialog').getByRole('button', { name: 'Firmar', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar a tierra' }).click();

  // enviado: la obligación queda a la vista sobre el propio hecho
  await expect(page.locator('.chip', { hasText: 'En revisión' })).toBeVisible();
  await expect(page.locator('.aviso').filter({ hasText: 'exige cargar además' })).toContainText('RO-07A');

  // y se puede cumplir desde ahí mismo, enlazado
  await page.getByRole('button', { name: 'Cargar RO-07A' }).click();
  await page.getByLabel(/Síntomas/).fill('Quemadura en antebrazo');
  await page.getByLabel('Tripulante afectado').selectOption({ label: 'Marinero de cubierta' });
  await page.getByLabel('Fecha del hecho').fill('2026-08-29');
  await page.getByRole('button', { name: 'Seguir después' }).click();

  // el borrador del hijo quedó guardado y sincronizado
  await page.getByRole('button', { name: 'Mis registros' }).click();
  await expect(page.locator('a[href^="#/borrador/"]')).toContainText('RO-07A');
});

test('tierra ve lo que falta cargar, y deja de verlo cuando se carga', async ({ page }) => {
  await entrar(page, CREDENCIALES.pd);
  await page.getByRole('link', { name: 'Cumplimiento' }).click();
  // se espera a que el tablero cargue antes de afirmar que algo no está
  await expect(page.getByRole('heading', { name: 'Certificados' })).toBeVisible();

  // el hijo ya se cargó enlazado al hecho, así que no figura pendiente
  await expect(page.getByRole('heading', { name: /Registros que un hecho dejó pendientes/ })).toHaveCount(0);
});

test('la cadena se ve desde los dos lados', async ({ page }) => {
  await entrar(page, CREDENCIALES.capitan);
  await page.getByRole('button', { name: 'Mis registros' }).click();
  await page.locator('a[href^="#/registro/"]').filter({ hasText: 'RE-01D' }).first().click();

  await expect(page.getByRole('heading', { name: 'Registros relacionados' })).toBeVisible();
  await expect(page.getByText('Generó')).toBeVisible();
  await page.locator('a[href^="#/registro/"]').filter({ hasText: 'RO-07A' }).first().click();
  await expect(page.getByText('Salió de')).toBeVisible();
});
