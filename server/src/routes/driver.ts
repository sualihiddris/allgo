/**
 * AllGO Driver-specific Routes
 * 
 * Endpoints for driver app features:
 * - Online/Offline toggle
 * - Night mode toggle (Section 20)
 * - Profile updates
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware";
import { prisma } from "../config";
import { sendSuccess } from "../utils";
import { updateDriverNightMode, hasActiveSubscription } from "../services/dispatch";

const router = Router();

// Middleware to ensure user is a driver
const requireDriver = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  if (req.user.role !== "DRIVER") {
    return res.status(403).json({ error: "Driver access required" });
  }
  
  // Get driver record
  const driver = await prisma.driver.findUnique({
    where: { userId: req.user.id },
  });
  
  if (!driver) {
    return res.status(404).json({ error: "Driver profile not found" });
  }
  
  // Attach driver to request
  (req as any).driver = driver;
  next();
};

// Validation schemas
const updateOnlineSchema = z.object({
  isOnline: z.boolean(),
});

const updateNightModeSchema = z.object({
  nightMode: z.boolean(),
});

const updatePushTokenSchema = z.object({
  pushToken: z.string().min(1).max(500),
});

/**
 * GET /api/v1/driver/status
 * Get current driver status
 */
router.get(
  "/status",
  requireAuth,
  requireDriver,
  async (req: Request, res: Response) => {
    const driver = (req as any).driver;
    
    sendSuccess(res, {
      isOnline: driver.isOnline,
      nightMode: driver.nightMode,
      isApproved: driver.isApproved,
      vehicleType: driver.vehicleType,
      totalTrips: driver.totalTrips,
      subscriptionStatus: driver.subscriptionStatus,
      subscriptionPeriodEnd: driver.subscriptionPeriodEnd,
    });
  }
);

/**
 * PATCH /api/v1/driver/online
 * Toggle online/offline status
 */
