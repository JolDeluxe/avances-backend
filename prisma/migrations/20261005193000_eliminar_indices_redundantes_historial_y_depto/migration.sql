-- DropIndex: Eliminar indices simples redundantes completamente cubiertos por indices compuestos

-- 1. departamento_id en listados_material (cubierto por idx_listados_depto_estado_fecha [departamento_id, estado, fecha_requerida, id])
DROP INDEX `listados_material_departamento_id_idx` ON `listados_material`;

-- 2. listado_material_id en historial_estados_listado (cubierto por idx_historial_listado_fecha [listado_material_id, fecha_cambio])
DROP INDEX `historial_estados_listado_listado_material_id_idx` ON `historial_estados_listado`;

-- 3. listado_surtido_frente_id en historial_estados_frente (cubierto por idx_historial_frente_fecha [listado_surtido_frente_id, fecha_cambio])
DROP INDEX `historial_estados_frente_listado_surtido_frente_id_idx` ON `historial_estados_frente`;
