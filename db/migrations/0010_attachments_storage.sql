-- 0010_attachments_storage.sql
-- Los adjuntos pasan a guardarse fuera de la base.
--
-- Hasta acá `file_url` guardaba la referencia (y en la práctica, la imagen de
-- firma entera como data URL). Eso hace crecer la base con binarios que nunca
-- se consultan por contenido y complica los backups.
--
-- Ahora un adjunto es una de dos cosas:
--   * un archivo en el almacenamiento (storage_key), o
--   * un enlace externo (file_url), para cuando lo que se adjunta ya vive en
--     otro lado.

ALTER TABLE attachments
  ADD COLUMN storage_key  text,
  ADD COLUMN content_type text,
  ALTER COLUMN file_url DROP NOT NULL;

-- La clave es el hash del contenido: dos personas que suben el mismo archivo
-- comparten una sola copia, y el checksum deja de ser un dato declarado por
-- quien sube para pasar a ser lo que efectivamente se guardó.
CREATE INDEX attachments_storage_key_idx ON attachments (storage_key)
  WHERE storage_key IS NOT NULL;

ALTER TABLE attachments
  ADD CONSTRAINT attachments_tiene_contenido
  CHECK (num_nonnulls(file_url, storage_key) >= 1);

COMMENT ON COLUMN attachments.storage_key IS
  'Ruta en el almacenamiento de archivos. Nula si el adjunto es un enlace externo.';
COMMENT ON COLUMN attachments.checksum IS
  'sha256 del contenido guardado. Es también la base de storage_key.';
