ALTER TABLE `trips`
  ADD COLUMN `dispatchClaimToken` VARCHAR(64) NULL,
  ADD COLUMN `dispatchClaimedAt` DATETIME(3) NULL;
