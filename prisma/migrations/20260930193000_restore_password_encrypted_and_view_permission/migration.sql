-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `password_encrypted` TEXT NULL;

-- Restaurar permiso canónico usuario:password:ver
INSERT INTO `permisos` (`codigo`, `modulo`, `descripcion`, `estado`, `fecha_creacion`, `fecha_actualizacion`)
VALUES ('usuario:password:ver', 'usuarios', 'Revelar y consultar la contraseña actual de usuarios dentro de su alcance administrativo', 'ACTIVO', NOW(), NOW())
ON DUPLICATE KEY UPDATE `estado` = 'ACTIVO', `descripcion` = VALUES(`descripcion`);

-- Asignar usuario:password:ver a SUPER_ADMIN (alcance global)
INSERT IGNORE INTO `roles_permisos` (`rol_id`, `permiso_id`, `estado`, `fecha_creacion`, `fecha_actualizacion`)
SELECT r.`id`, p.`id`, 'ACTIVO', NOW(), NOW()
FROM `roles` r, `permisos` p
WHERE r.`codigo` = 'SUPER_ADMIN' AND p.`codigo` = 'usuario:password:ver';

-- Asignar usuario:password:ver a ADMIN (alcance departamental)
INSERT IGNORE INTO `roles_permisos` (`rol_id`, `permiso_id`, `estado`, `fecha_creacion`, `fecha_actualizacion`)
SELECT r.`id`, p.`id`, 'ACTIVO', NOW(), NOW()
FROM `roles` r, `permisos` p
WHERE r.`codigo` = 'ADMIN' AND p.`codigo` = 'usuario:password:ver';
