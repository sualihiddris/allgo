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
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, totalCount: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchDeliveries = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20', serviceType: 'DELIVERY' };
      if (statusFilter !== 'ALL') params.status = statusFilter;

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
  }, [statusFilter, typeFilter]);

  useEffect(() => { fetchDeliveries(1); }, [fetchDeliveries]);

  const typeCounts = deliveries.reduce(
    (acc, d) => {
      if (d.deliveryType) acc[d.deliveryType] = (acc[d.deliveryType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Deliveries</h2>
          <p className="text-gray-500">MOTO delivery trips (Food, Groceries, Parcels, Other)</p>
        </div>
        <button onClick={() => fetchDeliveries(pagination.page)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors font-medium">
          🔄 Refresh
        </button>
      </div>

      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-2xl font-bold text-gray-900">{pagination.totalCount}</p>
          <p className="text-sm text-gray-500">Total Deliveries</p>
        </div>
        {(['FOOD', 'GROCERIES', 'PARCELS', 'OTHER'] as const).map((type) => (
          <div key={type} className="bg-white rounded-lg p-4 shadow">
            <p className="text-2xl font-bold text-gray-900">{DELIVERY_ICONS[type]} {typeCounts[type] || 0}</p>
            <p className="text-sm text-gray-500">{type}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="ALL">All Status</option>
              <option value="REQUESTED">🔵 Requested</option>
              <option value="ACCEPTED">🟣 Accepted</option>
              <option value="ACTIVE">🟠 Active</option>
              <option value="COMPLETED">🟢 Completed</option>
              <option value="CANCELLED">🔴 Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="ALL">All Types</option>
              <option value="FOOD">🍜 Food</option>
              <option value="GROCERIES">🛒 Groceries</option>
              <option value="PARCELS">📦 Parcels</option>
              <option value="OTHER">❓ Other</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden shadow">
        {isLoading ? (
          <div className="text-center py-16 text-gray-500">
            <span className="text-2xl block mb-2">⏳</span>Loading deliveries…
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <span className="text-4xl block mb-2">📦</span>
            No deliveries match your filters
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Route</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deliveries.map((d) => {
                const statusCfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.REQUESTED;
                return (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{d.deliveryType ? DELIVERY_ICONS[d.deliveryType] : '📦'}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{d.deliveryType || 'Delivery'}</p>
                          {d.itemDescription && <p className="text-xs text-gray-500">{d.itemDescription}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {d.customer ? (
                        <div>
                          <p className="text-sm font-medium text-gray-900">{d.customer.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{d.customer.phone}</p>
                        </div>
                      ) : <span className="text-sm text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      {d.driver ? (
                        <div>
                          <p className="text-sm font-medium text-gray-900">{d.driver.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{d.driver.phone}</p>
                        </div>
                      ) : <span className="text-sm text-gray-400 italic">Unassigned</span>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="max-w-[200px]">
                        <p className="text-sm text-gray-800 truncate" title={d.pickup.address}>📍 {d.pickup.address}</p>
                        <p className="text-sm text-gray-600 truncate" title={d.destination.address}>📌 {d.destination.address}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">{timeAgo(d.createdAt)}</td>
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
