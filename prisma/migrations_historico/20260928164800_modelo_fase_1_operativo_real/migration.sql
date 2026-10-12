-- CreateTable
CREATE TABLE `departamentos` (
    `id` VARCHAR(36) NOT NULL,
    `codigo` VARCHAR(30) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `departamentos_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` VARCHAR(36) NOT NULL,
    `correo` VARCHAR(150) NOT NULL,
    `nombre` VARCHAR(120) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `rol` ENUM('SUPER_ADMIN', 'ADMIN', 'ALMACENISTA', 'AUDITOR') NOT NULL,
    `departamento_id` VARCHAR(36) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_correo_key`(`correo`),
    INDEX `usuarios_departamento_id_idx`(`departamento_id`),
    INDEX `usuarios_rol_idx`(`rol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `excepciones_permisos_usuario` (
    `id` VARCHAR(36) NOT NULL,
    `usuario_id` VARCHAR(36) NOT NULL,
    `codigo_permiso` VARCHAR(100) NOT NULL,
    `accion` ENUM('CONCEDER', 'DENEGAR') NOT NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `excepciones_permisos_usuario_usuario_id_codigo_permiso_key`(`usuario_id`, `codigo_permiso`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `registros_auditoria` (
    `id` VARCHAR(36) NOT NULL,
    `usuario_id` VARCHAR(36) NULL,
    `accion` VARCHAR(50) NOT NULL,
    `entidad` VARCHAR(50) NOT NULL,
    `entidad_id` VARCHAR(36) NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `registros_auditoria_usuario_id_idx`(`usuario_id`),
    INDEX `registros_auditoria_fecha_creacion_idx`(`fecha_creacion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lineas_produccion` (
    `id` VARCHAR(36) NOT NULL,
    `codigo` VARCHAR(30) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `departamento_id` VARCHAR(36) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `lineas_produccion_codigo_key`(`codigo`),
    INDEX `lineas_produccion_departamento_id_idx`(`departamento_id`),
    UNIQUE INDEX `lineas_produccion_id_departamento_id_key`(`id`, `departamento_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `listados_material` (
    `id` VARCHAR(36) NOT NULL,
    `numero_listado` VARCHAR(50) NOT NULL,
    `fecha_requerida` DATE NOT NULL,
    `departamento_id` VARCHAR(36) NOT NULL,
    `linea_produccion_id` VARCHAR(36) NOT NULL,
    `estado` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO_A_PRODUCCION') NOT NULL DEFAULT 'PENDIENTE',
    `creado_por_usuario_id` VARCHAR(36) NOT NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    UNIQUE INDEX `listados_material_numero_listado_key`(`numero_listado`),
    INDEX `listados_material_departamento_id_idx`(`departamento_id`),
    INDEX `listados_material_linea_produccion_id_departamento_id_idx`(`linea_produccion_id`, `departamento_id`),
    INDEX `listados_material_estado_idx`(`estado`),
    INDEX `listados_material_fecha_requerida_idx`(`fecha_requerida`),
    INDEX `listados_material_creado_por_usuario_id_idx`(`creado_por_usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `historial_estados_listado` (
    `id` VARCHAR(36) NOT NULL,
    `listado_material_id` VARCHAR(36) NOT NULL,
    `estado_anterior` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO_A_PRODUCCION') NOT NULL,
    `estado_nuevo` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO_A_PRODUCCION') NOT NULL,
    `cambiado_por_usuario_id` VARCHAR(36) NOT NULL,
    `fecha_cambio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `historial_estados_listado_listado_material_id_idx`(`listado_material_id`),
    INDEX `historial_estados_listado_cambiado_por_usuario_id_idx`(`cambiado_por_usuario_id`),
    INDEX `historial_estados_listado_fecha_cambio_idx`(`fecha_cambio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_departamento_id_fkey` FOREIGN KEY (`departamento_id`) REFERENCES `departamentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `excepciones_permisos_usuario` ADD CONSTRAINT `excepciones_permisos_usuario_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registros_auditoria` ADD CONSTRAINT `registros_auditoria_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lineas_produccion` ADD CONSTRAINT `lineas_produccion_departamento_id_fkey` FOREIGN KEY (`departamento_id`) REFERENCES `departamentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listados_material` ADD CONSTRAINT `listados_material_departamento_id_fkey` FOREIGN KEY (`departamento_id`) REFERENCES `departamentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listados_material` ADD CONSTRAINT `listados_material_linea_produccion_id_departamento_id_fkey` FOREIGN KEY (`linea_produccion_id`, `departamento_id`) REFERENCES `lineas_produccion`(`id`, `departamento_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listados_material` ADD CONSTRAINT `listados_material_creado_por_usuario_id_fkey` FOREIGN KEY (`creado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_estados_listado` ADD CONSTRAINT `historial_estados_listado_listado_material_id_fkey` FOREIGN KEY (`listado_material_id`) REFERENCES `listados_material`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_estados_listado` ADD CONSTRAINT `historial_estados_listado_cambiado_por_usuario_id_fkey` FOREIGN KEY (`cambiado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

