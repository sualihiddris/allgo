import { Request, Response, NextFunction } from "express";
import { prisma } from "../config";
import { createError } from "./errorHandler";

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string; // Admin record id (not the User id)
        role: "BRANCH_ADMIN" | "SUPER_ADMIN";
        branchId: string | null; // null for super admin
      };
    }
  }
}

/**
 * Section 4B: requires the authenticated user to be an admin, and attaches
 * their Admin sub-record (role + branchId) to req.admin for branch-scoping.
 * Looked up fresh per-request (not cached in the JWT) so a branch
 * reassignment takes effect immediately, without forcing a re-login.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      throw createError("Admin access required", 403, "FORBIDDEN");
    }

    const admin = await prisma.admin.findUnique({ where: { userId: req.user.id } });
    if (!admin) {
      throw createError("Admin profile not found", 404, "NOT_FOUND");
    }

    req.admin = {
      id: admin.id,
      role: admin.role as "BRANCH_ADMIN" | "SUPER_ADMIN",
      branchId: admin.branchId,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Section 4B: gates super-admin-only actions (branch CRUD, branch admin
 * account management, driver reassignment) - must run after requireAdmin
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.admin?.role !== "SUPER_ADMIN") {
    return next(createError("Super admin access required", 403, "FORBIDDEN"));
  }
  next();
}

/**
 * Resolves which single branch (if any) this request should be scoped to:
 * a branch admin is always scoped to their own branch; a super admin sees
 * everything by default but can opt into one branch via ?branchId=, e.g.
 * for the Drivers/Subscriptions/Customers/Deliveries admin list pages.
 * Returns undefined when there's no scoping to apply (super admin, no
 * branchId query param).
 */
export function resolveBranchFilter(req: Request): string | undefined {
  if (req.admin?.role === "SUPER_ADMIN") {
    return (req.query.branchId as string) || undefined;
  }
  return req.admin?.branchId || undefined;
}

/**
 * For READ routes: a Prisma `where` fragment that restricts a branch admin
 * to their own branch's data. Super admin gets an empty fragment unless
 * they've opted into one branch via ?branchId= - spread this into the
 * route's existing where clause.
 */
export function branchReadScope(req: Request, branchField = "branchId"): Record<string, any> {
  const branchId = resolveBranchFilter(req);
  return branchId ? { [branchField]: branchId } : {};
}

/**
 * For WRITE routes: throws 403 if a branch admin is attempting to mutate a
 * record outside their own branch. Super admin always passes. Enforced
 * server-side - never rely on the client to self-restrict (Section 4C).
 */
export function assertBranchWriteAccess(req: Request, targetBranchId: string | null | undefined): void {
  if (req.admin?.role === "SUPER_ADMIN") return;
  if (!req.admin?.branchId || req.admin.branchId !== targetBranchId) {
    throw createError("You do not have access to this branch's data", 403, "BRANCH_FORBIDDEN");
  }
}
