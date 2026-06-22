/**
 * AllGO Admin — Subscriptions Page (Section 4A)
 *
 * Manual subscription verification: list drivers by status, review
 * pending payment proofs, mark as paid / reject.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface PendingSubmission {
  id: string;
  reference: string;
  screenshotUrl: string | null;
  createdAt: string;
}

interface DriverSubscription {
  driverId: string;
  name: string;
  phone: string;
  vehicleType: string;
  subscriptionStatus: 'ACTIVE' | 'EXPIRED';
  subscriptionPeriodEnd: string | null;
  lastPaymentReference: string | null;
  lastPaymentVerifiedAt: string | null;
  pendingSubmissions: PendingSubmission[];
}

export function SubscriptionsPage() {
  const [drivers, setDrivers] = useState<DriverSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'PENDING'>('ALL');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
  });

  const fetchSubscriptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/admin/subscriptions`, {
        headers: authHeader(),
      });
      setDrivers(data.drivers || []);
    } catch (err) {
      console.error('Failed to fetch subscriptions:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions]);

  const handleMarkPaid = async (driverId: string, submissionId?: string) => {
    if (!confirm('Mark this subscription as paid for a new 30-day period?')) return;
    setProcessingId(driverId);
    try {
      await axios.post(
        `${API_BASE_URL}/admin/subscriptions/${driverId}/mark-paid`,
        { submissionId },
        { headers: authHeader() }
      );
      await fetchSubscriptions();
    } catch (err) {
      console.error('Failed to mark paid:', err);
      alert('Failed to mark subscription as paid.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (submissionId: string, driverId: string) => {
    const reason = prompt('Reason for rejecting this payment proof (optional):');
    if (reason === null) return;
    setProcessingId(driverId);
    try {
      await axios.post(
        `${API_BASE_URL}/admin/subscriptions/submissions/${submissionId}/reject`,
        { reason },
        { headers: authHeader() }
      );
      await fetchSubscriptions();
    } catch (err) {
      console.error('Failed to reject submission:', err);
      alert('Failed to reject submission.');
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = drivers.filter((d) => {
    if (filter === 'ALL') return true;
    if (filter === 'PENDING') return d.pendingSubmissions.length > 0;
    return d.subscriptionStatus === filter;
  });

  const stats = {
    active: drivers.filter((d) => d.subscriptionStatus === 'ACTIVE').length,
    expired: drivers.filter((d) => d.subscriptionStatus === 'EXPIRED').length,
    pending: drivers.filter((d) => d.pendingSubmissions.length > 0).length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Subscriptions</h2>
          <p className="text-gray-500">Manual subscription verification (Section 4A)</p>
        </div>
        <select
          className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
        >
          <option value="ALL">All Drivers</option>
          <option value="PENDING">Pending Review</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          <p className="text-sm text-gray-500">Active</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
          <p className="text-sm text-gray-500">Expired</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          <p className="text-sm text-gray-500">Pending Proof Review</p>
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden shadow">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">
            <span className="text-2xl block mb-2">⏳</span>
            Loading subscriptions...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <span className="text-4xl block mb-2">💳</span>
            No drivers match this filter
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Driver</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Vehicle</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Period End</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Pending Proof</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((d) => {
                const isProcessing = processingId === d.driverId;
                const pending = d.pendingSubmissions[0];
                return (
                  <tr key={d.driverId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{d.name}</p>
                      <p className="text-xs text-gray-500">{d.phone}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{d.vehicleType}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                          d.subscriptionStatus === 'ACTIVE'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {d.subscriptionStatus === 'ACTIVE' ? '✓ Active' : '✕ Expired'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {d.subscriptionPeriodEnd ? new Date(d.subscriptionPeriodEnd).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {pending ? (
                        <span className="font-mono text-gray-800">{pending.reference}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {pending && (
                          <button
                            onClick={() => handleReject(pending.id, d.driverId)}
                            disabled={isProcessing}
                            className="px-3 py-1 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        )}
                        <button
                          onClick={() => handleMarkPaid(d.driverId, pending?.id)}
                          disabled={isProcessing}
                          className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50"
                        >
                          {isProcessing ? '...' : 'Mark Paid'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
