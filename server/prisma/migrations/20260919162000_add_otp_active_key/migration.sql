-- Add a nullable ownership key first so existing rows migrate safely.
ALTER TABLE `otp_codes`
ADD COLUMN `activeKey` VARCHAR(20) NULL;

-- Historical cleanup:
-- if more than one unexpired/unused OTP exists for a phone, invalidate every
-- row that has a newer unexpired/unused sibling. createdAt is primary order;
-- id is a deterministic tie-breaker for equal timestamps.
UPDATE `otp_codes` AS older
JOIN `otp_codes` AS newer
  ON newer.`phone` = older.`phone`
 AND newer.`usedAt` IS NULL
 AND newer.`expiresAt` > CURRENT_TIMESTAMP
 AND older.`usedAt` IS NULL
 AND older.`expiresAt` > CURRENT_TIMESTAMP
 AND (
      newer.`createdAt` > older.`createdAt`
      OR (
        newer.`createdAt` = older.`createdAt`
        AND newer.`id` > older.`id`
      )
 )
SET older.`usedAt` = CURRENT_TIMESTAMP;

-- Backfill ownership only for the surviving currently-valid OTP.
UPDATE `otp_codes`
SET `activeKey` = `phone`
WHERE `usedAt` IS NULL
  AND `expiresAt` > CURRENT_TIMESTAMP;

-- Final database invariant: one non-null activeKey per phone.
CREATE UNIQUE INDEX `otp_codes_activeKey_key`
ON `otp_codes`(`activeKey`);
