-- AlterTable
ALTER TABLE `historial_estados_listado` ADD COLUMN `motivo` VARCHAR(500) NULL,
    MODIFY `estado_anterior` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO_A_PRODUCCION', 'CANCELADO', 'DESCONTADO') NOT NULL,
    MODIFY `estado_nuevo` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO_A_PRODUCCION', 'CANCELADO', 'DESCONTADO') NOT NULL;

-- AlterTable
ALTER TABLE `listados_material` MODIFY `estado` ENUM('PENDIENTE', 'SEPARADO', 'ENTREGADO_A_PRODUCCION', 'CANCELADO', 'DESCONTADO') NOT NULL DEFAULT 'PENDIENTE';

-- Permisos nuevos
INSERT INTO `permisos` (`codigo`, `modulo`, `descripcion`, `estado`, `fecha_creacion`, `fecha_actualizacion`)
VALUES 
  ('listado:editar', 'listados', 'Modificar datos operativos de un listado en PENDIENTE', 'ACTIVO', NOW(), NOW()),
  ('listado:retroceder', 'listados', 'Retroceder secuencialmente el estado de un listado con motivo', 'ACTIVO', NOW(), NOW()),
  ('listado:cancelar', 'listados', 'Cancelar un listado operativo con justificación', 'ACTIVO', NOW(), NOW()),
  ('listado:descontar', 'listados', 'Validar y descontar un listado entregado en ERP', 'ACTIVO', NOW(), NOW())
ON DUPLICATE KEY UPDATE `fecha_actualizacion` = NOW();

-- Asignación a SUPER_ADMIN
INSERT IGNORE INTO `roles_permisos` (`rol_id`, `permiso_id`, `estado`, `fecha_creacion`, `fecha_actualizacion`)
SELECT r.id, p.id, 'ACTIVO', NOW(), NOW()
FROM `roles` r, `permisos` p
WHERE r.codigo = 'SUPER_ADMIN' 
  AND p.codigo IN ('listado:editar', 'listado:retroceder', 'listado:cancelar', 'listado:descontar');

-- Asignación a ADMIN (sin descontar)
INSERT IGNORE INTO `roles_permisos` (`rol_id`, `permiso_id`, `estado`, `fecha_creacion`, `fecha_actualizacion`)
SELECT r.id, p.id, 'ACTIVO', NOW(), NOW()
FROM `roles` r, `permisos` p
WHERE r.codigo = 'ADMIN' 
  AND p.codigo IN ('listado:editar', 'listado:retroceder', 'listado:cancelar');

-- Asignación a ALMACENISTA (retroceder)
INSERT IGNORE INTO `roles_permisos` (`rol_id`, `permiso_id`, `estado`, `fecha_creacion`, `fecha_actualizacion`)
SELECT r.id, p.id, 'ACTIVO', NOW(), NOW()
FROM `roles` r, `permisos` p
WHERE r.codigo = 'ALMACENISTA' 
  AND p.codigo = 'listado:retroceder';

-- Asignación a AUDITOR (descontar)
INSERT IGNORE INTO `roles_permisos` (`rol_id`, `permiso_id`, `estado`, `fecha_creacion`, `fecha_actualizacion`)
SELECT r.id, p.id, 'ACTIVO', NOW(), NOW()
FROM `roles` r, `permisos` p
WHERE r.codigo = 'AUDITOR' 
  AND p.codigo = 'listado:descontar';

