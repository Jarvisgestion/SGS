/**
 * Almacenamiento de archivos adjuntos (fotos, copias de mail, imágenes de
 * firma).
 *
 * La clave de cada archivo es el sha256 de su contenido: dos personas que
 * suben el mismo archivo comparten una sola copia, y el checksum que queda en
 * la base es lo que efectivamente se guardó, no lo que declaró quien subió.
 *
 * La interfaz existe para que agregar un almacenamiento de objetos (S3 y
 * compatibles) sea un archivo nuevo y no un cambio en las rutas. Hoy hay una
 * sola implementación, sobre el sistema de archivos.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

export interface ArchivoGuardado {
  storageKey: string;
  checksum: string;
  byteSize: number;
}

export interface Almacenamiento {
  guardar(contenido: Buffer, extension: string): Promise<ArchivoGuardado>;
  abrir(storageKey: string): Promise<Readable>;
  tamano(storageKey: string): Promise<number>;
  borrar(storageKey: string): Promise<void>;
}

/** Tipos aceptados, con su firma binaria para no creerle al cliente. */
const TIPOS: Record<string, { extension: string; magia?: number[]; categoria: string }> = {
  'image/png': { extension: 'png', magia: [0x89, 0x50, 0x4e, 0x47], categoria: 'image' },
  'image/jpeg': { extension: 'jpg', magia: [0xff, 0xd8, 0xff], categoria: 'image' },
  'image/webp': { extension: 'webp', magia: [0x52, 0x49, 0x46, 0x46], categoria: 'image' },
  'application/pdf': { extension: 'pdf', magia: [0x25, 0x50, 0x44, 0x46], categoria: 'pdf' },
  'message/rfc822': { extension: 'eml', categoria: 'email' },
  'text/plain': { extension: 'txt', categoria: 'other' },
};

export class TipoNoAceptado extends Error {}
export class ContenidoNoCoincide extends Error {}

export function describirTipo(contentType: string, contenido: Buffer) {
  const tipo = TIPOS[contentType];
  if (!tipo) {
    throw new TipoNoAceptado(
      `Tipo de archivo no aceptado: ${contentType}. Se aceptan ${Object.keys(TIPOS).join(', ')}`,
    );
  }
  if (tipo.magia && !tipo.magia.every((byte, i) => contenido[i] === byte)) {
    throw new ContenidoNoCoincide(`El archivo no parece ser ${contentType}`);
  }
  return tipo;
}

/**
 * Guarda en una carpeta del disco. Para un despliegue en contenedor esa
 * carpeta tiene que ser un volumen persistente: si no, los adjuntos se pierden
 * en cada despliegue (ver DEPLOY.md).
 */
export class AlmacenamientoEnDisco implements Almacenamiento {
  // Campo y asignación explícitos: Node borra los tipos, no los transforma,
  // así que las propiedades declaradas en el constructor no están disponibles.
  private readonly raiz: string;

  constructor(raiz: string) {
    this.raiz = raiz;
  }

  private rutaDe(storageKey: string) {
    const completa = path.resolve(this.raiz, storageKey);
    // La clave la genera el servidor, pero igual se verifica: una clave con
    // ".." que llegara desde la base no puede sacarnos de la carpeta.
    if (!completa.startsWith(path.resolve(this.raiz) + path.sep)) {
      throw new Error(`Clave de archivo fuera del almacenamiento: ${storageKey}`);
    }
    return completa;
  }

  async guardar(contenido: Buffer, extension: string): Promise<ArchivoGuardado> {
    const checksum = createHash('sha256').update(contenido).digest('hex');
    const storageKey = `${checksum.slice(0, 2)}/${checksum.slice(2, 4)}/${checksum}.${extension}`;
    const destino = this.rutaDe(storageKey);

    await mkdir(path.dirname(destino), { recursive: true });
    // wx: si ya existe es el mismo contenido (la clave es su hash), no se pisa.
    await writeFile(destino, contenido, { flag: 'wx' }).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'EEXIST') throw err;
    });

    return { storageKey, checksum, byteSize: contenido.byteLength };
  }

  async abrir(storageKey: string): Promise<Readable> {
    return createReadStream(this.rutaDe(storageKey));
  }

  async tamano(storageKey: string): Promise<number> {
    return (await stat(this.rutaDe(storageKey))).size;
  }

  async borrar(storageKey: string): Promise<void> {
    await rm(this.rutaDe(storageKey), { force: true });
  }
}
