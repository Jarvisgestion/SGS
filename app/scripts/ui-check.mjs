/**
 * Verificación de la interfaz con un navegador real, contra un servidor corriendo.
 *
 * Recorre el circuito del piloto: el capitán carga un zafarrancho (RE-01A), lo
 * envía, adjunta el PDF del formulario firmado a mano y lo imprime; el PD lo
 * aprueba desde tierra.
 *
 * Playwright no es dependencia del proyecto (pesa mucho para un prototipo):
 *   npm i --no-save playwright && npx playwright install chromium
 *   BASE_URL=http://localhost:3000 node scripts/ui-check.mjs
 * Si el navegador ya está instalado en el sistema: CHROMIUM_PATH=/ruta/al/chrome
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.';
const errors = [];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const step = async (name, fn) => {
  try { await fn(); console.log(`  ok  ${name}`); }
  catch (e) { console.log(`  FALLO  ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};

const entrar = async (email) => {
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill('demo1234');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('button', { name: 'Catálogo' }).waitFor({ timeout: 8000 });
};

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
  'trailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

await step('pantalla de login', async () => {
  await page.getByRole('button', { name: 'Ingresar' }).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/01-login.png` });

await step('login del capitán', () => entrar('capitan@demo.local'));
await page.waitForTimeout(600);

await step('el catálogo está acotado al piloto', async () => {
  await page.getByText(/solo está habilitada la carga de PE-01/).waitFor({ timeout: 5000 });
  const filas = await page.locator('tbody tr').count();
  if (filas !== 7) throw new Error(`se ofrecen ${filas} registros y deberían ser los 7 de PE-01`);
});
await page.screenshot({ path: `${OUT}/02-catalogo.png` });

await step('el catálogo distingue qué registro exige PDF firmado', async () => {
  const zafa = page.locator('tr', { hasText: 'Ejercicio de Zafarrancho' }).first();
  if (!/PDF firmado obligatorio/.test(await zafa.innerText())) {
    throw new Error('RE-01A no aparece marcado como registro con PDF obligatorio');
  }
  const incendio = page.locator('tr', { hasText: 'Incendio' }).first();
  if (!/se completa e imprime/.test(await incendio.innerText())) {
    throw new Error('RE-01D debería figurar como "se completa e imprime"');
  }
});

await step('cargar y enviar el zafarrancho', async () => {
  await page.locator('tr', { hasText: 'Ejercicio de Zafarrancho' }).first()
    .getByRole('button', { name: 'Nuevo' }).click();
  await page.getByText('Tema tratado').waitFor({ timeout: 5000 });
  await page.locator('.field', { hasText: 'Tipo de ejercicio' }).locator('select')
    .selectOption('Abandono');
  await page.locator('.field', { hasText: 'Tema tratado' }).locator('textarea')
    .fill('Zafarrancho de abandono, arriado de balsa de babor');
  const asistentes = page.locator('.field', { hasText: 'Asistentes' }).locator('table');
  await asistentes.locator('tbody tr').first().locator('td').nth(0).locator('input').fill('Luis Ocampo');
  await asistentes.locator('tbody tr').first().locator('td').nth(1).locator('input').fill('20333444');
  await asistentes.locator('tbody tr').first().locator('td').nth(2).locator('input').fill('Capitán');
  await page.getByRole('button', { name: 'Guardar y enviar a revisión' }).click();
  await page.getByText('pendiente revision').waitFor({ timeout: 6000 });
});
await page.waitForTimeout(500);

await step('el registro avisa que falta el formulario firmado', async () => {
  await page.getByText(/Falta adjuntar el formulario firmado/).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/03-falta-respaldo.png`, fullPage: true });

await step('adjuntar el PDF del formulario firmado', async () => {
  await page.locator('input[type=file]').setInputFiles({
    name: 'RE-01A firmado.pdf', mimeType: 'application/pdf', buffer: PDF,
  });
  await page.getByText(/Respaldo en papel adjunto/).waitFor({ timeout: 8000 });
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/04-con-respaldo.png`, fullPage: true });

await step('el formulario se puede imprimir', async () => {
  await page.getByRole('button', { name: 'Imprimir formulario' }).click();
  await page.locator('.hoja').waitFor({ timeout: 5000 });
  const hoja = await page.locator('.hoja').innerText();
  for (const esperado of ['SISTEMA DE GESTIÓN DE SEGURIDAD', 'PE-01', 'RE-01A',
                          'Zafarrancho de abandono', 'Luis Ocampo']) {
    if (!hoja.includes(esperado)) throw new Error(`el impreso no incluye "${esperado}"`);
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/05-impresion.png`, fullPage: true });

await step('el PD lo aprueba desde tierra', async () => {
  await page.getByRole('button', { name: '← Volver al registro' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.getByRole('button', { name: 'Ingresar' }).waitFor({ timeout: 4000 });
  await entrar('pd@demo.local');
  await page.getByRole('button', { name: 'Bandeja de revisión' }).click();
  await page.locator('.panel h2', { hasText: 'Bandeja de revisión' }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);
  await page.locator('tr', { hasText: 'RE-01A' }).first().click();
  const aprobar = page.getByRole('button', { name: 'Aprobar' });
  await aprobar.waitFor({ timeout: 6000 });
  if (await aprobar.isDisabled()) throw new Error('el botón Aprobar quedó deshabilitado con el respaldo cargado');
  await aprobar.click();
  await page.getByText(/Registro aprobado/).waitFor({ timeout: 6000 });
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/06-aprobado.png`, fullPage: true });

await step('la vista de cumplimiento carga y está acotada al piloto', async () => {
  await page.getByRole('button', { name: 'Cumplimiento' }).click();
  await page.locator('.panel h2', { hasText: 'Cumplimiento del SGS' }).waitFor({ timeout: 5000 });
  const filas = await page.locator('tbody tr').count();
  if (filas === 0) throw new Error('el reporte de cumplimiento está vacío');
  const texto = await page.locator('tbody').innerText();
  if (!/RE-01A/.test(texto)) throw new Error('el zafarrancho no figura en cumplimiento');
});
await page.screenshot({ path: `${OUT}/07-cumplimiento.png` });

await browser.close();
console.log(`\n${errors.length === 0 ? '=== UI OK, sin errores de consola ===' : '=== errores ==='}`);
for (const e of errors) console.log(` - ${e}`);
process.exit(errors.length ? 1 : 0);