router.patch(
  "/online",
  requireAuth,
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { isOnline } = updateOnlineSchema.parse(req.body);
      const driver = (req as any).driver;
      
      // Check if driver is approved before going online
      if (isOnline && !driver.isApproved) {
        return res.status(403).json({
          error: "Your account is pending approval. Please wait for admin verification.",
        });
      }

      // Section 4A: subscription must be active to go online - an expired
      // subscription never interrupts an already-active trip (this check
      // only runs on the "go online" action, not mid-trip)
      if (isOnline && !hasActiveSubscription(driver)) {
        return res.status(403).json({
          error: "Your subscription has expired. Please renew to go online.",
          code: "SUBSCRIPTION_EXPIRED",
        });
      }

      const updatedDriver = await prisma.driver.update({
        where: { id: driver.id },
        data: { isOnline },
      });
      
      console.log(`[Driver] ${driver.id} is now ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
      
      sendSuccess(res, {
        isOnline: updatedDriver.isOnline,
        message: isOnline ? "You are now online and can receive job requests" : "You are now offline",
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/driver/night-mode
 * Toggle night mode for Section 20: Night Priority Service
 * 
 * When enabled, driver will receive requests during night hours (9pm-5am)
 */
router.patch(
  "/night-mode",
  requireAuth,
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nightMode } = updateNightModeSchema.parse(req.body);
      const driver = (req as any).driver;
      
      // Update night mode
      await updateDriverNightMode(driver.id, nightMode);
      
      const message = nightMode
        ? "Night mode enabled. You will receive requests during 9pm-5am."
        : "Night mode disabled. You won't receive requests during night hours.";
      
      sendSuccess(res, {
        nightMode,
        message,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/driver/push-token
 * Register/update this driver's Expo push token - the wake-up channel for
 * job offers when their Socket.io connection has died (backgrounded app).
 * Called once at app start when authenticated, not gated on isOnline.
 */
router.patch(
  "/push-token",
  requireAuth,
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pushToken } = updatePushTokenSchema.parse(req.body);
      const driver = (req as any).driver;

      await prisma.driver.update({
        where: { id: driver.id },
        data: { pushToken },
      });

      sendSuccess(res, { message: "Push token registered" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/driver/earnings
 * Get earnings summary (today / this week / this month)
 * MVP: no stored fare — count trips instead
 */
router.get(
  "/earnings",
  requireAuth,
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const driver = (req as any).driver;

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = now.getDay(); // 0 = Sunday
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfDay.getDate() - dayOfWeek);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [todayTrips, weekTrips, monthTrips, totalCounts] = await Promise.all([
        prisma.trip.count({
          where: { driverId: driver.id, status: "COMPLETED", completedAt: { gte: startOfDay } },
        }),
        prisma.trip.count({
          where: { driverId: driver.id, status: "COMPLETED", completedAt: { gte: startOfWeek } },
        }),
        prisma.trip.count({
          where: { driverId: driver.id, status: "COMPLETED", completedAt: { gte: startOfMonth } },
        }),
        prisma.trip.groupBy({
          by: ["serviceType"],
          where: { driverId: driver.id, status: "COMPLETED" },
          _count: true,
        }),
      ]);

      const totalTrips = totalCounts.find((g) => g.serviceType === "PASSENGER")?._count ?? 0;
      const totalDeliveries = totalCounts.find((g) => g.serviceType === "DELIVERY")?._count ?? 0;

      sendSuccess(res, {
        today: todayTrips,
        thisWeek: weekTrips,
        thisMonth: monthTrips,
        totalTrips,
        totalDeliveries,
        currency: "GHS",
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/driver/trips
 * Get trip history (optional status filter)
 */
router.get(
  "/trips",
  requireAuth,
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const driver = (req as any).driver;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const status = req.query.status as string | undefined;

      const where: any = { driverId: driver.id };
      if (status) where.status = status;

      const trips = await prisma.trip.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          serviceType: true,
          deliveryType: true,
          vehicleType: true,
          status: true,
          pickupAddress: true,
          destAddress: true,
          distanceMeters: true,
          customerNote: true,
          createdAt: true,
          completedAt: true,
          customer: {
            select: {
              user: { select: { name: true, phone: true } },
            },
          },
        },
      });

      const mapped = trips.map((t) => ({
        id: t.id,
        serviceType: t.serviceType,
        deliveryType: t.deliveryType,
        vehicleType: t.vehicleType,
        status: t.status,
        pickup: { address: t.pickupAddress },
        destination: { address: t.destAddress },
        distance: t.distanceMeters,
        customerNote: t.customerNote,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        customerName: t.customer?.user?.name ?? null,
        customerPhone: t.customer?.user?.phone ?? null,
      }));

      sendSuccess(res, { trips: mapped });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/driver/trips/active
 * Get currently active trips for this driver
 */
router.get(
  "/trips/active",
  requireAuth,
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const driver = (req as any).driver;

      const trips = await prisma.trip.findMany({
        where: {
          driverId: driver.id,
          status: { in: ["ACCEPTED", "ACTIVE"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          serviceType: true,
          deliveryType: true,
          itemDescription: true,
          vehicleType: true,
          status: true,
          pickupLat: true,
          pickupLng: true,
          pickupAddress: true,
          destLat: true,
          destLng: true,
          destAddress: true,
          customerNote: true,
          createdAt: true,
          customer: {
            select: {
              user: { select: { name: true, phone: true } },
            },
          },
        },
      });

      const mapped = trips.map((t) => ({
        id: t.id,
        serviceType: t.serviceType,
        deliveryType: t.deliveryType,
        itemDescription: t.itemDescription,
        vehicleType: t.vehicleType,
        status: t.status,
        pickup: { lat: t.pickupLat, lng: t.pickupLng, address: t.pickupAddress },
        destination: { lat: t.destLat, lng: t.destLng, address: t.destAddress },
        customerNote: t.customerNote,
        customer: {
          name: t.customer?.user?.name ?? "Customer",
          phone: t.customer?.user?.phone ?? "",
        },
        createdAt: t.createdAt,
      }));

      sendSuccess(res, { trips: mapped });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/driver/profile
 * Get full driver profile
 */
router.get(
  "/profile",
  requireAuth,
  requireDriver,
  async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        driver: true,
      },
    });
    
    if (!user || !user.driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }
    
    sendSuccess(res, {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      driver: {
        vehicleType: user.driver.vehicleType,
        licensePlate: user.driver.licensePlate,
        isApproved: user.driver.isApproved,
        isOnline: user.driver.isOnline,
        nightMode: user.driver.nightMode,
        totalTrips: user.driver.totalTrips,
        createdAt: user.driver.createdAt,
        subscriptionStatus: user.driver.subscriptionStatus,
        subscriptionPeriodEnd: user.driver.subscriptionPeriodEnd,
      },
    });
  }
);

const submitPaymentSchema = z.object({
  reference: z.string().min(1).max(255),
  screenshotUrl: z.string().url().optional(),
});

/**
 * GET /api/v1/driver/subscription
 * Subscription status + payment instructions + submission history
 */
router.get(
  "/subscription",
  requireAuth,
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const driver = (req as any).driver;

      const submissions = await prisma.paymentSubmission.findMany({
        where: { driverId: driver.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      sendSuccess(res, {
        subscriptionStatus: driver.subscriptionStatus,
        subscriptionPeriodEnd: driver.subscriptionPeriodEnd,
        // ACTION (Section 4A): replace with the real AllGO business MoMo
        // number before launch - pricing per vehicle type is also TBD,
        // pending market research per the master plan
        paymentInstructions: {
          momoNumber: "0XX XXX XXXX (TBD)",
          note: "Pay your subscription fee to the AllGO MoMo number above, then submit your transaction reference below for admin review.",
        },
        submissions,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/driver/subscription/submit-payment
 * Submit proof of payment for admin review
 */
router.post(
  "/subscription/submit-payment",
  requireAuth,
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reference, screenshotUrl } = submitPaymentSchema.parse(req.body);
      const driver = (req as any).driver;

      const submission = await prisma.paymentSubmission.create({
        data: {
          driverId: driver.id,
          reference,
          screenshotUrl,
        },
      });

      sendSuccess(res, {
        submission,
        message: "Payment proof submitted. An admin will review it shortly.",
      });
    } catch (error) {
      next(error);
    }
  }
);

export const driverRouter = router;
