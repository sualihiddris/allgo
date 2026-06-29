/**
 * AllGO Admin — Subscriptions Page (Section 4A)
 *
 * Manual subscription verification: list drivers by status, review
 * pending payment proofs, mark as paid / reject.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BranchFilterSelect } from '../components';

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
  const [branchFilter, setBranchFilter] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
  });

  const fetchSubscriptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/admin/subscriptions`, {
        headers: authHeader(),
        params: branchFilter ? { branchId: branchFilter } : {},
      });
      setDrivers(data.drivers || []);
    } catch (err) {
      console.error('Failed to fetch subscriptions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [branchFilter]);

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subscriptions</h1>
          <p className="mt-1 text-sm text-slate-500">Manual subscription verification (Section 4A)</p>
        </div>
        <div className="flex gap-2">
          <BranchFilterSelect value={branchFilter} onChange={setBranchFilter} />
          <select
            className="input w-auto cursor-pointer"
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="ALL">All Drivers</option>
            <option value="PENDING">Pending Review</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-3xl font-bold tracking-tight text-green-600">{stats.active}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Active</p>
        </div>
        <div className="card p-5">
          <p className="text-3xl font-bold tracking-tight text-red-600">{stats.expired}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Expired</p>
        </div>
        <div className="card p-5">
          <p className="text-3xl font-bold tracking-tight text-amber-600">{stats.pending}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Pending Proof Review</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
            <span className="text-sm font-medium">Loading subscriptions…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <span className="mb-2 block text-4xl">💳</span>
            <span className="text-sm text-slate-400">No drivers match this filter</span>
          </div>
        ) : (
          <table className="table-modern">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th>Period End</th>
                <th>Pending Proof</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const isProcessing = processingId === d.driverId;
                const pending = d.pendingSubmissions[0];
                return (
                  <tr key={d.driverId}>
                    <td>
                      <p className="font-semibold text-slate-900">{d.name}</p>
                      <p className="text-xs text-slate-400">{d.phone}</p>
                    </td>
                    <td className="text-slate-500">{d.vehicleType}</td>
                    <td>
                      <span className={d.subscriptionStatus === 'ACTIVE' ? 'badge-green' : 'badge-red'}>
                        {d.subscriptionStatus === 'ACTIVE' ? '✓ Active' : '✕ Expired'}
                      </span>
                    </td>
                    <td className="text-slate-500">
                      {d.subscriptionPeriodEnd ? new Date(d.subscriptionPeriodEnd).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      {pending ? (
                        <span className="font-mono text-xs text-slate-700">{pending.reference}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        {pending && (
                          <button
                            onClick={() => handleReject(pending.id, d.driverId)}
                            disabled={isProcessing}
                            className="btn-secondary btn-sm"
                          >
                            Reject
                          </button>
                        )}
                        <button
                          onClick={() => handleMarkPaid(d.driverId, pending?.id)}
                          disabled={isProcessing}
                          className="btn btn-sm bg-green-500 text-white hover:bg-green-600"
                        >
                          {isProcessing ? '…' : 'Mark Paid'}
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
