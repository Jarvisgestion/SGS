-- CreateTable
CREATE TABLE "buque" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "eslora_metros" REAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'en_construccion',
    "fecha_alta" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tripulante" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buque_id" TEXT NOT NULL,
    "apellido_nombre" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tripulante_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "procedimiento_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buque_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "fecha_vigencia" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "procedimiento_config_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tipo_zafarrancho" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buque_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "periodicidad_dias" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tipo_zafarrancho_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "checklist_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buque_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "cantidad_esperada" INTEGER,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "checklist_config_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "zafarrancho_ejercicio" (
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
    CONSTRAINT "zafarrancho_ejercicio_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "zafarrancho_ejercicio_tipo_zafarrancho_id_fkey" FOREIGN KEY ("tipo_zafarrancho_id") REFERENCES "tipo_zafarrancho" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "zafarrancho_participante" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ejercicio_id" TEXT NOT NULL,
    "tripulante_id" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "firma" TEXT,
    CONSTRAINT "zafarrancho_participante_ejercicio_id_fkey" FOREIGN KEY ("ejercicio_id") REFERENCES "zafarrancho_ejercicio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "zafarrancho_participante_tripulante_id_fkey" FOREIGN KEY ("tripulante_id") REFERENCES "tripulante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "zafarrancho_revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ejercicio_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comentario" TEXT,
    "revisado_por" TEXT NOT NULL,
    "revisado_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zafarrancho_revision_ejercicio_id_fkey" FOREIGN KEY ("ejercicio_id") REFERENCES "zafarrancho_ejercicio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "registro_emergencia" (
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
    CONSTRAINT "registro_emergencia_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ext_sin_gobierno" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registro_id" TEXT NOT NULL,
    "buque_remolque" TEXT,
    "matricula_remolque" TEXT,
    "hora_inicio" TEXT,
    "duracion_estimada" TEXT,
    "fecha_ultimo_control_anexo_ab" DATETIME,
    CONSTRAINT "ext_sin_gobierno_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro_emergencia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ext_colision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registro_id" TEXT NOT NULL,
    "lugar" TEXT,
    "detalle_danos" TEXT,
    "verif_incendio" BOOLEAN NOT NULL DEFAULT false,
    "verif_derrame" BOOLEAN NOT NULL DEFAULT false,
    "estado_estanqueidad_tanques" TEXT,
    CONSTRAINT "ext_colision_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro_emergencia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ext_incendio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registro_id" TEXT NOT NULL,
    "lugar_inicio" TEXT,
    "corte_suministro" BOOLEAN NOT NULL DEFAULT false,
    "cierre_ventilacion" BOOLEAN NOT NULL DEFAULT false,
    "puertas_cortafuego" BOOLEAN NOT NULL DEFAULT false,
    "puertas_estancas" BOOLEAN NOT NULL DEFAULT false,
    "cumple_rol_incendio" BOOLEAN NOT NULL DEFAULT false,
    "uso_era" BOOLEAN NOT NULL DEFAULT false,
    "uso_mangueras" BOOLEAN NOT NULL DEFAULT false,
    "uso_extintores" BOOLEAN NOT NULL DEFAULT false,
    "uso_co2" BOOLEAN NOT NULL DEFAULT false,
    "uso_traje_bombero" BOOLEAN NOT NULL DEFAULT false,
    "verif_perdida_gobierno" BOOLEAN NOT NULL DEFAULT false,
    "verif_derrame" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ext_incendio_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro_emergencia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ext_varadura" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registro_id" TEXT NOT NULL,
    "lugar" TEXT,
    "detalle_danos" TEXT,
    "danos_solucionables_abordo" BOOLEAN NOT NULL DEFAULT false,
    "detalle_solucion" TEXT,
    CONSTRAINT "ext_varadura_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro_emergencia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ext_remolque" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registro_id" TEXT NOT NULL,
    "posicion_geografica" TEXT,
    "buque_remolque" TEXT,
    "matricula_remolque" TEXT,
    "hora_inicio" TEXT,
    "duracion_estimada" TEXT,
    "verificaciones_antes_durante_despues" TEXT,
    CONSTRAINT "ext_remolque_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro_emergencia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "registro_emergencia_revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registro_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comentario" TEXT,
    "revisado_por" TEXT NOT NULL,
    "revisado_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "registro_emergencia_revision_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro_emergencia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bote_rescate_control" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buque_id" TEXT NOT NULL,
    "marea" TEXT,
    "singladura" TEXT,
    "fecha_hora" DATETIME NOT NULL,
    "ubicacion_posicion" TEXT,
    "observaciones" TEXT,
    "firma" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "bote_rescate_control_buque_id_fkey" FOREIGN KEY ("buque_id") REFERENCES "buque" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "checklist_registro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checklist_config_id" TEXT NOT NULL,
    "registro_padre_tipo" TEXT NOT NULL,
    "registro_padre_id" TEXT NOT NULL,
    "bote_rescate_control_id" TEXT,
    "fecha" DATETIME NOT NULL,
    "estado" TEXT NOT NULL,
    "observacion" TEXT,
    "firma" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "checklist_registro_checklist_config_id_fkey" FOREIGN KEY ("checklist_config_id") REFERENCES "checklist_config" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "checklist_registro_bote_rescate_control_id_fkey" FOREIGN KEY ("bote_rescate_control_id") REFERENCES "bote_rescate_control" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "buque_matricula_key" ON "buque"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "tripulante_buque_id_dni_key" ON "tripulante"("buque_id", "dni");

-- CreateIndex
CREATE UNIQUE INDEX "procedimiento_config_buque_id_codigo_revision_key" ON "procedimiento_config"("buque_id", "codigo", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_zafarrancho_buque_id_codigo_key" ON "tipo_zafarrancho"("buque_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_config_buque_id_tipo_item_key" ON "checklist_config"("buque_id", "tipo", "item");

-- CreateIndex
CREATE UNIQUE INDEX "ext_sin_gobierno_registro_id_key" ON "ext_sin_gobierno"("registro_id");

-- CreateIndex
CREATE UNIQUE INDEX "ext_colision_registro_id_key" ON "ext_colision"("registro_id");

-- CreateIndex
CREATE UNIQUE INDEX "ext_incendio_registro_id_key" ON "ext_incendio"("registro_id");

-- CreateIndex
CREATE UNIQUE INDEX "ext_varadura_registro_id_key" ON "ext_varadura"("registro_id");

-- CreateIndex
CREATE UNIQUE INDEX "ext_remolque_registro_id_key" ON "ext_remolque"("registro_id");
