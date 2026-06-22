import { Router } from "express";
import { healthRouter } from "./health";
import { authRouter } from "./auth";
import { bookingRouter } from "./booking";
import { feedbackRouter } from "./feedback";
import { driverRouter } from "./driver";
import { trackingRouter } from "./tracking";
import { mapsRouter } from "./maps";
import adminRouter from "./admin";

const router = Router();

// Mount routes - MVP only (no payment/fare)
router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/bookings", bookingRouter);
router.use("/feedback", feedbackRouter);
router.use("/driver", driverRouter);
router.use("/tracking", trackingRouter);
router.use("/maps", mapsRouter);
router.use("/admin", adminRouter);

export const apiRouter = router;

