-- AlterTable
ALTER TABLE `historial_estados_listado` MODIFY `estado_anterior` ENUM('PENDIENTE', 'EN_PROCESO', 'SEPARADO', 'ENTREGADO_A_PRODUCCION', 'CANCELADO', 'DESCONTADO') NOT NULL,
    MODIFY `estado_nuevo` ENUM('PENDIENTE', 'EN_PROCESO', 'SEPARADO', 'ENTREGADO_A_PRODUCCION', 'CANCELADO', 'DESCONTADO') NOT NULL;

-- AlterTable
ALTER TABLE `lineas_produccion` ADD COLUMN `area` ENUM('BOTA', 'ACCESORIOS') NOT NULL DEFAULT 'BOTA';

-- AlterTable
ALTER TABLE `listados_material` MODIFY `estado` ENUM('PENDIENTE', 'EN_PROCESO', 'SEPARADO', 'ENTREGADO_A_PRODUCCION', 'CANCELADO', 'DESCONTADO') NOT NULL DEFAULT 'PENDIENTE';

-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `tipo_material_auditor` ENUM('DIRECTOS', 'INDIRECTOS', 'TODOS') NULL,
    ADD COLUMN `tipo_surtido_almacen` ENUM('DIRECTOS', 'INDIRECTOS', 'BOLSAS') NULL;

-- CreateTable
CREATE TABLE `listados_surtido_frentes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `listado_material_id` INTEGER NOT NULL,
    `tipo_frente` ENUM('DIRECTOS', 'INDIRECTOS', 'BOLSAS') NOT NULL,
    `estado` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO', 'DESCONTADO') NOT NULL DEFAULT 'PENDIENTE',
    `separado_por_id` INTEGER NULL,
    `fecha_separado` DATETIME(3) NULL,
    `entregado_por_id` INTEGER NULL,
    `fecha_entregado` DATETIME(3) NULL,
    `validado_por_id` INTEGER NULL,
    `fecha_validado` DATETIME(3) NULL,
    `descontado_por_id` INTEGER NULL,
    `fecha_descontado` DATETIME(3) NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    INDEX `listados_surtido_frentes_estado_idx`(`estado`),
    UNIQUE INDEX `listados_surtido_frentes_listado_material_id_tipo_frente_key`(`listado_material_id`, `tipo_frente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `historial_estados_frente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `listado_surtido_frente_id` INTEGER NOT NULL,
    `estado_anterior` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO', 'DESCONTADO') NOT NULL,
    `estado_nuevo` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO', 'DESCONTADO') NOT NULL,
    `cambiado_por_usuario_id` INTEGER NOT NULL,
    `fecha_cambio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `motivo` VARCHAR(500) NULL,

    INDEX `historial_estados_frente_listado_surtido_frente_id_idx`(`listado_surtido_frente_id`),
    INDEX `historial_estados_frente_cambiado_por_usuario_id_idx`(`cambiado_por_usuario_id`),
    INDEX `historial_estados_frente_fecha_cambio_idx`(`fecha_cambio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `listados_surtido_frentes` ADD CONSTRAINT `listados_surtido_frentes_listado_material_id_fkey` FOREIGN KEY (`listado_material_id`) REFERENCES `listados_material`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listados_surtido_frentes` ADD CONSTRAINT `listados_surtido_frentes_separado_por_id_fkey` FOREIGN KEY (`separado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listados_surtido_frentes` ADD CONSTRAINT `listados_surtido_frentes_entregado_por_id_fkey` FOREIGN KEY (`entregado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listados_surtido_frentes` ADD CONSTRAINT `listados_surtido_frentes_validado_por_id_fkey` FOREIGN KEY (`validado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listados_surtido_frentes` ADD CONSTRAINT `listados_surtido_frentes_descontado_por_id_fkey` FOREIGN KEY (`descontado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_estados_frente` ADD CONSTRAINT `historial_estados_frente_listado_surtido_frente_id_fkey` FOREIGN KEY (`listado_surtido_frente_id`) REFERENCES `listados_surtido_frentes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_estados_frente` ADD CONSTRAINT `historial_estados_frente_cambiado_por_usuario_id_fkey` FOREIGN KEY (`cambiado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
