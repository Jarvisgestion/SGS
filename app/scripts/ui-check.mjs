/**
 * Verificación de la interfaz con un navegador real, contra un servidor corriendo.
 *
 * Playwright no es dependencia del proyecto (pesa mucho para un prototipo). Para
 * correr esto:
 *   npm i --no-save playwright && npx playwright install chromium
 *   BASE_URL=http://localhost:3000 node scripts/ui-check.mjs
 * Si el navegador ya está instalado en el sistema: CHROMIUM_PATH=/ruta/al/chrome
 */
import { chromium } from 'playwright';
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

await page.goto(`${process.env.BASE_URL ?? 'http://localhost:3000'}/`, { waitUntil: 'networkidle' });

await step('pantalla de login', async () => {
  await page.getByRole('button', { name: 'Ingresar' }).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/01-login.png` });

await step('login del capitán', async () => {
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('button', { name: 'Catálogo' }).waitFor({ timeout: 8000 });
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/02-catalogo.png`, fullPage: false });

await step('el catálogo lista los procedimientos', async () => {
  const n = await page.locator('.panel h2').count();
  if (n < 10) throw new Error(`solo ${n} paneles de procedimiento`);
});

await step('abrir el formulario RE-01D', async () => {
  const fila = page.locator('tr', { hasText: 'Incendio' }).first();
  await fila.getByRole('button', { name: 'Nuevo' }).click();
  await page.getByText('Descripción del siniestro').waitFor({ timeout: 5000 });
});

await step('el formulario se arma desde field_schema', async () => {
  const checklist = await page.getByLabel('Corte suministro eléctrico').count();
  if (!checklist) throw new Error('no se renderizó el checklist de medidas preventivas');
  const bool = await page.getByText('Hubo heridos').count();
  if (!bool) throw new Error('no se renderizó el booleano de heridos');
});
await page.screenshot({ path: `${OUT}/03-formulario.png`, fullPage: true });

await step('el campo con triggers_record_type ofrece el registro enlazado', async () => {
  const label = page.locator('.field', { hasText: 'Hubo heridos' }).first();
  await label.locator('input[type=checkbox]').check();
  await page.getByText(/Crear RO-07A enlazado|crear el RO-07A enlazado/).first().waitFor({ timeout: 3000 });
  await label.locator('input[type=checkbox]').uncheck();
});

await step('cargar y enviar el registro', async () => {
  await page.locator('.field', { hasText: 'Descripción del siniestro' })
    .locator('textarea').fill('Foco ígneo en cocina, sofocado con extintor');
  await page.getByLabel('Extintores').check();
  await page.getByRole('button', { name: 'Guardar y enviar a revisión' }).click();
  await page.getByText('pendiente revision').waitFor({ timeout: 6000 });
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/04-registro.png`, fullPage: true });

await step('la vista de cumplimiento carga', async () => {
  await page.getByRole('button', { name: 'Cumplimiento' }).click();
  await page.getByText('Cumplimiento del SGS').waitFor({ timeout: 5000 });
  const vencidos = await page.locator('.badge.vencido').count();
  if (!vencidos) throw new Error('no muestra ningún vencimiento');
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/05-cumplimiento.png` });

await step('la bandeja de revisión del PD', async () => {
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.getByRole('button', { name: 'Ingresar' }).waitFor({ timeout: 4000 });
  await page.locator('input[type=email]').fill('pd@demo.local');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('button', { name: 'Catálogo' }).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Bandeja de revisión' }).click();
  await page.locator('.panel h2', { hasText: 'Bandeja de revisión' }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
  const filas = await page.locator('tbody tr').count();
  if (filas < 1) throw new Error('la bandeja está vacía');
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/06-bandeja.png` });

await browser.close();
const jsErrors = errors.filter((e) => !e.includes('FALLO'));
console.log(`\n${jsErrors.length === 0 && errors.length === 0 ? '=== UI OK, sin errores de consola ===' : '=== errores ==='}`);
for (const e of errors) console.log(` - ${e}`);
process.exit(errors.length ? 1 : 0);
