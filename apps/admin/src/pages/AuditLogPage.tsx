/**
 * AllGO Admin — Audit Log Page (Section 4B, super admin only)
 *
 * Searchable/filterable timestamped history of every admin mutation.
 */

import { useState, useEffect, useCallback } from 'react';
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

const ACTIONS = [
  'DRIVER_ADDED', 'DRIVER_APPROVED', 'DRIVER_REJECTED', 'DRIVER_REMOVED', 'DRIVER_REASSIGNED',
  'SUBSCRIPTION_MARKED_PAID', 'SUBSCRIPTION_PAYMENT_REJECTED',
  'BRANCH_ADMIN_CREATED', 'BRANCH_ADMIN_DEACTIVATED', 'BRANCH_CREATED',
];

export function AuditLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = useCallback(async (p = 1) => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: '20' };
      if (actionFilter) params.action = actionFilter;

      const { data } = await axios.get(`${API_BASE_URL}/admin/audit-log`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_access_token')}` },
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
  }, [actionFilter]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Audit Log</h2>
          <p className="text-gray-500">Complete history of admin actions across all branches</p>
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm"
        >
          <option value="">All Actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl overflow-hidden shadow">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">
            <span className="text-2xl block mb-2">⏳</span>
            Loading audit log...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <span className="text-4xl block mb-2">📋</span>
            No actions logged yet
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">When</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Admin</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Action</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Target</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <p className="font-medium text-gray-900">{log.admin?.name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500">{log.admin?.phone}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {log.targetRecordType} <span className="font-mono text-xs">{log.targetRecordId.slice(0, 8)}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 font-mono max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50">
                <button disabled={page <= 1} onClick={() => fetchLogs(page - 1)}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40">
                  ← Prev
                </button>
                <span className="text-sm text-gray-600">Page {page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => fetchLogs(page + 1)}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40">
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
