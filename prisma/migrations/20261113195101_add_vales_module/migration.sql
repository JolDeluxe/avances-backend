-- CreateTable
CREATE TABLE `series_vale` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `departamento_id` INTEGER NOT NULL,
    `codigo` VARCHAR(20) NOT NULL,
    `es_sistema` BOOLEAN NOT NULL DEFAULT false,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `creado_por_id` INTEGER NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    INDEX `series_vale_departamento_id_estado_idx`(`departamento_id`, `estado`),
    UNIQUE INDEX `series_vale_departamento_id_codigo_key`(`departamento_id`, `codigo`),
    UNIQUE INDEX `series_vale_id_departamento_id_key`(`id`, `departamento_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departamentos_vale` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `departamento_id` INTEGER NOT NULL,
    `codigo` VARCHAR(60) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `area_fija` ENUM('BOTA', 'ACCESORIOS', 'OTRO') NULL,
    `requiere_seleccion_area` BOOLEAN NOT NULL DEFAULT false,
    `es_sistema` BOOLEAN NOT NULL DEFAULT false,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `creado_por_id` INTEGER NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    INDEX `departamentos_vale_departamento_id_estado_idx`(`departamento_id`, `estado`),
    INDEX `departamentos_vale_area_fija_idx`(`area_fija`),
    UNIQUE INDEX `departamentos_vale_departamento_id_codigo_key`(`departamento_id`, `codigo`),
    UNIQUE INDEX `departamentos_vale_id_departamento_id_key`(`id`, `departamento_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vales_material` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `departamento_id` INTEGER NOT NULL,
    `serie_id` INTEGER NOT NULL,
    `departamento_vale_id` INTEGER NOT NULL,
    `folio` VARCHAR(30) NOT NULL,
    `codigo_vale` VARCHAR(60) NOT NULL,
    `area` ENUM('BOTA', 'ACCESORIOS', 'OTRO') NOT NULL,
    `fecha_solicitud` DATETIME(3) NOT NULL,
    `tiene_hora_solicitud` BOOLEAN NOT NULL DEFAULT false,
    `estado` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO', 'DESCONTADO', 'CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
    `observaciones` TEXT NULL,
    `creado_por_id` INTEGER NOT NULL,
    `separado_por_id` INTEGER NULL,
    `fecha_separado` DATETIME(3) NULL,
    `entregado_por_id` INTEGER NULL,
    `fecha_entregado` DATETIME(3) NULL,
    `descontado_por_id` INTEGER NULL,
    `fecha_descontado` DATETIME(3) NULL,
    `revertido_por_id` INTEGER NULL,
    `fecha_revertido` DATETIME(3) NULL,
    `motivo_reversion` VARCHAR(500) NULL,
    `cancelado_por_id` INTEGER NULL,
    `fecha_cancelacion` DATETIME(3) NULL,
    `motivo_cancelacion` VARCHAR(500) NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    INDEX `idx_vales_depto_estado_area`(`departamento_id`, `estado`, `area`),
    INDEX `idx_vales_depto_deptovale_estado`(`departamento_id`, `departamento_vale_id`, `estado`),
    INDEX `idx_vales_depto_serie_folio`(`departamento_id`, `serie_id`, `folio`),
    INDEX `vales_material_codigo_vale_idx`(`codigo_vale`),
    INDEX `vales_material_folio_idx`(`folio`),
    INDEX `vales_material_fecha_solicitud_idx`(`fecha_solicitud`),
    INDEX `vales_material_creado_por_id_idx`(`creado_por_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `historial_estados_vale` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vale_id` INTEGER NOT NULL,
    `accion` ENUM('CREACION', 'EDICION', 'SEPARACION', 'ENTREGA', 'SEPARACION_Y_ENTREGA', 'DESCUENTO', 'RETROCESO', 'CANCELACION') NOT NULL,
    `estado_anterior` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO', 'DESCONTADO', 'CANCELADO') NULL,
    `estado_nuevo` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO', 'DESCONTADO', 'CANCELADO') NOT NULL,
    `usuario_id` INTEGER NOT NULL,
    `motivo` VARCHAR(500) NULL,
    `observaciones` TEXT NULL,
    `cambios` JSON NULL,
    `fecha_cambio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_historial_vale_fecha`(`vale_id`, `fecha_cambio`),
    INDEX `historial_estados_vale_usuario_id_idx`(`usuario_id`),
    INDEX `historial_estados_vale_fecha_cambio_idx`(`fecha_cambio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios_autorizaciones_vale_area` (
    `usuario_id` INTEGER NOT NULL,
    `area` ENUM('BOTA', 'ACCESORIOS', 'OTRO') NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    INDEX `usuarios_autorizaciones_vale_area_estado_idx`(`estado`),
    PRIMARY KEY (`usuario_id`, `area`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios_autorizaciones_vale_departamento` (
    `usuario_id` INTEGER NOT NULL,
    `departamento_vale_id` INTEGER NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    INDEX `usuarios_autorizaciones_vale_departamento_departamento_vale__idx`(`departamento_vale_id`),
    INDEX `usuarios_autorizaciones_vale_departamento_estado_idx`(`estado`),
    PRIMARY KEY (`usuario_id`, `departamento_vale_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `series_vale` ADD CONSTRAINT `series_vale_departamento_id_fkey` FOREIGN KEY (`departamento_id`) REFERENCES `departamentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departamentos_vale` ADD CONSTRAINT `departamentos_vale_departamento_id_fkey` FOREIGN KEY (`departamento_id`) REFERENCES `departamentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vales_material` ADD CONSTRAINT `vales_material_departamento_id_fkey` FOREIGN KEY (`departamento_id`) REFERENCES `departamentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vales_material` ADD CONSTRAINT `vales_material_serie_id_departamento_id_fkey` FOREIGN KEY (`serie_id`, `departamento_id`) REFERENCES `series_vale`(`id`, `departamento_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vales_material` ADD CONSTRAINT `vales_material_departamento_vale_id_departamento_id_fkey` FOREIGN KEY (`departamento_vale_id`, `departamento_id`) REFERENCES `departamentos_vale`(`id`, `departamento_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vales_material` ADD CONSTRAINT `vales_material_creado_por_id_fkey` FOREIGN KEY (`creado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vales_material` ADD CONSTRAINT `vales_material_separado_por_id_fkey` FOREIGN KEY (`separado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vales_material` ADD CONSTRAINT `vales_material_entregado_por_id_fkey` FOREIGN KEY (`entregado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vales_material` ADD CONSTRAINT `vales_material_descontado_por_id_fkey` FOREIGN KEY (`descontado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vales_material` ADD CONSTRAINT `vales_material_revertido_por_id_fkey` FOREIGN KEY (`revertido_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vales_material` ADD CONSTRAINT `vales_material_cancelado_por_id_fkey` FOREIGN KEY (`cancelado_por_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_estados_vale` ADD CONSTRAINT `historial_estados_vale_vale_id_fkey` FOREIGN KEY (`vale_id`) REFERENCES `vales_material`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_estados_vale` ADD CONSTRAINT `historial_estados_vale_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_autorizaciones_vale_area` ADD CONSTRAINT `usuarios_autorizaciones_vale_area_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_autorizaciones_vale_departamento` ADD CONSTRAINT `usuarios_autorizaciones_vale_departamento_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_autorizaciones_vale_departamento` ADD CONSTRAINT `usuarios_autorizaciones_vale_departamento_departamento_vale_fkey` FOREIGN KEY (`departamento_vale_id`) REFERENCES `departamentos_vale`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
