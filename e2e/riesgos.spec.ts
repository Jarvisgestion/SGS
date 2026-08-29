import { expect, test, type Page } from '@playwright/test';
import { CREDENCIALES } from './credenciales.ts';

/**
 * La matriz de riesgo existe en el manual (PO-08) y otros registros la citan.
 * Acá se comprueba que esa cita sea un enlace de verdad y no un texto suelto.
 */
async function entrar(page: Page, cred: { email: string; password: string }) {
  await page.goto('/');
  await page.getByLabel('Email').fill(cred.email);
  await page.getByLabel('Contraseña').fill(cred.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('un acaecimiento cita un cuadro de la matriz y al tripulante afectado', async ({ page }) => {
  await entrar(page, CREDENCIALES.capitan);
  await page.getByRole('link', { name: /RO-07A/ }).click();

  // el tripulante sale de la tripulación embarcada, no se escribe a mano
  await page.getByLabel('Tripulante afectado').selectOption({ label: 'Marinero de cubierta' });
  await page.getByLabel('Fecha del hecho').fill('2026-08-29');
  await page.getByLabel(/Síntomas/).fill('Quemadura en antebrazo con tubo de escape');

  // el cuadro sale de la matriz, y al elegirlo se ve el nivel y las medidas
  const matriz = page.getByLabel(/Cuadro de la matriz de riesgo/);
  await matriz.selectOption(
    await matriz.locator('option', { hasText: 'Cuadro N° 7' }).getAttribute('value'),
  );
  await expect(page.getByText('Riesgo alto')).toBeVisible();
  await expect(page.getByText(/Medidas de control:.*Aislación térmica/)).toBeVisible();

  await page.getByRole('button', { name: 'Seguir después' }).click();
  await expect(page.getByRole('button', { name: 'Cargar registro' })).toBeVisible();
});

test('el Responsable de Seguridad e Higiene mantiene la matriz y nada más', async ({ page }) => {
  await entrar(page, CREDENCIALES.sh);
  await page.getByRole('link', { name: 'Catálogo' }).click();

  // sólo ve su solapa: no administra el manual ni la flota
  await expect(page.getByRole('button', { name: 'Matriz de riesgo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Formularios' })).toHaveCount(0);

  await page.getByLabel('Número de cuadro').fill('Cuadro N° 21');
  await page.getByLabel('Puesto de trabajo').fill('Cubierta');
  await page.getByLabel('Fuente generadora del riesgo').fill('Golpes por movimiento de la carga');
  await page.getByLabel('Probabilidad (1 a 3)').selectOption('3');
  await page.getByLabel('Consecuencia (1 a 3)').selectOption('3');
  await page.getByLabel('Medidas de control').fill('Trincado de la carga y prohibición de circular bajo cargas suspendidas');
  await page.getByRole('button', { name: 'Agregar cuadro' }).click();

  await expect(page.getByText('Cuadro N° 21')).toBeVisible();

  // y el cuadro nuevo ya está disponible para citarlo desde un registro
  await page.getByRole('button', { name: 'Salir' }).click();
  await entrar(page, CREDENCIALES.capitan);
  await page.getByRole('link', { name: /RO-07A/ }).click();
  await expect(
    page.getByLabel(/Cuadro de la matriz de riesgo/).getByRole('option', { name: /Cuadro N° 21/ }),
  ).toHaveCount(1);
});
