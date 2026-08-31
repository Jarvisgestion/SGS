import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { HttpError } from './errors.js';

/**
 * Almacén de archivos en disco.
 *
 * Guarda el formulario en papel firmado (escaneado o fotografiado), que mientras
 * PNA no habilite la firma digital es la evidencia válida del registro. Por eso
 * se calcula y se guarda el SHA-256: si más adelante hay que demostrar que el
 * archivo exhibido es el mismo que se subió a bordo, el checksum lo prueba.
 *
 * En producción esto va a un almacenamiento de objetos; la interfaz es la misma.
 */
const TIPOS_ACEPTADOS: Record<string, { ext: string; fileType: 'pdf' | 'image' }> = {
  'application/pdf': { ext: 'pdf', fileType: 'pdf' },
  'image/jpeg': { ext: 'jpg', fileType: 'image' },
  'image/png': { ext: 'png', fileType: 'image' },
  'image/heic': { ext: 'heic', fileType: 'image' },
  'image/webp': { ext: 'webp', fileType: 'image' },
};

export const tiposAceptados = Object.keys(TIPOS_ACEPTADOS);

export interface ArchivoGuardado {
  storageKey: string;
  checksum: string;
  byteSize: number;
  fileType: 'pdf' | 'image';
  mimeType: string;
}

export function validarTipo(mimeType: string): void {
  if (!TIPOS_ACEPTADOS[mimeType]) {
    throw new HttpError(415,
      `Tipo de archivo no aceptado: ${mimeType}. Se aceptan PDF y fotos (JPEG, PNG, HEIC, WebP).`);
  }
}

export async function guardar(buffer: Buffer, mimeType: string): Promise<ArchivoGuardado> {
  validarTipo(mimeType);
  if (buffer.length === 0) throw new HttpError(400, 'El archivo llegó vacío.');
  if (buffer.length > config.maxAttachmentBytes) {
    throw new HttpError(413,
      `El archivo supera el máximo de ${Math.round(config.maxAttachmentBytes / 1024 / 1024)} MB.`);
  }

  const { ext, fileType } = TIPOS_ACEPTADOS[mimeType]!;
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  // Se reparte por año y por los dos primeros caracteres del nombre para que un
  // directorio no junte decenas de miles de archivos.
  const nombre = `${crypto.randomUUID()}.${ext}`;
  const storageKey = path.join(String(new Date().getFullYear()), nombre.slice(0, 2), nombre);
  const destino = path.join(config.attachmentsDir, storageKey);

  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, buffer, { flag: 'wx' });

  return { storageKey, checksum, byteSize: buffer.length, fileType, mimeType };
}

/** Resuelve la ruta real impidiendo que un storage_key se escape del directorio. */
function rutaSegura(storageKey: string): string {
  const base = path.resolve(config.attachmentsDir);
  const destino = path.resolve(base, storageKey);
  if (destino !== base && !destino.startsWith(base + path.sep)) {
    throw new HttpError(400, 'Ruta de archivo inválida');
  }
  return destino;
}

export async function leer(storageKey: string): Promise<Buffer> {
  try {
    return await fs.readFile(rutaSegura(storageKey));
  } catch {
    throw new HttpError(404, 'El archivo ya no está disponible en el almacenamiento');
  }
}

export async function borrar(storageKey: string): Promise<void> {
  await fs.rm(rutaSegura(storageKey), { force: true });
}
