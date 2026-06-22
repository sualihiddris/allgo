import { prisma } from "../config/database";

export type AdminAction =
  | "DRIVER_ADDED"
  | "DRIVER_APPROVED"
  | "DRIVER_REJECTED"
  | "DRIVER_REMOVED"
  | "DRIVER_REASSIGNED"
  | "SUBSCRIPTION_MARKED_PAID"
  | "SUBSCRIPTION_PAYMENT_REJECTED"
  | "BRANCH_ADMIN_CREATED"
  | "BRANCH_ADMIN_DEACTIVATED"
  | "BRANCH_CREATED";

/**
 * Section 4B: every admin-side mutation that changes a driver, subscription,
 * or admin account must write a log entry here - this is a backend
 * requirement, not a UI feature, so the audit trail stays reliable
 * regardless of which admin-panel screen triggered the action.
 */
export async function logAdminAction(params: {
  adminUserId: string;
  action: AdminAction;
  targetRecordType: string;
  targetRecordId: string;
  branchId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.adminActionLog.create({
    data: {
      adminUserId: params.adminUserId,
      action: params.action,
      targetRecordType: params.targetRecordType,
      targetRecordId: params.targetRecordId,
      branchId: params.branchId ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}
