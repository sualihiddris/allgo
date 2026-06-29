/**
 * AllGO Admin — Audit Log Page (Section 4B, super admin only)
 *
 * Searchable/filterable timestamped history of every admin mutation.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface LogEntry {
  id: string;
  action: string;
  targetRecordType: string;
  targetRecordId: string;
  branchId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  admin: { id: string; name: string | null; phone: string } | null;
}

interface BranchAdminOption {
  userId: string;
  name: string;
  branch: { name: string } | null;
}

const ACTIONS = [
  'DRIVER_ADDED', 'DRIVER_APPROVED', 'DRIVER_REJECTED', 'DRIVER_REMOVED', 'DRIVER_REASSIGNED',
  'SUBSCRIPTION_MARKED_PAID', 'SUBSCRIPTION_PAYMENT_REJECTED',
  'BRANCH_ADMIN_CREATED', 'BRANCH_ADMIN_DEACTIVATED', 'BRANCH_CREATED',
];

export function AuditLogPage() {
  // adminUserId supports deep-linking from the Branches page ("View
  // Activity" on a specific branch admin's row) as well as normal
  // in-page filtering
  const [searchParams, setSearchParams] = useSearchParams();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [admins, setAdmins] = useState<BranchAdminOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [adminFilter, setAdminFilter] = useState(searchParams.get('adminUserId') || '');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('admin_access_token')}` });

  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/admin/branch-admins`, { headers: authHeader() })
      .then(({ data }) => setAdmins(data.admins || []))
      .catch((err) => console.error('Failed to fetch branch admins for filter:', err));
  }, []);

  const fetchLogs = useCallback(async (p = 1) => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: '20' };
      if (actionFilter) params.action = actionFilter;
      if (adminFilter) params.adminUserId = adminFilter;

      const { data } = await axios.get(`${API_BASE_URL}/admin/audit-log`, {
        headers: authHeader(),
        params,
      });
      setLogs(data.logs || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setPage(p);
    } catch (err) {
      console.error('Failed to fetch audit log:', err);
    } finally {
      setIsLoading(false);
    }
  }, [actionFilter, adminFilter]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const handleAdminFilterChange = (userId: string) => {
    setAdminFilter(userId);
    setSearchParams(userId ? { adminUserId: userId } : {});
  };

  const filteredAdminName = admins.find((a) => a.userId === adminFilter)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
          <p className="mt-1 text-sm text-slate-500">Complete history of admin actions across all branches</p>
        </div>
        <div className="flex gap-2">
          <select
            value={adminFilter}
            onChange={(e) => handleAdminFilterChange(e.target.value)}
            className="input w-auto cursor-pointer"
          >
            <option value="">All Admins</option>
            {admins.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.name}{a.branch ? ` (${a.branch.name})` : ''}
              </option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="input w-auto cursor-pointer"
          >
            <option value="">All Actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {adminFilter && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          Showing activity for <span className="font-semibold text-slate-900">{filteredAdminName || '…'}</span>
          <button onClick={() => handleAdminFilterChange('')} className="font-medium text-primary-600 hover:underline">
            Clear
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
            <span className="text-sm font-medium">Loading audit log…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <span className="mb-2 block text-4xl">📋</span>
            <span className="text-sm text-slate-400">{adminFilter || actionFilter ? 'No matching actions' : 'No actions logged yet'}</span>
          </div>
        ) : (
          <>
            <table className="table-modern">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-slate-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td>
                      {/* Phone is always present and unambiguous; name isn't
                          always set (e.g. an admin account created without
                          ever filling one in) - fall back to phone as the
                          primary label instead of a bare "Unknown" */}
                      <p className="font-semibold text-slate-900">{log.admin?.name || log.admin?.phone || 'Unknown'}</p>
                      {log.admin?.name && <p className="text-xs text-slate-400">{log.admin.phone}</p>}
                    </td>
                    <td>
                      <span className="badge-blue">{log.action.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="text-slate-500">
                      {log.targetRecordType}
                      <span className="ml-1.5 font-mono text-xs text-slate-300">#{log.targetRecordId.slice(0, 8)}</span>
                    </td>
                    <td className="max-w-xs text-xs text-slate-500">
                      {log.metadata ? (
                        <div className="space-y-0.5">
                          {Object.entries(log.metadata).map(([key, value]) => (
                            <div key={key} className="truncate">
                              <span className="text-slate-400">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span>{' '}
                              <span className="text-slate-700">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                <button disabled={page <= 1} onClick={() => fetchLogs(page - 1)} className="btn-secondary btn-sm">
                  ← Prev
                </button>
                <span className="text-sm font-medium text-slate-500">Page {page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => fetchLogs(page + 1)} className="btn-secondary btn-sm">
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
