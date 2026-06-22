import { Outlet } from 'react-router-dom';
import { useAuthStore } from '../store';

/**
 * Section 4B: client-side gate for super-admin-only pages (Branches, Audit
 * Log). The backend already enforces this on every route - this is just
 * UX, so a branch admin sees a clear message instead of failed requests.
 */
export function SuperAdminRoute() {
  const { user } = useAuthStore();

  if (user?.admin?.role !== 'SUPER_ADMIN') {
    return (
      <div className="bg-white rounded-xl p-12 text-center">
        <span className="text-6xl mb-4 block">🔒</span>
        <h2 className="text-xl font-semibold text-gray-900">Super Admin Access Required</h2>
        <p className="text-gray-500 mt-2">This page is only available to super admins.</p>
      </div>
    );
  }

  return <Outlet />;
}
