-- AlterTable
ALTER TABLE `drivers` ADD COLUMN `lastPaymentReference` VARCHAR(255) NULL,
    ADD COLUMN `lastPaymentVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `lastPaymentVerifiedBy` VARCHAR(191) NULL,
    ADD COLUMN `subscriptionPeriodEnd` DATETIME(3) NULL,
    ADD COLUMN `subscriptionStatus` ENUM('ACTIVE', 'EXPIRED') NOT NULL DEFAULT 'EXPIRED';

-- CreateTable
CREATE TABLE `payment_submissions` (
    `id` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(255) NOT NULL,
    `screenshotUrl` VARCHAR(500) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `payment_submissions_driverId_status_idx`(`driverId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `drivers_subscriptionStatus_idx` ON `drivers`(`subscriptionStatus`);

-- AddForeignKey
ALTER TABLE `payment_submissions` ADD CONSTRAINT `payment_submissions_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `drivers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
