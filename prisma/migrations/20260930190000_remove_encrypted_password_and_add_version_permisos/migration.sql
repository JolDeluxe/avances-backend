-- AlterTable
ALTER TABLE `usuarios` DROP COLUMN `password_encrypted`,
    ADD COLUMN `version_permisos` INTEGER NOT NULL DEFAULT 1;

-- Limpiar permisos obsoletos de contraseñas reversibles
DELETE rp FROM `roles_permisos` rp INNER JOIN `permisos` p ON rp.`permiso_id` = p.`id` WHERE p.`codigo` = 'usuario:password:ver';
DELETE ep FROM `excepciones_permisos_usuario` ep INNER JOIN `permisos` p ON ep.`permiso_id` = p.`id` WHERE p.`codigo` = 'usuario:password:ver';
DELETE FROM `permisos` WHERE `codigo` = 'usuario:password:ver';
