/**
 * AllGO MVP Admin Routes
 * 
 * Simplified admin endpoints: driver approval, basic stats
 * Section 18: Call-in booking support for dispatchers
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireAdmin, requireSuperAdmin, branchReadScope, resolveBranchFilter, assertBranchWriteAccess } from "../middleware/branchScope";
import { prisma } from "../config/database";
import { createTrip } from "../services/trip";
import { findDriverWithExpansion, assignTripToDriver, isNightServiceHours } from "../services/dispatch";
import { isCallInHours, isVehicleAllowedAtNight } from "@allgo/shared/constants/nightService";
import { VehicleType, ServiceType, DeliveryType, TripSource } from "@prisma/client";
import { sendSms } from "../services/sms";
import { generateTotpSecret, generateTotpQrCode, verifyTotpCode } from "../services/totp";
import { logAdminAction } from "../services/auditLog";
import { z } from "zod";

const router = Router();

/**
 * GET /api/v1/admin/drivers
 * Get all drivers with approval status
 */
router.get("/drivers", requireAuth, requireAdmin, async (req, res) => {
  try {
    const drivers = await prisma.driver.findMany({
      where: branchReadScope(req),
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const driversWithStatus = drivers.map((driver) => ({
      id: driver.userId,
      branchId: driver.branchId,
      name: driver.user.name || "Unknown",
      phone: driver.user.phone,
      vehicleType: driver.vehicleType,
      vehiclePlate: driver.licensePlate || "N/A",
      isApproved: driver.isApproved,
      isOnline: driver.isOnline,
      createdAt: driver.user.createdAt,
    }));

    res.json({ drivers: driversWithStatus });
  } catch (error) {
    console.error("Failed to fetch drivers:", error);
    res.status(500).json({ error: "Failed to fetch drivers" });
  }
});

/**
 * GET /api/v1/admin/customers
 * Get all customers with trip counts
 */
router.get("/customers", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Customer has no branchId of its own (a customer isn't tied to one
    // branch by nature) - scope via "has at least one trip with a driver
    // from this branch" instead. Trip count is scoped the same way when a
    // branch filter is active, so it doesn't show a lifetime total that
    // includes trips from other branches alongside a branch-filtered list.
    const branchId = resolveBranchFilter(req);
    const tripBranchWhere = branchId ? { driver: { branchId } } : {};

    const customers = await prisma.customer.findMany({
      where: branchId ? { trips: { some: tripBranchWhere } } : {},
      include: {
        user: {
          select: { id: true, name: true, phone: true, createdAt: true },
        },
        _count: { select: { trips: { where: tripBranchWhere } } },
      },
      orderBy: { createdAt: "desc" },
    });

    const customersWithStats = customers.map((customer) => ({
      id: customer.userId,
      name: customer.user.name || "Unknown",
      phone: customer.user.phone,
      totalTrips: customer._count.trips,
      createdAt: customer.user.createdAt,
    }));

    res.json({ customers: customersWithStats });
  } catch (error) {
    console.error("Failed to fetch customers:", error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

/**
 * GET /api/v1/admin/subscriptions
 * Section 4A: drivers with subscription status + pending payment proofs
 */
router.get("/subscriptions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const drivers = await prisma.driver.findMany({
      where: branchReadScope(req),
      include: {
        user: { select: { name: true, phone: true } },
        paymentSubmissions: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { subscriptionPeriodEnd: "asc" },
    });

    const mapped = drivers.map((d) => ({
      driverId: d.id,
      branchId: d.branchId,
      name: d.user.name || "Unknown",
      phone: d.user.phone,
      vehicleType: d.vehicleType,
      subscriptionStatus: d.subscriptionStatus,
      subscriptionPeriodEnd: d.subscriptionPeriodEnd,
      lastPaymentReference: d.lastPaymentReference,
      lastPaymentVerifiedAt: d.lastPaymentVerifiedAt,
      pendingSubmissions: d.paymentSubmissions,
    }));

    res.json({ drivers: mapped });
  } catch (error) {
    console.error("Failed to fetch subscriptions:", error);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

/**
 * POST /api/v1/admin/subscriptions/:driverId/mark-paid
 * Section 4A: manually verify payment, start a new 30-day period
 */
router.post("/subscriptions/:driverId/mark-paid", requireAuth, requireAdmin, async (req: any, res, next) => {
  try {
    const { driverId } = req.params;
    const { submissionId, periodDays } = req.body as { submissionId?: string; periodDays?: number };

    const target = await prisma.driver.findUnique({ where: { id: driverId }, select: { branchId: true } });
    assertBranchWriteAccess(req, target?.branchId);

    const driver = await prisma.driver.update({
      where: { id: driverId },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionPeriodEnd: new Date(Date.now() + (periodDays || 30) * 24 * 60 * 60 * 1000),
        lastPaymentReference: submissionId
          ? (await prisma.paymentSubmission.findUnique({ where: { id: submissionId } }))?.reference
          : undefined,
        lastPaymentVerifiedBy: req.user.id,
        lastPaymentVerifiedAt: new Date(),
      },
      include: { user: { select: { name: true, phone: true } } },
    });

    if (submissionId) {
      await prisma.paymentSubmission.update({
        where: { id: submissionId },
        data: { status: "APPROVED", reviewedBy: req.user.id, reviewedAt: new Date() },
      });
    }

    await sendSms(
      driver.user.phone,
      `Your AllGo subscription payment has been verified. You're active until ${driver.subscriptionPeriodEnd!.toLocaleDateString()}.`
    );

    await logAdminAction({
      adminUserId: req.user.id,
      action: "SUBSCRIPTION_MARKED_PAID",
      targetRecordType: "Driver",
      targetRecordId: driverId,
      branchId: driver.branchId,
      metadata: { submissionId, periodEnd: driver.subscriptionPeriodEnd },
    });

    res.json({ message: "Subscription marked as paid", driver });
  } catch (error) {
    if ((error as any).statusCode === 403) return next(error);
    console.error("Failed to mark subscription paid:", error);
    res.status(500).json({ error: "Failed to mark subscription paid" });
  }
});

/**
 * POST /api/v1/admin/subscriptions/submissions/:submissionId/reject
 */
router.post("/subscriptions/submissions/:submissionId/reject", requireAuth, requireAdmin, async (req: any, res, next) => {
  try {
    const { submissionId } = req.params;
    const { reason } = req.body as { reason?: string };

    const existing = await prisma.paymentSubmission.findUnique({
      where: { id: submissionId },
      include: { driver: { select: { branchId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Submission not found" });
    assertBranchWriteAccess(req, existing.driver.branchId);

    const submission = await prisma.paymentSubmission.update({
      where: { id: submissionId },
      data: {
        status: "REJECTED",
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
      include: { driver: { include: { user: { select: { phone: true } } } } },
    });

    await sendSms(
      submission.driver.user.phone,
      `Your AllGo subscription payment proof was rejected.${reason ? ` Reason: ${reason}` : ""} Please submit a valid transaction reference.`
    );

    await logAdminAction({
      adminUserId: req.user.id,
      action: "SUBSCRIPTION_PAYMENT_REJECTED",
      targetRecordType: "PaymentSubmission",
      targetRecordId: submissionId,
      branchId: submission.driver.branchId,
      metadata: { reason },
    });

    res.json({ message: "Submission rejected", submission });
  } catch (error) {
    if ((error as any).statusCode === 403) return next(error);
    console.error("Failed to reject submission:", error);
    res.status(500).json({ error: "Failed to reject submission" });
  }
});

/**
 * POST /api/v1/admin/drivers/:driverId/approve
 * Approve a driver
 */
router.post(
  "/drivers/:driverId/approve",
  requireAuth,
  requireAdmin,
  async (req: any, res, next) => {
    try {
      const { driverId } = req.params;

      const target = await prisma.driver.findUnique({ where: { userId: driverId }, select: { branchId: true } });
      assertBranchWriteAccess(req, target?.branchId);

      // Section 4A: approval starts the first subscription period (rolling
      // 30-day window from approval date, not a fixed monthly billing cycle)
      const driver = await prisma.driver.update({
        where: { userId: driverId },
        data: {
          isApproved: true,
          subscriptionStatus: "ACTIVE",
          subscriptionPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        include: {
          user: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      });

      console.log(`Driver approved: ${driver.user.name} (${driver.user.phone})`);

      await sendSms(
        driver.user.phone,
        "Your AllGo driver account has been approved! You can now go online and start receiving trip requests."
      );

      await logAdminAction({
        adminUserId: req.user.id,
        action: "DRIVER_APPROVED",
        targetRecordType: "Driver",
        targetRecordId: driver.id,
        branchId: driver.branchId,
      });

      res.json({
        message: "Driver approved successfully",
        driver: {
          id: driver.userId,
          name: driver.user.name,
          isApproved: driver.isApproved,
        },
      });
    } catch (error) {
      if ((error as any).statusCode === 403) return next(error);
      console.error("Failed to approve driver:", error);
      res.status(500).json({ error: "Failed to approve driver" });
    }
  }
);

/**
 * POST /api/v1/admin/drivers/:driverId/reject
 * Reject or revoke driver approval
 */
router.post(
  "/drivers/:driverId/reject",
  requireAuth,
  requireAdmin,
  async (req: any, res, next) => {
    try {
      const { driverId } = req.params;
      const { reason } = req.body;

      const target = await prisma.driver.findUnique({ where: { userId: driverId }, select: { branchId: true } });
      assertBranchWriteAccess(req, target?.branchId);

      const driver = await prisma.driver.update({
        where: { userId: driverId },
        data: { isApproved: false },
        include: {
          user: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      });

      console.log(
        `Driver rejected: ${driver.user.name} (${driver.user.phone})${
          reason ? ` - Reason: ${reason}` : ""
        }`
      );

      // Section 4C transparency: a driver should always see WHY a document
      // was rejected, not just a bare status flag
      await sendSms(
        driver.user.phone,
        `Your AllGo driver application was not approved.${reason ? ` Reason: ${reason}` : ""} Contact support if you have questions.`
      );

      await logAdminAction({
        adminUserId: req.user.id,
        action: "DRIVER_REJECTED",
        targetRecordType: "Driver",
        targetRecordId: driver.id,
        branchId: driver.branchId,
        metadata: { reason },
      });

      res.json({
        message: "Driver approval revoked",
        driver: {
          id: driver.userId,
          name: driver.user.name,
          isApproved: driver.isApproved,
        },
      });
    } catch (error) {
      if ((error as any).statusCode === 403) return next(error);
      console.error("Failed to reject driver:", error);
      res.status(500).json({ error: "Failed to reject driver" });
    }
  }
);

/**
 * GET /api/v1/admin/stats
 * Get dashboard statistics (no revenue - payment is external)
 */
router.get("/stats", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [
      totalDrivers,
      approvedDrivers,
      onlineDrivers,
      nightModeDrivers,
      totalCustomers,
      activeTrips,
      completedToday,
      feedbackCount,
      appTrips,
      callTrips,
    ] = await Promise.all([
      prisma.driver.count(),
      prisma.driver.count({ where: { isApproved: true } }),
      prisma.driver.count({ where: { isOnline: true } }),
      prisma.driver.count({ where: { nightMode: true, isOnline: true } }),
      prisma.customer.count(),
      prisma.trip.count({
        where: {
          status: {
            in: ["REQUESTED", "ACCEPTED", "ACTIVE"],
          },
        },
      }),
      prisma.trip.count({
        where: {
          status: "COMPLETED",
          completedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      prisma.feedback.count(),
      // Section 18: Count trips by source
      prisma.trip.count({ where: { source: "APP" } }),
      prisma.trip.count({ where: { source: "CALL" } }),
    ]);

    res.json({
      drivers: {
        total: totalDrivers,
        approved: approvedDrivers,
        pending: totalDrivers - approvedDrivers,
        online: onlineDrivers,
        nightModeActive: nightModeDrivers, // Section 20
      },
      customers: {
        total: totalCustomers,
      },
      trips: {
        active: activeTrips,
        completedToday,
        bySource: {
          app: appTrips,
          call: callTrips,
        },
      },
      feedback: {
        total: feedbackCount,
      },
      service: {
        isNightHours: isNightServiceHours(),
        isCallInHours: isCallInHours(),
      },
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

/**
 * GET /api/v1/admin/drivers/feedback
 * Per-driver feedback summary: average rating + fare-fairness flags
 * Admin-only visibility per Section 6 of the master plan - never shown to drivers
 */
router.get("/drivers/feedback", requireAuth, requireAdmin, async (req, res) => {
  try {
    const feedback = await prisma.feedback.findMany({
      include: {
        trip: {
          include: {
            driver: {
              include: {
                user: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        },
      },
    });

    const byDriver = new Map<
      string,
      { driverId: string; name: string; phone: string; ratings: number[]; tooHigh: number; tooLow: number; total: number }
    >();

    for (const fb of feedback) {
      const driver = fb.trip.driver;
      if (!driver) continue; // call-in trips may have no driver yet

      const entry = byDriver.get(driver.userId) || {
        driverId: driver.userId,
        name: driver.user.name || "Unknown",
        phone: driver.user.phone,
        ratings: [],
        tooHigh: 0,
        tooLow: 0,
        total: 0,
      };

      entry.ratings.push(fb.rating);
      entry.total += 1;
      if (fb.fareRating === "too_high") entry.tooHigh += 1;
      if (fb.fareRating === "too_low") entry.tooLow += 1;

      byDriver.set(driver.userId, entry);
    }

    const summary = Array.from(byDriver.values()).map((d) => ({
      driverId: d.driverId,
      name: d.name,
      phone: d.phone,
      avgRating: d.ratings.reduce((sum, r) => sum + r, 0) / d.ratings.length,
      totalFeedback: d.total,
      tooHighCount: d.tooHigh,
      tooLowCount: d.tooLow,
    }));

    res.json({ drivers: summary });
  } catch (error) {
    console.error("Failed to fetch driver feedback summary:", error);
    res.status(500).json({ error: "Failed to fetch driver feedback summary" });
  }
});

// =============================================================================
// SECTION 18: CALL-IN BOOKING SYSTEM
// =============================================================================

/**
 * POST /api/v1/admin/trips/call-in
 * Create a trip from a phone call (dispatcher use)
 * 
 * This is the main endpoint for dispatchers to create trips on behalf of callers
 */
router.post("/trips/call-in", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      callerPhone,
      callerName,
      vehicleType,
      serviceType,
      deliveryType,
      itemDescription,
      pickup,
      destination,
      customerNote,
    } = req.body;

    // Validation
    if (!callerPhone) {
      return res.status(400).json({ error: "Caller phone number is required" });
    }
    if (!vehicleType || !["MOTO", "KEKE", "MOTOR_KING"].includes(vehicleType)) {
      return res.status(400).json({ error: "Valid vehicle type is required" });
    }
    if (!pickup?.address || !destination?.address) {
      return res.status(400).json({ error: "Pickup and destination addresses are required" });
    }

    // Check if call-in is available (7am-9pm only)
    if (!isCallInHours()) {
      return res.status(400).json({
        error: "Call-in booking is available 7am-9pm only. For late-night rides, please use the AllGo app.",
      });
    }

    // Check night restrictions for vehicle type
    if (isNightServiceHours() && !isVehicleAllowedAtNight(vehicleType as VehicleType)) {
      return res.status(400).json({
        error: `${vehicleType} is not available during night hours. Only MOTO and KEKE are available.`,
      });
    }

    // MOTO validation
    if (vehicleType === "MOTO") {
      if (!serviceType || !["PASSENGER", "DELIVERY"].includes(serviceType)) {
        return res.status(400).json({ error: "MOTO requires service type (PASSENGER or DELIVERY)" });
      }
      if (serviceType === "DELIVERY") {
        if (!deliveryType || !["FOOD", "GROCERIES", "PARCELS", "OTHER"].includes(deliveryType)) {
          return res.status(400).json({ error: "Delivery type is required for MOTO deliveries" });
        }
        if (deliveryType === "OTHER" && !itemDescription) {
          return res.status(400).json({ error: "Item description is required for OTHER delivery type" });
        }
      }
    }

    // Set default coordinates if not provided (landmark-based booking)
    const pickupData = {
      lat: pickup.lat || 0,
      lng: pickup.lng || 0,
      address: pickup.address,
    };
    const destData = {
      lat: destination.lat || 0,
      lng: destination.lng || 0,
      address: destination.address,
    };

    // Create the trip with CALL source
    const { trip } = await createTrip({
      vehicleType: vehicleType as VehicleType,
      serviceType: (serviceType as ServiceType) || "PASSENGER",
      deliveryType: deliveryType as DeliveryType,
      itemDescription,
      pickup: pickupData,
      destination: destData,
      customerNote,
      source: "CALL" as TripSource,
      callerPhone,
      callerName,
    });

    // Start dispatch immediately
    const dispatchResult = await findDriverWithExpansion(
      pickupData.lat,
      pickupData.lng,
      vehicleType as VehicleType
    );

    if (dispatchResult.success && dispatchResult.driver) {
      // Found a driver - update trip
      // Note: Real dispatch would send to driver and wait for acceptance
      // For MVP, we immediately assign to nearest driver
      console.log(`[Call-In] Trip ${trip.id} dispatching to driver ${dispatchResult.driver.driverId}`);
    }

    res.status(201).json({
      success: true,
      trip: {
        id: trip.id,
        status: trip.status,
        source: trip.source,
        callerPhone: trip.callerPhone,
        callerName: trip.callerName,
        vehicleType: trip.vehicleType,
        serviceType: trip.serviceType,
        deliveryType: trip.deliveryType,
        pickup: {
          lat: trip.pickupLat,
          lng: trip.pickupLng,
          address: trip.pickupAddress,
        },
        destination: {
          lat: trip.destLat,
          lng: trip.destLng,
          address: trip.destAddress,
        },
        createdAt: trip.createdAt,
      },
      dispatch: dispatchResult.success
        ? {
            status: "SEARCHING",
            nearestDriver: dispatchResult.driver,
            message: dispatchResult.message,
          }
        : {
            status: "NO_DRIVER_FOUND",
            message: dispatchResult.message,
          },
    });
  } catch (error) {
    console.error("Failed to create call-in trip:", error);
    res.status(500).json({ error: "Failed to create trip" });
  }
});

/**
 * GET /api/v1/admin/trips/call-in/:tripId/status
 * Get live status of a call-in trip (for dispatcher to monitor)
 */
router.get("/trips/call-in/:tripId/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { tripId } = req.params;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        driver: {
          include: {
            user: {
              select: { name: true, phone: true },
            },
          },
        },
      },
    });

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({
      tripId: trip.id,
      status: trip.status,
      source: trip.source,
      callerPhone: trip.callerPhone,
      callerName: trip.callerName,
      vehicleType: trip.vehicleType,
      pickup: {
        address: trip.pickupAddress,
      },
      destination: {
        address: trip.destAddress,
      },
      driver: trip.driver
        ? {
            name: trip.driver.user.name,
            phone: trip.driver.user.phone,
            vehicleType: trip.driver.vehicleType,
          }
        : null,
      createdAt: trip.createdAt,
      acceptedAt: trip.acceptedAt,
      startedAt: trip.startedAt,
      completedAt: trip.completedAt,
    });
  } catch (error) {
    console.error("Failed to get trip status:", error);
    res.status(500).json({ error: "Failed to get trip status" });
  }
});

/**
 * GET /api/v1/admin/trips/active
 * Get all active trips (for dispatcher monitoring)
 */
router.get("/trips/active", requireAuth, requireAdmin, async (req, res) => {
  try {
    const activeTrips = await prisma.trip.findMany({
      where: {
        status: {
          in: ["REQUESTED", "ACCEPTED", "ACTIVE"],
        },
      },
      include: {
        customer: {
          include: {
            user: {
              select: { name: true, phone: true },
            },
          },
        },
        driver: {
          include: {
            user: {
              select: { name: true, phone: true },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const trips = activeTrips.map((trip) => ({
      id: trip.id,
      status: trip.status,
      source: trip.source,
      vehicleType: trip.vehicleType,
      serviceType: trip.serviceType,
      pickup: {
        address: trip.pickupAddress,
      },
      destination: {
        address: trip.destAddress,
      },
      customer: trip.customer
        ? {
            name: trip.customer.user.name,
            phone: trip.customer.user.phone,
          }
        : {
            name: trip.callerName || "Caller",
            phone: trip.callerPhone,
          },
      driver: trip.driver
        ? {
            name: trip.driver.user.name,
            phone: trip.driver.user.phone,
          }
        : null,
      createdAt: trip.createdAt,
    }));

    res.json({ trips });
  } catch (error) {
    console.error("Failed to get active trips:", error);
    res.status(500).json({ error: "Failed to get active trips" });
  }
});

/**
 * GET /api/v1/admin/trips
 * Get all trips with filtering, search, and pagination
 */
router.get("/trips", requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const source = req.query.source as string | undefined;
    const vehicleType = req.query.vehicleType as string | undefined;
    const serviceType = req.query.serviceType as string | undefined;
    const search = req.query.search as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    // Build where clause
    const where: any = {};

    // Trip has no branchId of its own - only derivable through whichever
    // driver accepts it. A trip with no driver yet has no resolvable
    // branch, so it's naturally excluded once this filter is applied
    // (Prisma's relation filter only matches rows where the related
    // driver exists and matches) - by design, not a bug: an unassigned
    // delivery doesn't belong to a branch until someone accepts it.
    const branchId = resolveBranchFilter(req);
    if (branchId) {
      where.driver = { branchId };
    }

    if (status && status !== "ALL") {
      where.status = status;
    }
    if (source && source !== "ALL") {
      where.source = source;
    }
    if (vehicleType && vehicleType !== "ALL") {
      where.vehicleType = vehicleType;
    }
    if (serviceType && serviceType !== "ALL") {
      where.serviceType = serviceType;
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }
    if (search) {
      where.OR = [
        { pickupAddress: { contains: search } },
        { destAddress: { contains: search } },
        { callerPhone: { contains: search } },
        { callerName: { contains: search } },
      ];
    }

    const [trips, totalCount] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: {
          customer: {
            include: {
              user: {
                select: { name: true, phone: true },
              },
            },
          },
          driver: {
            include: {
              user: {
                select: { name: true, phone: true },
              },
            },
          },
          feedback: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.trip.count({ where }),
    ]);

    const mapped = trips.map((trip) => ({
      id: trip.id,
      status: trip.status,
      source: trip.source,
      vehicleType: trip.vehicleType,
      serviceType: trip.serviceType,
      deliveryType: trip.deliveryType,
      itemDescription: trip.itemDescription,
      pickup: {
        address: trip.pickupAddress,
      },
      destination: {
        address: trip.destAddress,
      },
      customer: trip.customer
        ? {
            name: trip.customer.user.name,
            phone: trip.customer.user.phone,
          }
        : trip.callerName
        ? {
            name: trip.callerName,
            phone: trip.callerPhone,
          }
        : null,
      driver: trip.driver
        ? {
            name: trip.driver.user.name,
            phone: trip.driver.user.phone,
            vehicleType: trip.driver.vehicleType,
          }
        : null,
      distanceMeters: trip.distanceMeters,
      customerNote: trip.customerNote,
      cancelledBy: trip.cancelledBy,
      cancelReason: trip.cancelReason,
      feedback: trip.feedback
        ? {
            rating: trip.feedback.rating,
            fareRating: trip.feedback.fareRating,
            issue: trip.feedback.issue,
          }
        : null,
      createdAt: trip.createdAt,
      acceptedAt: trip.acceptedAt,
      startedAt: trip.startedAt,
      completedAt: trip.completedAt,
    }));

    res.json({
      trips: mapped,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("Failed to get trips:", error);
    res.status(500).json({ error: "Failed to get trips" });
  }
});

const totpCodeSchema = z.object({ code: z.string().length(6) });

/**
 * POST /api/v1/admin/2fa/setup
 * Generate a new TOTP secret + QR code for the logged-in admin to scan.
 * Not enabled yet - call /2fa/enable with a code to confirm and turn it on.
 */
router.post("/2fa/setup", requireAuth, requireAdmin, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { admin: true },
    });

    if (!user?.admin) {
      return res.status(404).json({ error: "Admin profile not found" });
    }

    const secret = generateTotpSecret();
    await prisma.admin.update({
      where: { id: user.admin.id },
      data: { totpSecret: secret, totpEnabled: false },
    });

    const qrCode = await generateTotpQrCode(user.phone, secret);
    res.json({ secret, qrCode });
  } catch (error) {
    console.error("Failed to set up 2FA:", error);
    res.status(500).json({ error: "Failed to set up 2FA" });
  }
});

/**
 * POST /api/v1/admin/2fa/enable
 * Confirm setup by verifying one code, then actually turn 2FA on
 */
router.post("/2fa/enable", requireAuth, requireAdmin, async (req: any, res) => {
  try {
    const { code } = totpCodeSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { admin: true },
    });

    if (!user?.admin?.totpSecret) {
      return res.status(400).json({ error: "Run /2fa/setup first" });
    }

    if (!verifyTotpCode(code, user.admin.totpSecret)) {
      return res.status(400).json({ error: "Invalid authenticator code" });
    }

    await prisma.admin.update({
      where: { id: user.admin.id },
      data: { totpEnabled: true },
    });

    res.json({ message: "Two-factor authentication enabled" });
  } catch (error) {
    console.error("Failed to enable 2FA:", error);
    res.status(500).json({ error: "Failed to enable 2FA" });
  }
});

/**
 * POST /api/v1/admin/2fa/disable
 */
router.post("/2fa/disable", requireAuth, requireAdmin, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { admin: true },
    });

    if (!user?.admin) {
      return res.status(404).json({ error: "Admin profile not found" });
    }

    await prisma.admin.update({
      where: { id: user.admin.id },
      data: { totpEnabled: false, totpSecret: null },
    });

    res.json({ message: "Two-factor authentication disabled" });
  } catch (error) {
    console.error("Failed to disable 2FA:", error);
    res.status(500).json({ error: "Failed to disable 2FA" });
  }
});

/**
 * GET /api/v1/admin/2fa/status
 */
router.get("/2fa/status", requireAuth, requireAdmin, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { admin: true },
    });

    res.json({ enabled: !!user?.admin?.totpEnabled });
  } catch (error) {
    console.error("Failed to get 2FA status:", error);
    res.status(500).json({ error: "Failed to get 2FA status" });
  }
});

// =============================================================================
// SECTION 4B: BRANCHES, BRANCH ADMINS, DRIVER REASSIGNMENT, AUDIT LOG
// =============================================================================

/**
 * GET /api/v1/admin/branches
 * Any admin can list branches (e.g. to populate a dropdown)
 */
router.get("/branches", requireAuth, requireAdmin, async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      include: { _count: { select: { drivers: true, admins: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json({
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        region: b.region,
        createdAt: b.createdAt,
        driverCount: b._count.drivers,
        adminCount: b._count.admins,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch branches:", error);
    res.status(500).json({ error: "Failed to fetch branches" });
  }
});

const createBranchSchema = z.object({
  name: z.string().min(1).max(100),
  region: z.string().min(1).max(100),
});

/**
 * POST /api/v1/admin/branches
 * Super admin only
 */
router.post("/branches", requireAuth, requireAdmin, requireSuperAdmin, async (req: any, res, next) => {
  try {
    const { name, region } = createBranchSchema.parse(req.body);
    const branch = await prisma.branch.create({ data: { name, region } });

    await logAdminAction({
      adminUserId: req.user.id,
      action: "BRANCH_CREATED",
      targetRecordType: "Branch",
      targetRecordId: branch.id,
      branchId: branch.id,
      metadata: { name, region },
    });

    res.json({ branch });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/admin/branch-admins
 * Super admin only - list all branch admin accounts
 */
router.get("/branch-admins", requireAuth, requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      where: { role: "BRANCH_ADMIN" },
      include: {
        user: { select: { name: true, phone: true, isActive: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      admins: admins.map((a) => ({
        adminId: a.id,
        // userId (not adminId) is what AdminActionLog.adminUserId stores -
        // the audit log's per-admin filter needs this, not the Admin
        // table's own id
        userId: a.userId,
        name: a.user.name || a.user.phone,
        phone: a.user.phone,
        isActive: a.user.isActive,
        branch: a.branch,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch branch admins:", error);
    res.status(500).json({ error: "Failed to fetch branch admins" });
  }
});

const createBranchAdminSchema = z.object({
  phone: z.string().min(9).max(15),
  name: z.string().min(1).max(100),
  branchId: z.string().min(1),
});

/**
 * POST /api/v1/admin/branch-admins
 * Super admin only - create (or upgrade an existing user to) a branch admin
 */
router.post("/branch-admins", requireAuth, requireAdmin, requireSuperAdmin, async (req: any, res, next) => {
  try {
    const { phone, name, branchId } = createBranchAdminSchema.parse(req.body);

    const { normalizeGhanaPhone } = await import("../utils");
    const normalizedPhone = normalizeGhanaPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res.status(404).json({ error: "Branch not found" });
    }

    let user = await prisma.user.findUnique({ where: { phone: normalizedPhone }, include: { admin: true } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: normalizedPhone,
          name,
          role: "ADMIN",
          admin: { create: { role: "BRANCH_ADMIN", branchId } },
        },
        include: { admin: true },
      });
    } else if (!user.admin) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: "ADMIN", name, admin: { create: { role: "BRANCH_ADMIN", branchId } } },
        include: { admin: true },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name, admin: { update: { role: "BRANCH_ADMIN", branchId } } },
        include: { admin: true },
      });
    }

    await logAdminAction({
      adminUserId: req.user.id,
      action: "BRANCH_ADMIN_CREATED",
      targetRecordType: "Admin",
      targetRecordId: user.admin!.id,
      branchId,
      metadata: { phone: normalizedPhone, name },
    });

    res.json({ message: "Branch admin account created", user: { id: user.id, phone: user.phone, name: user.name } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/branch-admins/:adminId/deactivate
 * Super admin only - deactivates the underlying User account, which
 * immediately blocks login (requireAuth already rejects inactive users)
 */
router.post("/branch-admins/:adminId/deactivate", requireAuth, requireAdmin, requireSuperAdmin, async (req: any, res) => {
  try {
    const { adminId } = req.params;

    const admin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) return res.status(404).json({ error: "Branch admin not found" });

    await prisma.user.update({ where: { id: admin.userId }, data: { isActive: false } });

    await logAdminAction({
      adminUserId: req.user.id,
      action: "BRANCH_ADMIN_DEACTIVATED",
      targetRecordType: "Admin",
      targetRecordId: adminId,
      branchId: admin.branchId,
    });

    res.json({ message: "Branch admin deactivated" });
  } catch (error) {
    console.error("Failed to deactivate branch admin:", error);
    res.status(500).json({ error: "Failed to deactivate branch admin" });
  }
});

const reassignDriverSchema = z.object({
  branchId: z.string().min(1),
});

/**
 * POST /api/v1/admin/drivers/:driverId/reassign-branch
 * Super admin only - move a driver to a different branch (e.g. relocation)
 */
router.post("/drivers/:driverId/reassign-branch", requireAuth, requireAdmin, requireSuperAdmin, async (req: any, res, next) => {
  try {
    const { driverId } = req.params;
    const { branchId } = reassignDriverSchema.parse(req.body);

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const previous = await prisma.driver.findUnique({ where: { id: driverId }, select: { branchId: true } });

    const driver = await prisma.driver.update({
      where: { id: driverId },
      data: { branchId },
      include: { user: { select: { name: true } } },
    });

    await logAdminAction({
      adminUserId: req.user.id,
      action: "DRIVER_REASSIGNED",
      targetRecordType: "Driver",
      targetRecordId: driverId,
      branchId,
      metadata: { fromBranchId: previous?.branchId, toBranchId: branchId },
    });

    res.json({ message: `${driver.user.name || "Driver"} reassigned to ${branch.name}`, driver });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/admin/audit-log
 * Super admin only - searchable/filterable timestamped action history
 */
router.get("/audit-log", requireAuth, requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const action = req.query.action as string | undefined;
    const branchId = req.query.branchId as string | undefined;
    const adminUserId = req.query.adminUserId as string | undefined;

    const where: any = {};
    if (action) where.action = action;
    if (branchId) where.branchId = branchId;
    if (adminUserId) where.adminUserId = adminUserId;

    const [logs, totalCount] = await Promise.all([
      prisma.adminActionLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.adminActionLog.count({ where }),
    ]);

    const adminIds = [...new Set(logs.map((l) => l.adminUserId))];
    const admins = await prisma.user.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, name: true, phone: true },
    });
    const adminMap = new Map(admins.map((a) => [a.id, a]));

    res.json({
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        targetRecordType: l.targetRecordType,
        targetRecordId: l.targetRecordId,
        branchId: l.branchId,
        metadata: l.metadata ? JSON.parse(l.metadata) : null,
        createdAt: l.createdAt,
        admin: adminMap.get(l.adminUserId) || null,
      })),
      pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
    });
  } catch (error) {
    console.error("Failed to fetch audit log:", error);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

/**
 * GET /api/v1/admin/data-requests
 * Section 4C - super admin only (spans all users, not branch-scoped)
 */
router.get("/data-requests", requireAuth, requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const status = (req.query.status as string) || "PENDING";
    const requests = await prisma.dataRequest.findMany({
      where: status === "ALL" ? {} : { status },
      include: { user: { select: { name: true, phone: true, role: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ requests });
  } catch (error) {
    console.error("Failed to fetch data requests:", error);
    res.status(500).json({ error: "Failed to fetch data requests" });
  }
});

/**
 * POST /api/v1/admin/data-requests/:id/complete
 * Marks a request fulfilled - actual fulfillment (export or erasure) is a
 * manual process outside this endpoint in MVP
 */
router.post("/data-requests/:id/complete", requireAuth, requireAdmin, requireSuperAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const request = await prisma.dataRequest.update({
      where: { id },
      data: { status: "COMPLETED", completedBy: req.user.id, completedAt: new Date() },
    });
    res.json({ message: "Request marked complete", request });
  } catch (error) {
    console.error("Failed to complete data request:", error);
    res.status(500).json({ error: "Failed to complete data request" });
  }
});

export default router;
