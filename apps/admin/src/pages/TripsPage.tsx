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
  MOTOR_KING: '🛻',
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trips</h1>
          <p className="mt-1 text-sm text-slate-500">View and manage all ride &amp; delivery trips</p>
        </div>
        <button onClick={() => fetchTrips(pagination.page)} className="btn-secondary">
          🔄 Refresh
        </button>
      </div>

      {/* Mini Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MiniStat label="Total" value={statCounts.total} color="slate" />
        <MiniStat label="Active" value={statCounts.active} color="orange" />
        <MiniStat label="Completed" value={statCounts.completed} color="green" />
        <MiniStat label="Cancelled" value={statCounts.cancelled} color="red" />
      </div>

      {/* Filters */}
      <div className="card p-4">
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
            { value: 'KEKE', label: '🛺 Keke / Pragya' },
            { value: 'MOTOR_KING', label: '🛻 Aboboya' },
          ]} />
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Search</label>
            <input type="search" placeholder="Address, phone, name…" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input w-auto" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input w-auto" />
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="btn-ghost text-red-600 hover:bg-red-50">
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
            <span className="text-sm font-medium">Loading trips…</span>
          </div>
        ) : trips.length === 0 ? (
          <div className="py-16 text-center">
            <span className="mb-2 block text-4xl">🏍️</span>
            <span className="text-sm text-slate-400">{hasActiveFilters ? 'No trips match your filters' : 'No trips yet'}</span>
          </div>
        ) : (
          <>
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>Customer</th>
                  <th>Driver</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th className="text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((trip) => (
                  <TripRow key={trip.id} trip={trip} isExpanded={expandedId === trip.id}
                    onToggle={() => setExpandedId(expandedId === trip.id ? null : trip.id)} />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                <p className="text-sm text-slate-500">
                  Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount}
                </p>
                <div className="flex items-center gap-2">
                  <button disabled={pagination.page <= 1} onClick={() => fetchTrips(pagination.page - 1)} className="btn-secondary btn-sm">
                    ← Prev
                  </button>
                  <span className="text-sm font-medium text-slate-500">Page {pagination.page} / {pagination.totalPages}</span>
                  <button disabled={pagination.page >= pagination.totalPages} onClick={() => fetchTrips(pagination.page + 1)} className="btn-secondary btn-sm">
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
    slate: 'text-slate-900', orange: 'text-orange-600', green: 'text-green-600', red: 'text-red-600',
  };
  return (
    <div className="card p-5">
      <p className={`text-3xl font-bold tracking-tight ${colors[color]}`}>{value}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input w-auto cursor-pointer">
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
      <tr className="cursor-pointer" onClick={onToggle}>
        {/* Trip Info */}
        <td>
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{vehicleIcon}</span>
            <div>
              <p className="font-semibold text-slate-900">
                {trip.vehicleType} {trip.serviceType === 'DELIVERY' ? '· Delivery' : ''}
              </p>
              <p className="font-mono text-xs text-slate-400">{sourceIcon} {trip.id.slice(0, 8)}</p>
            </div>
          </div>
        </td>

        {/* Customer */}
        <td>
          {trip.customer ? (
            <div>
              <p className="font-semibold text-slate-900">{trip.customer.name || 'Unknown'}</p>
              <p className="text-xs text-slate-400">{trip.customer.phone}</p>
            </div>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>

        {/* Driver */}
        <td>
          {trip.driver ? (
            <div>
              <p className="font-semibold text-slate-900">{trip.driver.name || 'Unknown'}</p>
              <p className="text-xs text-slate-400">{trip.driver.phone}</p>
            </div>
          ) : (
            <span className="italic text-slate-300">Unassigned</span>
          )}
        </td>

        {/* Route */}
        <td>
          <div className="max-w-[200px]">
            <p className="truncate text-slate-700" title={trip.pickup.address}>📍 {trip.pickup.address}</p>
            <p className="truncate text-slate-500" title={trip.destination.address}>📌 {trip.destination.address}</p>
          </div>
        </td>

        {/* Status */}
        <td>
          <span className={`badge ${statusCfg.bg} ${statusCfg.color}`}>
            {statusCfg.label}
          </span>
        </td>

        {/* Time */}
        <td>
          <p className="text-slate-600">{timeAgo(trip.createdAt)}</p>
          <p className="text-xs text-slate-400">{formatDate(trip.createdAt)}</p>
        </td>

        {/* Expand */}
        <td className="text-right">
          <span className="text-xs text-slate-400">{isExpanded ? '▲' : '▼'}</span>
        </td>
      </tr>

      {/* Expanded Detail Row */}
      {isExpanded && (
        <tr className="bg-slate-50/70">
          <td colSpan={7} className="px-5 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
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
                <div className="card col-span-2 p-3 md:col-span-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Feedback</p>
                  <div className="flex items-center gap-4">
                    <span className="text-lg">{'⭐'.repeat(trip.feedback.rating)}</span>
                    <span className={
                      trip.feedback.fareRating === 'fair' ? 'badge-green' :
                      trip.feedback.fareRating === 'too_high' ? 'badge-red' : 'badge-amber'
                    }>
                      Fare: {trip.feedback.fareRating}
                    </span>
                    {trip.feedback.issue && <span className="text-xs text-slate-500">Issue: {trip.feedback.issue}</span>}
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
    <div className={span === 2 ? 'col-span-2' : ''}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-900">{value}</p>
    </div>
  );
}
