-- CreateIndex
CREATE INDEX `idx_historial_frente_fecha` ON `historial_estados_frente`(`listado_surtido_frente_id`, `fecha_cambio`);

-- CreateIndex
CREATE INDEX `idx_historial_listado_fecha` ON `historial_estados_listado`(`listado_material_id`, `fecha_cambio`);

-- CreateIndex
CREATE INDEX `idx_listados_depto_estado_fecha` ON `listados_material`(`departamento_id`, `estado`, `fecha_requerida`, `id`);

-- CreateIndex
CREATE INDEX `idx_listados_linea_estado_fecha` ON `listados_material`(`linea_produccion_id`, `estado`, `fecha_requerida`, `id`);

-- CreateIndex
CREATE INDEX `idx_frentes_tipo_estado_listado` ON `listados_surtido_frentes`(`tipo_frente`, `estado`, `listado_material_id`);
