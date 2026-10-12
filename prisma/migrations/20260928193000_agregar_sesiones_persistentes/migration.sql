-- CreateTable
CREATE TABLE `departamentos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(30) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departamentos_codigo_key`(`codigo`),
    INDEX `departamentos_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lineas_produccion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(30) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `departamento_id` INTEGER NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lineas_produccion_codigo_key`(`codigo`),
    INDEX `lineas_produccion_departamento_id_idx`(`departamento_id`),
    INDEX `lineas_produccion_estado_idx`(`estado`),
    UNIQUE INDEX `lineas_produccion_id_departamento_id_key`(`id`, `departamento_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(50) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_codigo_key`(`codigo`),
    INDEX `roles_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permisos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(100) NOT NULL,
    `modulo` VARCHAR(50) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    UNIQUE INDEX `permisos_codigo_key`(`codigo`),
    INDEX `permisos_modulo_idx`(`modulo`),
    INDEX `permisos_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles_permisos` (
    `rol_id` INTEGER NOT NULL,
    `permiso_id` INTEGER NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    INDEX `roles_permisos_estado_idx`(`estado`),
    PRIMARY KEY (`rol_id`, `permiso_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `correo` VARCHAR(150) NOT NULL,
    `nombre` VARCHAR(120) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `rol_id` INTEGER NOT NULL,
    `departamento_id` INTEGER NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_correo_key`(`correo`),
    INDEX `usuarios_rol_id_idx`(`rol_id`),
    INDEX `usuarios_departamento_id_idx`(`departamento_id`),
    INDEX `usuarios_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `excepciones_permisos_usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `permiso_id` INTEGER NOT NULL,
    `accion` ENUM('CONCEDER', 'DENEGAR') NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    INDEX `excepciones_permisos_usuario_estado_idx`(`estado`),
    UNIQUE INDEX `excepciones_permisos_usuario_usuario_id_permiso_id_key`(`usuario_id`, `permiso_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios_lineas_produccion` (
    `usuario_id` INTEGER NOT NULL,
    `linea_produccion_id` INTEGER NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    INDEX `usuarios_lineas_produccion_linea_produccion_id_idx`(`linea_produccion_id`),
    INDEX `usuarios_lineas_produccion_estado_idx`(`estado`),
    PRIMARY KEY (`usuario_id`, `linea_produccion_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `listados_material` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numero_listado` VARCHAR(50) NOT NULL,
    `fecha_requerida` DATE NOT NULL,
    `departamento_id` INTEGER NOT NULL,
    `linea_produccion_id` INTEGER NOT NULL,
    `estado` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO_A_PRODUCCION') NOT NULL DEFAULT 'PENDIENTE',
    `creado_por_usuario_id` INTEGER NOT NULL,
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
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `listado_material_id` INTEGER NOT NULL,
    `estado_anterior` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO_A_PRODUCCION') NOT NULL,
    `estado_nuevo` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO_A_PRODUCCION') NOT NULL,
    `cambiado_por_usuario_id` INTEGER NOT NULL,
    `fecha_cambio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `historial_estados_listado_listado_material_id_idx`(`listado_material_id`),
    INDEX `historial_estados_listado_cambiado_por_usuario_id_idx`(`cambiado_por_usuario_id`),
    INDEX `historial_estados_listado_fecha_cambio_idx`(`fecha_cambio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `registros_auditoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NULL,
    `accion` VARCHAR(50) NOT NULL,
    `entidad` VARCHAR(50) NOT NULL,
    `entidad_id` INTEGER NULL,
    `detalle` VARCHAR(255) NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `registros_auditoria_usuario_id_idx`(`usuario_id`),
    INDEX `registros_auditoria_fecha_creacion_idx`(`fecha_creacion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sesiones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `refresh_token_hash` VARCHAR(255) NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `fecha_expiracion` DATETIME(3) NOT NULL,
    `fecha_ultimo_uso` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_revocacion` DATETIME(3) NULL,
    `ip_origen` VARCHAR(45) NULL,
    `agente_usuario` VARCHAR(255) NULL,
    `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_actualizacion` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sesiones_refresh_token_hash_key`(`refresh_token_hash`),
    INDEX `sesiones_usuario_id_idx`(`usuario_id`),
    INDEX `sesiones_estado_idx`(`estado`),
    INDEX `sesiones_fecha_expiracion_idx`(`fecha_expiracion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lineas_produccion` ADD CONSTRAINT `lineas_produccion_departamento_id_fkey` FOREIGN KEY (`departamento_id`) REFERENCES `departamentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roles_permisos` ADD CONSTRAINT `roles_permisos_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roles_permisos` ADD CONSTRAINT `roles_permisos_permiso_id_fkey` FOREIGN KEY (`permiso_id`) REFERENCES `permisos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_departamento_id_fkey` FOREIGN KEY (`departamento_id`) REFERENCES `departamentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `excepciones_permisos_usuario` ADD CONSTRAINT `excepciones_permisos_usuario_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `excepciones_permisos_usuario` ADD CONSTRAINT `excepciones_permisos_usuario_permiso_id_fkey` FOREIGN KEY (`permiso_id`) REFERENCES `permisos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_lineas_produccion` ADD CONSTRAINT `usuarios_lineas_produccion_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_lineas_produccion` ADD CONSTRAINT `usuarios_lineas_produccion_linea_produccion_id_fkey` FOREIGN KEY (`linea_produccion_id`) REFERENCES `lineas_produccion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE `registros_auditoria` ADD CONSTRAINT `registros_auditoria_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sesiones` ADD CONSTRAINT `sesiones_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

