-- CreateTable
CREATE TABLE `departments` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `module` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `permissions_code_key`(`code`),
    INDEX `permissions_module_idx`(`module`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` VARCHAR(36) NOT NULL,
    `permission_id` VARCHAR(36) NOT NULL,

    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(36) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role_id` VARCHAR(36) NOT NULL,
    `department_id` VARCHAR(36) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_id_idx`(`role_id`),
    INDEX `users_department_id_idx`(`department_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_permission_exceptions` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `permission_id` VARCHAR(36) NOT NULL,
    `action_type` ENUM('GRANT', 'REVOKE') NOT NULL,
    `reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_permission_exceptions_user_id_permission_id_key`(`user_id`, `permission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `resource` VARCHAR(100) NOT NULL,
    `resource_id` VARCHAR(36) NULL,
    `metadata` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_action_idx`(`action`),
    INDEX `audit_logs_resource_idx`(`resource`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_lines` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `department_id` VARCHAR(36) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `production_lines_code_key`(`code`),
    INDEX `production_lines_department_id_idx`(`department_id`),
    UNIQUE INDEX `production_lines_id_department_id_key`(`id`, `department_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `material_lists` (
    `id` VARCHAR(36) NOT NULL,
    `list_number` VARCHAR(50) NOT NULL,
    `required_date` DATE NOT NULL,
    `department_id` VARCHAR(36) NOT NULL,
    `production_line_id` VARCHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'SEPARATED', 'DELIVERED') NOT NULL DEFAULT 'PENDING',
    `created_by_user_id` VARCHAR(36) NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `material_lists_list_number_key`(`list_number`),
    INDEX `material_lists_department_id_idx`(`department_id`),
    INDEX `material_lists_production_line_id_department_id_idx`(`production_line_id`, `department_id`),
    INDEX `material_lists_status_idx`(`status`),
    INDEX `material_lists_required_date_idx`(`required_date`),
    INDEX `material_lists_created_by_user_id_idx`(`created_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `material_list_status_history` (
    `id` VARCHAR(36) NOT NULL,
    `material_list_id` VARCHAR(36) NOT NULL,
    `from_status` ENUM('PENDING', 'SEPARATED', 'DELIVERED') NULL,
    `to_status` ENUM('PENDING', 'SEPARATED', 'DELIVERED') NOT NULL,
    `changed_by_user_id` VARCHAR(36) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `material_list_status_history_material_list_id_idx`(`material_list_id`),
    INDEX `material_list_status_history_changed_by_user_id_idx`(`changed_by_user_id`),
    INDEX `material_list_status_history_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `material_list_separations` (
    `id` VARCHAR(36) NOT NULL,
    `material_list_id` VARCHAR(36) NOT NULL,
    `separated_by_user_id` VARCHAR(36) NOT NULL,
    `separated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` TEXT NULL,

    INDEX `material_list_separations_material_list_id_idx`(`material_list_id`),
    INDEX `material_list_separations_separated_by_user_id_idx`(`separated_by_user_id`),
    INDEX `material_list_separations_separated_at_idx`(`separated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `material_list_deliveries` (
    `id` VARCHAR(36) NOT NULL,
    `material_list_id` VARCHAR(36) NOT NULL,
    `delivered_by_user_id` VARCHAR(36) NOT NULL,
    `received_by_user_id` VARCHAR(36) NOT NULL,
    `delivered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` TEXT NULL,

    INDEX `material_list_deliveries_material_list_id_idx`(`material_list_id`),
    INDEX `material_list_deliveries_delivered_by_user_id_idx`(`delivered_by_user_id`),
    INDEX `material_list_deliveries_received_by_user_id_idx`(`received_by_user_id`),
    INDEX `material_list_deliveries_delivered_at_idx`(`delivered_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_permission_exceptions` ADD CONSTRAINT `user_permission_exceptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_permission_exceptions` ADD CONSTRAINT `user_permission_exceptions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_lines` ADD CONSTRAINT `production_lines_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_lists` ADD CONSTRAINT `material_lists_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_lists` ADD CONSTRAINT `material_lists_production_line_id_department_id_fkey` FOREIGN KEY (`production_line_id`, `department_id`) REFERENCES `production_lines`(`id`, `department_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_lists` ADD CONSTRAINT `material_lists_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_list_status_history` ADD CONSTRAINT `material_list_status_history_material_list_id_fkey` FOREIGN KEY (`material_list_id`) REFERENCES `material_lists`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_list_status_history` ADD CONSTRAINT `material_list_status_history_changed_by_user_id_fkey` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_list_separations` ADD CONSTRAINT `material_list_separations_material_list_id_fkey` FOREIGN KEY (`material_list_id`) REFERENCES `material_lists`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_list_separations` ADD CONSTRAINT `material_list_separations_separated_by_user_id_fkey` FOREIGN KEY (`separated_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_list_deliveries` ADD CONSTRAINT `material_list_deliveries_material_list_id_fkey` FOREIGN KEY (`material_list_id`) REFERENCES `material_lists`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_list_deliveries` ADD CONSTRAINT `material_list_deliveries_delivered_by_user_id_fkey` FOREIGN KEY (`delivered_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_list_deliveries` ADD CONSTRAINT `material_list_deliveries_received_by_user_id_fkey` FOREIGN KEY (`received_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

