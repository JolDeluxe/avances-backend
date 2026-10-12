-- AlterTable
ALTER TABLE `lineas_produccion` ADD COLUMN `orden` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `lineas_produccion_departamento_id_area_orden_idx` ON `lineas_produccion`(`departamento_id`, `area`, `orden`);
