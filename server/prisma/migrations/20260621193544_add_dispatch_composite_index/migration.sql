-- CreateIndex
CREATE INDEX `drivers_vehicleType_isApproved_isOnline_subscriptionStatus_s_idx` ON `drivers`(`vehicleType`, `isApproved`, `isOnline`, `subscriptionStatus`, `subscriptionPeriodEnd`);
