-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "buque_id" TEXT,
    "tripulante_id" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "usuario_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "usuario_tripulante_id_fkey" FOREIGN KEY ("tripulante_id") REFERENCES "tripulante" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "expira_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sesion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_bote_rescate_control" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buque_id" TEXT NOT NULL,
    "marea" TEXT,
    "singladura" TEXT,
    "fecha_hora" DATETIME NOT NULL,
    "ubicacion_posicion" TEXT,
    "observaciones" TEXT,
    "firma" TEXT,
    "confirmado_por_id" TEXT,
    "confirmado_at" DATETIME,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" DATETIME,
    "updated_at" DATETIME NOT NULL,
    "creado_por_id" TEXT,
    CONSTRAINT "bote_rescate_control_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bote_rescate_control_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "bote_rescate_control_confirmado_por_id_fkey" FOREIGN KEY ("confirmado_por_id") REFERENCES "tripulante" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_bote_rescate_control" ("buque_id", "confirmado_at", "confirmado_por_id", "created_at", "estado", "fecha_hora", "firma", "id", "marea", "observaciones", "singladura", "submitted_at", "ubicacion_posicion", "updated_at") SELECT "buque_id", "confirmado_at", "confirmado_por_id", "created_at", "estado", "fecha_hora", "firma", "id", "marea", "observaciones", "singladura", "submitted_at", "ubicacion_posicion", "updated_at" FROM "bote_rescate_control";
DROP TABLE "bote_rescate_control";
ALTER TABLE "new_bote_rescate_control" RENAME TO "bote_rescate_control";
CREATE TABLE "new_bote_rescate_control_revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "control_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comentario" TEXT,
    "revisado_por" TEXT NOT NULL,
    "revisado_por_id" TEXT,
    "revisado_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bote_rescate_control_revision_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "bote_rescate_control" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bote_rescate_control_revision_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_bote_rescate_control_revision" ("comentario", "control_id", "decision", "id", "revisado_at", "revisado_por") SELECT "comentario", "control_id", "decision", "id", "revisado_at", "revisado_por" FROM "bote_rescate_control_revision";
DROP TABLE "bote_rescate_control_revision";
ALTER TABLE "new_bote_rescate_control_revision" RENAME TO "bote_rescate_control_revision";
CREATE TABLE "new_registro_emergencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buque_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "marea" TEXT,
    "singladura" TEXT,
    "fecha" DATETIME NOT NULL,
    "hora" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "condiciones_hidrometeorologicas" TEXT,
    "se_informa_compania" BOOLEAN NOT NULL DEFAULT false,
    "se_informa_pna" BOOLEAN NOT NULL DEFAULT false,
    "hubo_heridos" BOOLEAN NOT NULL DEFAULT false,
    "necesita_remolque" BOOLEAN NOT NULL DEFAULT false,
    "firma_capitan_pd" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" DATETIME,
    "updated_at" DATETIME NOT NULL,
    "creado_por_id" TEXT,
    CONSTRAINT "registro_emergencia_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "registro_emergencia_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_registro_emergencia" ("buque_id", "condiciones_hidrometeorologicas", "created_at", "descripcion", "estado", "fecha", "firma_capitan_pd", "hora", "hubo_heridos", "id", "marea", "necesita_remolque", "se_informa_compania", "se_informa_pna", "singladura", "submitted_at", "tipo", "updated_at") SELECT "buque_id", "condiciones_hidrometeorologicas", "created_at", "descripcion", "estado", "fecha", "firma_capitan_pd", "hora", "hubo_heridos", "id", "marea", "necesita_remolque", "se_informa_compania", "se_informa_pna", "singladura", "submitted_at", "tipo", "updated_at" FROM "registro_emergencia";
DROP TABLE "registro_emergencia";
ALTER TABLE "new_registro_emergencia" RENAME TO "registro_emergencia";
CREATE TABLE "new_registro_emergencia_revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registro_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comentario" TEXT,
    "revisado_por" TEXT NOT NULL,
    "revisado_por_id" TEXT,
    "revisado_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "registro_emergencia_revision_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro_emergencia" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "registro_emergencia_revision_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_registro_emergencia_revision" ("comentario", "decision", "id", "registro_id", "revisado_at", "revisado_por") SELECT "comentario", "decision", "id", "registro_id", "revisado_at", "revisado_por" FROM "registro_emergencia_revision";
DROP TABLE "registro_emergencia_revision";
ALTER TABLE "new_registro_emergencia_revision" RENAME TO "registro_emergencia_revision";
CREATE TABLE "new_zafarrancho_ejercicio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buque_id" TEXT NOT NULL,
    "tipo_zafarrancho_id" TEXT NOT NULL,
    "marea" TEXT,
    "singladura" TEXT,
    "fecha" DATETIME NOT NULL,
    "hora" TEXT NOT NULL,
    "temas_desarrollados" TEXT NOT NULL,
    "libro_navegacion_foja" TEXT,
    "observaciones" TEXT,
    "firma_capitan" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" DATETIME,
    "updated_at" DATETIME NOT NULL,
    "creado_por_id" TEXT,
    CONSTRAINT "zafarrancho_ejercicio_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "zafarrancho_ejercicio_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "zafarrancho_ejercicio_tipo_zafarrancho_id_fkey" FOREIGN KEY ("tipo_zafarrancho_id") REFERENCES "tipo_zafarrancho" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_zafarrancho_ejercicio" ("buque_id", "created_at", "estado", "fecha", "firma_capitan", "hora", "id", "libro_navegacion_foja", "marea", "observaciones", "singladura", "submitted_at", "temas_desarrollados", "tipo_zafarrancho_id", "updated_at") SELECT "buque_id", "created_at", "estado", "fecha", "firma_capitan", "hora", "id", "libro_navegacion_foja", "marea", "observaciones", "singladura", "submitted_at", "temas_desarrollados", "tipo_zafarrancho_id", "updated_at" FROM "zafarrancho_ejercicio";
DROP TABLE "zafarrancho_ejercicio";
ALTER TABLE "new_zafarrancho_ejercicio" RENAME TO "zafarrancho_ejercicio";
CREATE TABLE "new_zafarrancho_revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ejercicio_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comentario" TEXT,
    "revisado_por" TEXT NOT NULL,
    "revisado_por_id" TEXT,
    "revisado_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zafarrancho_revision_ejercicio_id_fkey" FOREIGN KEY ("ejercicio_id") REFERENCES "zafarrancho_ejercicio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "zafarrancho_revision_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_zafarrancho_revision" ("comentario", "decision", "ejercicio_id", "id", "revisado_at", "revisado_por") SELECT "comentario", "decision", "ejercicio_id", "id", "revisado_at", "revisado_por" FROM "zafarrancho_revision";
DROP TABLE "zafarrancho_revision";
ALTER TABLE "new_zafarrancho_revision" RENAME TO "zafarrancho_revision";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_tripulante_id_key" ON "usuario"("tripulante_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_token_key" ON "sesion"("token");

-- CreateIndex
CREATE INDEX "sesion_usuario_id_idx" ON "sesion"("usuario_id");
