-- AlterTable
ALTER TABLE `admins` ADD COLUMN `branchId` VARCHAR(191) NULL,
    ADD COLUMN `role` ENUM('BRANCH_ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'BRANCH_ADMIN';

-- AlterTable
ALTER TABLE `drivers` ADD COLUMN `branchId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `branches` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `region` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_action_logs` (
    `id` VARCHAR(191) NOT NULL,
    `adminUserId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `targetRecordType` VARCHAR(50) NOT NULL,
    `targetRecordId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NULL,
    `metadata` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_action_logs_adminUserId_idx`(`adminUserId`),
    INDEX `admin_action_logs_targetRecordType_targetRecordId_idx`(`targetRecordType`, `targetRecordId`),
    INDEX `admin_action_logs_branchId_idx`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `admins_branchId_idx` ON `admins`(`branchId`);

-- CreateIndex
CREATE INDEX `drivers_branchId_idx` ON `drivers`(`branchId`);

-- AddForeignKey
ALTER TABLE `drivers` ADD CONSTRAINT `drivers_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admins` ADD CONSTRAINT `admins_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
