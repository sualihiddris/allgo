/**
 * AllGO Admin — Trips Management Page
 *
 * Full trip listing with filters, search, pagination, and detail expansion.
 * Consumes GET /api/v1/admin/trips
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// --- Types ---

interface Trip {
  id: string;
  status: 'REQUESTED' | 'ACCEPTED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  source: 'APP' | 'CALL';
  vehicleType: 'MOTO' | 'KEKE' | 'MOTOR_KING';
  serviceType: 'PASSENGER' | 'DELIVERY';
  deliveryType?: 'FOOD' | 'GROCERIES' | 'PARCELS' | 'OTHER';
  pickup: { address: string };
  destination: { address: string };
  customer: { name: string; phone: string } | null;
  driver: { name: string; phone: string; vehicleType: string } | null;
  distanceMeters: number | null;
  customerNote: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  feedback: { rating: number; fareRating: string; issue: string | null } | null;
  createdAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

// --- Constants ---

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  REQUESTED: { label: 'Requested', color: 'text-blue-700', bg: 'bg-blue-100' },
  ACCEPTED: { label: 'Accepted', color: 'text-purple-700', bg: 'bg-purple-100' },
  ACTIVE: { label: 'Active', color: 'text-orange-700', bg: 'bg-orange-100' },
  COMPLETED: { label: 'Completed', color: 'text-green-700', bg: 'bg-green-100' },
  CANCELLED: { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-100' },
};

const VEHICLE_ICONS: Record<string, string> = {
  MOTO: '🏍️',
  KEKE: '🛺',
  MOTOR_KING: '🚚',
};

const SOURCE_ICONS: Record<string, string> = { APP: '📱', CALL: '📞' };

// --- Helpers ---

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDistance(meters: number | null): string {
  if (!meters) return '—';
  return `${(meters / 1000).toFixed(1)} km`;
}

// --- Component ---

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, totalCount: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [vehicleFilter, setVehicleFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchTrips = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (sourceFilter !== 'ALL') params.source = sourceFilter;
      if (vehicleFilter !== 'ALL') params.vehicleType = vehicleFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const token = localStorage.getItem('admin_access_token');
      const { data } = await axios.get(`${API_BASE_URL}/admin/trips`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      setTrips(data.trips || []);
      setPagination(data.pagination || { page: 1, limit: 20, totalCount: 0, totalPages: 0 });
    } catch (err) {
      console.error('Failed to fetch trips:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, sourceFilter, vehicleFilter, searchQuery, dateFrom, dateTo]);

  useEffect(() => { fetchTrips(1); }, [fetchTrips]);

  const clearFilters = () => {
    setStatusFilter('ALL');
    setSourceFilter('ALL');
    setVehicleFilter('ALL');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = statusFilter !== 'ALL' || sourceFilter !== 'ALL' || vehicleFilter !== 'ALL' || searchQuery || dateFrom || dateTo;

  // --- Stat counts ---
  const statCounts = {
    total: pagination.totalCount,
    active: trips.filter(t => ['REQUESTED', 'ACCEPTED', 'ACTIVE'].includes(t.status)).length,
    completed: trips.filter(t => t.status === 'COMPLETED').length,
    cancelled: trips.filter(t => t.status === 'CANCELLED').length,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Trips</h2>
          <p className="text-gray-500">View and manage all ride &amp; delivery trips</p>
        </div>
        <button onClick={() => fetchTrips(pagination.page)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors font-medium">
          🔄 Refresh
        </button>
      </div>

      {/* Mini Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MiniStat label="Total" value={statCounts.total} color="gray" />
        <MiniStat label="Active" value={statCounts.active} color="orange" />
        <MiniStat label="Completed" value={statCounts.completed} color="green" />
        <MiniStat label="Cancelled" value={statCounts.cancelled} color="red" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'ALL', label: 'All Status' },
            { value: 'REQUESTED', label: '🔵 Requested' },
            { value: 'ACCEPTED', label: '🟣 Accepted' },
            { value: 'ACTIVE', label: '🟠 Active' },
            { value: 'COMPLETED', label: '🟢 Completed' },
            { value: 'CANCELLED', label: '🔴 Cancelled' },
          ]} />
          <FilterSelect label="Source" value={sourceFilter} onChange={setSourceFilter} options={[
            { value: 'ALL', label: 'All Sources' },
            { value: 'APP', label: '📱 App' },
            { value: 'CALL', label: '📞 Call-In' },
          ]} />
          <FilterSelect label="Vehicle" value={vehicleFilter} onChange={setVehicleFilter} options={[
            { value: 'ALL', label: 'All Vehicles' },
            { value: 'MOTO', label: '🏍️ Moto' },
            { value: 'KEKE', label: '🛺 Keke' },
            { value: 'MOTOR_KING', label: '🚚 Motor King' },
          ]} />
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <input type="search" placeholder="Address, phone, name…" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden shadow">
        {isLoading ? (
          <div className="text-center py-16 text-gray-500">
            <span className="text-2xl block mb-2">⏳</span>Loading trips…
          </div>
        ) : trips.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <span className="text-4xl block mb-2">🏍️</span>
            {hasActiveFilters ? 'No trips match your filters' : 'No trips yet'}
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Trip</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Route</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trips.map((trip) => (
                  <TripRow key={trip.id} trip={trip} isExpanded={expandedId === trip.id}
                    onToggle={() => setExpandedId(expandedId === trip.id ? null : trip.id)} />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600">
                  Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount}
                </p>
                <div className="flex gap-2">
                  <button disabled={pagination.page <= 1} onClick={() => fetchTrips(pagination.page - 1)}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
                    ← Prev
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-600">Page {pagination.page} / {pagination.totalPages}</span>
                  <button disabled={pagination.page >= pagination.totalPages} onClick={() => fetchTrips(pagination.page + 1)}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    gray: 'text-gray-900', orange: 'text-orange-600', green: 'text-green-600', red: 'text-red-600',
  };
  return (
    <div className="bg-white rounded-lg p-4 shadow">
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function TripRow({ trip, isExpanded, onToggle }: { trip: Trip; isExpanded: boolean; onToggle: () => void }) {
  const statusCfg = STATUS_CONFIG[trip.status] || STATUS_CONFIG.REQUESTED;
  const vehicleIcon = VEHICLE_ICONS[trip.vehicleType] || '🚗';
  const sourceIcon = SOURCE_ICONS[trip.source] || '';

  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={onToggle}>
        {/* Trip Info */}
        <td className="px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">{vehicleIcon}</span>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {trip.vehicleType} {trip.serviceType === 'DELIVERY' ? '· Delivery' : ''}
              </p>
              <p className="text-xs text-gray-400 font-mono">{sourceIcon} {trip.id.slice(0, 8)}</p>
            </div>
          </div>
        </td>

        {/* Customer */}
        <td className="px-5 py-4">
          {trip.customer ? (
            <div>
              <p className="text-sm font-medium text-gray-900">{trip.customer.name || 'Unknown'}</p>
              <p className="text-xs text-gray-500">{trip.customer.phone}</p>
            </div>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </td>

        {/* Driver */}
        <td className="px-5 py-4">
          {trip.driver ? (
            <div>
              <p className="text-sm font-medium text-gray-900">{trip.driver.name || 'Unknown'}</p>
              <p className="text-xs text-gray-500">{trip.driver.phone}</p>
            </div>
          ) : (
            <span className="text-sm text-gray-400 italic">Unassigned</span>
          )}
        </td>

        {/* Route */}
        <td className="px-5 py-4">
          <div className="max-w-[200px]">
            <p className="text-sm text-gray-800 truncate" title={trip.pickup.address}>📍 {trip.pickup.address}</p>
            <p className="text-sm text-gray-600 truncate" title={trip.destination.address}>📌 {trip.destination.address}</p>
          </div>
        </td>

        {/* Status */}
        <td className="px-5 py-4">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
            {statusCfg.label}
          </span>
        </td>

        {/* Time */}
        <td className="px-5 py-4">
          <p className="text-sm text-gray-600">{timeAgo(trip.createdAt)}</p>
          <p className="text-xs text-gray-400">{formatDate(trip.createdAt)}</p>
        </td>

        {/* Expand */}
        <td className="px-5 py-4 text-right">
          <span className="text-gray-400 text-lg">{isExpanded ? '▲' : '▼'}</span>
        </td>
      </tr>

      {/* Expanded Detail Row */}
      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-5 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <DetailItem label="Distance" value={formatDistance(trip.distanceMeters)} />
              <DetailItem label="Source" value={`${SOURCE_ICONS[trip.source]} ${trip.source}`} />
              <DetailItem label="Service" value={trip.serviceType + (trip.deliveryType ? ` (${trip.deliveryType})` : '')} />
              <DetailItem label="Vehicle" value={`${VEHICLE_ICONS[trip.vehicleType]} ${trip.vehicleType}`} />

              {trip.acceptedAt && <DetailItem label="Accepted" value={formatDate(trip.acceptedAt)} />}
              {trip.startedAt && <DetailItem label="Started" value={formatDate(trip.startedAt)} />}
              {trip.completedAt && <DetailItem label="Completed" value={formatDate(trip.completedAt)} />}

              {trip.customerNote && <DetailItem label="Customer Note" value={trip.customerNote} span={2} />}
              {trip.cancelReason && <DetailItem label="Cancel Reason" value={trip.cancelReason} span={2} />}

              {trip.feedback && (
                <div className="col-span-2 md:col-span-4 bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-xs font-medium text-gray-500 mb-1">Feedback</p>
                  <div className="flex items-center gap-4">
                    <span className="text-lg">{'⭐'.repeat(trip.feedback.rating)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      trip.feedback.fareRating === 'fair' ? 'bg-green-100 text-green-700' :
                      trip.feedback.fareRating === 'too_high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      Fare: {trip.feedback.fareRating}
                    </span>
                    {trip.feedback.issue && <span className="text-xs text-gray-600">Issue: {trip.feedback.issue}</span>}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailItem({ label, value, span }: { label: string; value: string; span?: number }) {
  return (
    <div className={span ? `col-span-${span}` : ''}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
