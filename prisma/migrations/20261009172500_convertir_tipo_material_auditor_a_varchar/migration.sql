-- AlterTable: tipo_material_auditor pasa de ENUM a VARCHAR para permitir selección múltiple (DIRECTOS, INDIRECTOS, BOLSAS)
ALTER TABLE `usuarios` MODIFY `tipo_material_auditor` VARCHAR(100) NULL;

-- Preservar comportamiento previo: los auditores DIRECTOS auditaban también BOLSAS implícitamente
UPDATE `usuarios` SET `tipo_material_auditor` = 'DIRECTOS,BOLSAS' WHERE `tipo_material_auditor` = 'DIRECTOS';
