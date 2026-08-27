-- AlterTable
ALTER TABLE "tripulante" ADD COLUMN "pin_hash" TEXT;

-- CreateTable
CREATE TABLE "bote_rescate_control_revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "control_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comentario" TEXT,
    "revisado_por" TEXT NOT NULL,
    "revisado_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bote_rescate_control_revision_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "bote_rescate_control" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    CONSTRAINT "bote_rescate_control_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bote_rescate_control_confirmado_por_id_fkey" FOREIGN KEY ("confirmado_por_id") REFERENCES "tripulante" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_bote_rescate_control" ("buque_id", "created_at", "estado", "fecha_hora", "firma", "id", "marea", "observaciones", "singladura", "ubicacion_posicion", "updated_at") SELECT "buque_id", "created_at", "estado", "fecha_hora", "firma", "id", "marea", "observaciones", "singladura", "ubicacion_posicion", "updated_at" FROM "bote_rescate_control";
DROP TABLE "bote_rescate_control";
ALTER TABLE "new_bote_rescate_control" RENAME TO "bote_rescate_control";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
