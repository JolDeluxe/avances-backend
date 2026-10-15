-- AlterTable
ALTER TABLE `lineas_produccion` ADD COLUMN `permite_bolsas` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `permite_directos` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `permite_indirectos` BOOLEAN NOT NULL DEFAULT true;
