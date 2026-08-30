import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CREDENCIALES } from './credenciales.ts';

/**
 * Un inspector de PNA no mira la pantalla: pide el registro. Esta prueba genera
 * el PDF de un registro aprobado y comprueba que lleve el encabezado del
 * formulario, los datos, las firmas y el historial de revisión.
 */
async function entrar(page: Page, cred: { email: string; password: string }) {
  await page.goto('/');
  await page.getByLabel('Email').fill(cred.email);
  await page.getByLabel('Contraseña').fill(cred.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
}

test('un registro aprobado se puede imprimir como el formulario del manual', async ({ page }) => {
  // se carga y aprueba un registro, para imprimir uno cerrado de verdad
  await entrar(page, CREDENCIALES.capitan);
  await page.getByRole('link', { name: /RO-05C/ }).click();
  await page.getByLabel('Maniobra').selectOption('Zarpada');
  await page.getByRole('button', { name: 'Documentación del buque a bordo: OK' }).click();
  await page.getByLabel('Observaciones').fill('Sin novedades');
  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  await page.getByLabel('PIN personal').fill(CREDENCIALES.capitan.pin);
  await page.getByRole('dialog').getByRole('button', { name: 'Firmar', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar a tierra' }).click();
  await expect(page.locator('.chip', { hasText: 'En revisión' })).toBeVisible();
  const url = page.url();

  await page.getByRole('button', { name: 'Salir' }).click();
  await entrar(page, CREDENCIALES.pd);
  await page.goto(url);
  await page.getByLabel(/Comentario/).fill('Conforme');
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.locator('.chip', { hasText: 'Aprobado' }).first()).toBeVisible();

  // el encabezado del formulario: empresa, norma, revisión, buque, matrícula
  const encabezado = page.locator('.encabezado-registro');
  await expect(encabezado).toContainText('Pesquera Chiarmar');
  await expect(encabezado).toContainText('Ord. PNA 05/18');
  // La revisión concreta depende de qué manual esté vigente al correr: lo que
  // importa es que el registro impreso diga bajo cuál se cargó.
  await expect(encabezado).toContainText(/Rev\. \d+/);
  await expect(encabezado).toContainText('Huafeng 827');
  await expect(encabezado).toContainText('M-0827');
  await expect(encabezado).toContainText('RO-05C');

  // así se ve al imprimir: sin la navegación ni los botones de la aplicación
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.app-header')).toBeHidden();
  await expect(page.locator('nav.nav')).toBeHidden();
  await expect(encabezado).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Firmas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historial de revisión' })).toBeVisible();

  await page.screenshot({ path: 'capturas/08-impresion.png', fullPage: true });
  await page.pdf({ path: 'capturas/registro-aprobado.pdf', format: 'A4', printBackground: true });

  const pdf = readFileSync('capturas/registro-aprobado.pdf');
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.byteLength).toBeGreaterThan(5000);
});
