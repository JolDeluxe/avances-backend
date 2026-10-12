-- DropIndex
DROP INDEX `usuarios_correo_key` ON `usuarios`;

-- AlterTable
ALTER TABLE `usuarios` DROP COLUMN `correo`,
    ADD COLUMN `usuario` VARCHAR(50) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `usuarios_usuario_key` ON `usuarios`(`usuario`);
