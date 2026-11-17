-- DropIndex
DROP INDEX `vales_material_codigo_vale_idx` ON `vales_material`;

-- AlterTable
ALTER TABLE `historial_estados_vale` DROP COLUMN `observaciones`;

-- AlterTable
ALTER TABLE `vales_material` DROP COLUMN `codigo_vale`,
    DROP COLUMN `observaciones`;
