/**
 * AllGO Admin — Deliveries Page
 *
 * MOTO-only delivery trips (Food/Groceries/Parcels/Other). Multi-stop
 * delivery and proof-of-delivery photos are explicitly out of MVP scope
 * per the master plan - this is just a delivery-filtered view of trips.
 * Consumes GET /api/v1/admin/trips?serviceType=DELIVERY
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BranchFilterSelect } from '../components';
import { useAuthStore } from '../store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface Delivery {
  id: string;
  status: 'REQUESTED' | 'ACCEPTED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  source: 'APP' | 'CALL';
  deliveryType: 'FOOD' | 'GROCERIES' | 'PARCELS' | 'OTHER' | null;
  itemDescription: string | null;
  pickup: { address: string };
  destination: { address: string };
  customer: { name: string; phone: string } | null;
  driver: { name: string; phone: string } | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  REQUESTED: { label: 'Requested', color: 'text-blue-700', bg: 'bg-blue-100' },
  ACCEPTED: { label: 'Accepted', color: 'text-purple-700', bg: 'bg-purple-100' },
  ACTIVE: { label: 'Active', color: 'text-orange-700', bg: 'bg-orange-100' },
  COMPLETED: { label: 'Completed', color: 'text-green-700', bg: 'bg-green-100' },
  CANCELLED: { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-100' },
};

const DELIVERY_ICONS: Record<string, string> = {
  FOOD: '🍜',
  GROCERIES: '🛒',
  PARCELS: '📦',
  OTHER: '❓',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function DeliveriesPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.admin?.role === 'SUPER_ADMIN';
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, totalCount: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [branchFilter, setBranchFilter] = useState('');

  const fetchDeliveries = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20', serviceType: 'DELIVERY' };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (branchFilter) params.branchId = branchFilter;

      const token = localStorage.getItem('admin_access_token');
      const { data } = await axios.get(`${API_BASE_URL}/admin/trips`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      const trips: Delivery[] = data.trips || [];
      setDeliveries(typeFilter === 'ALL' ? trips : trips.filter((t) => t.deliveryType === typeFilter));
      setPagination(data.pagination || { page: 1, limit: 20, totalCount: 0, totalPages: 0 });
    } catch (err) {
      console.error('Failed to fetch deliveries:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, typeFilter, branchFilter]);

  useEffect(() => { fetchDeliveries(1); }, [fetchDeliveries]);

  const typeCounts = deliveries.reduce(
    (acc, d) => {
      if (d.deliveryType) acc[d.deliveryType] = (acc[d.deliveryType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Deliveries</h1>
          <p className="mt-1 text-sm text-slate-500">MOTO delivery trips (Food, Groceries, Parcels, Other)</p>
        </div>
        <button onClick={() => fetchDeliveries(pagination.page)} className="btn-secondary">
          🔄 Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="card p-5">
          <p className="text-3xl font-bold tracking-tight text-slate-900">{pagination.totalCount}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Total Deliveries</p>
        </div>
        {(['FOOD', 'GROCERIES', 'PARCELS', 'OTHER'] as const).map((type) => (
          <div key={type} className="card p-5">
            <p className="text-3xl font-bold tracking-tight text-slate-900">
              <span className="mr-1 text-2xl">{DELIVERY_ICONS[type]}</span>{typeCounts[type] || 0}
            </p>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">{type}</p>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          {isSuperAdmin && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Branch</label>
              <BranchFilterSelect value={branchFilter} onChange={setBranchFilter} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto cursor-pointer">
              <option value="ALL">All Status</option>
              <option value="REQUESTED">🔵 Requested</option>
              <option value="ACCEPTED">🟣 Accepted</option>
              <option value="ACTIVE">🟠 Active</option>
              <option value="COMPLETED">🟢 Completed</option>
              <option value="CANCELLED">🔴 Cancelled</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input w-auto cursor-pointer">
              <option value="ALL">All Types</option>
              <option value="FOOD">🍜 Food</option>
              <option value="GROCERIES">🛒 Groceries</option>
              <option value="PARCELS">📦 Parcels</option>
              <option value="OTHER">❓ Other</option>
            </select>
          </div>
        </div>
        {(branchFilter || !isSuperAdmin) && (
          <p className="mt-3 text-xs text-slate-400">
            Unassigned deliveries (no driver yet) don't belong to a branch and won't appear while {isSuperAdmin ? 'a branch filter is active' : 'viewing your branch'}.
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
            <span className="text-sm font-medium">Loading deliveries…</span>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="py-16 text-center">
            <span className="mb-2 block text-4xl">📦</span>
            <span className="text-sm text-slate-400">No deliveries match your filters</span>
          </div>
        ) : (
          <table className="table-modern">
            <thead>
              <tr>
                <th>Item</th>
                <th>Customer</th>
                <th>Driver</th>
                <th>Route</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => {
                const statusCfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.REQUESTED;
                return (
                  <tr key={d.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{d.deliveryType ? DELIVERY_ICONS[d.deliveryType] : '📦'}</span>
                        <div>
                          <p className="font-semibold text-slate-900">{d.deliveryType || 'Delivery'}</p>
                          {d.itemDescription && <p className="text-xs text-slate-400">{d.itemDescription}</p>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {d.customer ? (
                        <div>
                          <p className="font-semibold text-slate-900">{d.customer.name || 'Unknown'}</p>
                          <p className="text-xs text-slate-400">{d.customer.phone}</p>
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td>
                      {d.driver ? (
                        <div>
                          <p className="font-semibold text-slate-900">{d.driver.name || 'Unknown'}</p>
                          <p className="text-xs text-slate-400">{d.driver.phone}</p>
                        </div>
                      ) : <span className="italic text-slate-300">Unassigned</span>}
                    </td>
                    <td>
                      <div className="max-w-[200px]">
                        <p className="truncate text-slate-700" title={d.pickup.address}>📍 {d.pickup.address}</p>
                        <p className="truncate text-slate-500" title={d.destination.address}>📌 {d.destination.address}</p>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="text-slate-400">{timeAgo(d.createdAt)}</td>
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
