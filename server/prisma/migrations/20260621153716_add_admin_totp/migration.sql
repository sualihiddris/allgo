-- AlterTable
ALTER TABLE `admins` ADD COLUMN `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `totpSecret` VARCHAR(64) NULL;
