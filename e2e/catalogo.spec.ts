import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CREDENCIALES } from './credenciales.ts';

/**
 * La tesis del proyecto: una empresa define su propio formulario desde la
 * plataforma y queda disponible a bordo, sin cambiar una línea de código.
 */
async function entrar(page: Page, cred: { email: string; password: string }) {
  await page.goto('/');
  await page.getByLabel('Email').fill(cred.email);
  await page.getByLabel('Contraseña').fill(cred.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('la Persona Designada crea un formulario nuevo y el capitán lo carga', async ({ page }) => {
  await entrar(page, CREDENCIALES.pd);

  // --- procedimiento nuevo en la revisión vigente
  await page.getByRole('link', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: 'Manual' }).click();
  await page.getByLabel('Código').fill('PO-11');
  await page.getByLabel('Nombre').fill('Gestión de residuos');
  await page.getByRole('button', { name: 'Agregar procedimiento' }).click();
  await expect(page.getByText('PO-11')).toBeVisible();

  // --- formulario nuevo dentro de ese procedimiento
  await page.getByRole('button', { name: 'Formularios' }).click();
  await page.getByRole('button', { name: 'Agregar formulario a PO-11' }).click();

  await page.getByLabel('Código').fill('RO-11A');
  await page.getByLabel('Nombre').fill('Entrega de residuos en puerto');
  await page.getByLabel('Naturaleza').selectOption('scheduled_checklist');
  await page.getByLabel('Cómo se firma').selectOption('pin');
  await page.getByRole('group', { name: 'Quién puede emitirlo' }).getByRole('button', { name: 'Capitán', exact: true }).click();
  await page.getByRole('group', { name: 'Quién puede revisarlo' }).getByRole('button', { name: 'Persona Designada (PD)' }).click();

  // campo 1: texto obligatorio
  await page.getByRole('button', { name: 'Agregar campo' }).click();
  await page.getByLabel('Etiqueta').nth(0).fill('Puerto de entrega');
  await page.getByLabel('Clave interna').nth(0).fill('puerto');
  await page.getByRole('group', { name: '¿Es obligatorio?' }).nth(0).getByRole('button', { name: 'Sí' }).click();

  // campo 2: lista desplegable con opciones
  await page.getByRole('button', { name: 'Agregar campo' }).click();
  await page.getByLabel('Etiqueta').nth(1).fill('Tipo de residuo');
  await page.getByLabel('Tipo').nth(1).selectOption('select');
  await page.getByLabel('Clave interna').nth(1).fill('tipo_residuo');
  await page.getByLabel('Opciones (una por línea)').fill('Oleoso\nPlástico\nOrgánico');

  // campo 3: bloque de firma
  await page.getByRole('button', { name: 'Agregar campo' }).click();
  await page.getByLabel('Etiqueta').nth(2).fill('Firma del Capitán');
  await page.getByLabel('Tipo').nth(2).selectOption('signature_block');
  await page.getByLabel('Clave interna').nth(2).fill('firma_capitan');
  await page.getByLabel('Quién firma acá').selectOption('capitan');

  // la vista previa muestra el formulario tal como lo va a ver la tripulación
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible();
  await expect(page.getByLabel('Tipo de residuo')).toHaveValue('');

  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Editar RO-11A' })).toBeVisible();

  // --- a bordo ya está disponible, sin tocar código
  await page.getByRole('button', { name: 'Salir' }).click();
  await entrar(page, CREDENCIALES.capitan);
  await page.getByRole('heading', { name: /PO-11/ }).scrollIntoViewIfNeeded();
  await page.getByRole('link', { name: /RO-11A/ }).click();

  await page.getByLabel('Puerto de entrega').fill('Mar del Plata');
  await page.getByLabel('Tipo de residuo').selectOption('Oleoso');

  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  await page.getByLabel('PIN personal').fill(CREDENCIALES.capitan.pin);
  await page.getByRole('dialog').getByRole('button', { name: 'Firmar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ya firmado' })).toBeVisible();

  await page.getByRole('button', { name: 'Enviar a tierra' }).click();
  await expect(page.getByText('En revisión')).toBeVisible();
});

test('editar el formulario sube la versión y no toca lo ya cargado', async ({ page }) => {
  await entrar(page, CREDENCIALES.pd);
  await page.getByRole('link', { name: 'Catálogo' }).click();
  await page.getByRole('link', { name: /RO-11A/ }).click();

  await page.getByRole('button', { name: 'Agregar campo' }).click();
  await page.getByLabel('Etiqueta').last().fill('N° de certificado de recepción');
  await page.getByLabel('Clave interna').last().fill('certificado');
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.locator('.aviso')).toContainText('versión 2');

  // el registro que ya se cargó conserva el formulario con el que se completó
  await page.getByRole('link', { name: 'Para revisar' }).click();
  await page.getByRole('link', { name: /RO-11A/ }).click();
  await expect(page.getByLabel('Puerto de entrega')).toHaveValue('Mar del Plata');
  await expect(page.getByLabel('N° de certificado de recepción')).toHaveCount(0);
});

test('la revisión siguiente se arma copiando la anterior', async ({ page }) => {
  await entrar(page, CREDENCIALES.pd);
  await page.getByRole('link', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: 'Manual' }).click();

  await page.getByLabel('Número de revisión').fill('Rev. 05');
  await page.getByLabel('Partir de').selectOption({ label: 'Copiar Rev. 04' });
  await page.getByRole('button', { name: 'Crear revisión' }).click();

  await expect(page.locator('.aviso')).toContainText('formularios copiados');
  await expect(page.locator('li').filter({ hasText: 'Rev. 05' })).toContainText('borrador');

  // sigue en borrador: a bordo se ve todavía la Rev. 04
  await page.getByRole('button', { name: 'Salir' }).click();
  await entrar(page, CREDENCIALES.capitan);
  await expect(page.getByRole('link', { name: /RE-01D/ })).toBeVisible();

  // al ponerla en vigencia, el buque pasa a la nueva sin ver duplicados
  await page.getByRole('button', { name: 'Salir' }).click();
  await entrar(page, CREDENCIALES.pd);
  await page.getByRole('link', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: 'Manual' }).click();
  await page
    .locator('li')
    .filter({ hasText: 'Rev. 05' })
    .getByRole('button', { name: 'Poner en vigencia' })
    .click();

  await page.getByRole('button', { name: 'Salir' }).click();
  await entrar(page, CREDENCIALES.capitan);
  await expect(page.getByRole('link', { name: /RE-01D/ })).toHaveCount(1);
});

test('el catálogo se baja como archivo y se vuelve a cargar', async ({ page }) => {
  await entrar(page, CREDENCIALES.pd);
  await page.getByRole('link', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: 'Manual' }).click();

  // se baja el catálogo vigente
  const descarga = page.waitForEvent('download');
  await page
    .locator('li')
    .filter({ hasText: 'vigente' })
    .getByRole('button', { name: 'Exportar' })
    .click();
  const archivo = await descarga;
  const ruta = await archivo.path();

  const catalogo = JSON.parse(readFileSync(ruta, 'utf8'));
  expect(catalogo.formato).toBe('sgs.catalogo/1');
  expect(catalogo.procedures.length).toBeGreaterThan(0);

  // y se vuelve a cargar como una revisión nueva
  await page.getByLabel('Número de revisión').fill('Rev. 10');
  await page.getByLabel('Catálogo exportado (.json)').setInputFiles(ruta);

  await expect(page.locator('.aviso')).toContainText('formularios');
  await expect(page.locator('li').filter({ hasText: 'Rev. 10' })).toContainText('borrador');
});
