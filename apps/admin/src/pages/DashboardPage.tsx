/**
 * AllGO MVP Dashboard Page
 * 
 * Simplified: Basic stats and quick access to driver approval
 * Section 18 & 20: Call-in stats, night service indicator
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface Stats {
  drivers: {
    total: number;
    approved: number;
    pending: number;
    online: number;
    nightModeActive?: number;  // Section 20
  };
  customers: {
    total: number;
  };
  trips: {
    active: number;
    completedToday: number;
    bySource?: {  // Section 18
      app: number;
      call: number;
    };
  };
  feedback: {
    total: number;
  };
  service?: {  // Section 18 & 20
    isNightHours: boolean;
    isCallInHours: boolean;
  };
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const hasLoadedStatsRef = useRef(false);

  useEffect(() => {
    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('admin_access_token');
      const response = await axios.get(`${API_BASE_URL}/admin/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setStats(response.data);
      hasLoadedStatsRef.current = true;
      setLoadError(null);
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setLoadError(
        hasLoadedStatsRef.current
          ? 'Dashboard refresh failed. The figures below may be stale.'
          : "We couldn't load the dashboard. Check the connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
          <span className="text-sm font-medium">Loading dashboard…</span>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">
            Dashboard unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {loadError || "We couldn't load dashboard data."}
          </p>
          <button
            type="button"
            className="btn-primary mt-6"
            onClick={() => {
              setIsLoading(true);
              void fetchStats();
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor pilot activity and handle the actions that need attention.
          </p>
        </div>

        {lastUpdatedAt && (
          <p className="text-xs font-medium text-slate-400">
            Updated {lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">
            {loadError}
          </p>
          <button
            type="button"
            className="text-sm font-semibold text-amber-800 underline underline-offset-2"
            onClick={() => void fetchStats()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Section 20: Night/Call-In Service Status Banner */}
      {stats?.service && (
        <div
          className={`flex items-center gap-4 overflow-hidden rounded-2xl p-4 ring-1 ${
            stats.service.isNightHours
              ? 'bg-gradient-to-r from-indigo-50 to-slate-50 ring-indigo-100'
              : 'bg-gradient-to-r from-green-50 to-emerald-50/50 ring-green-100'
          }`}
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
            {stats.service.isNightHours ? '🌙' : '☀️'}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">
              {stats.service.isNightHours ? 'Night Service Active' : 'Daytime Service'}
            </h3>
            <p className="text-sm text-slate-600">
              {stats.service.isNightHours
                ? `${stats.drivers.nightModeActive || 0} drivers with night mode enabled`
                : stats.service.isCallInHours
                  ? 'Call-in booking available (7am–9pm)'
                  : 'Call-in booking closed for tonight'}
            </p>
          </div>
          {stats.service.isCallInHours && (
            <button onClick={() => navigate('/call-in')} className="btn-primary ml-auto shrink-0">
              📞 New Call-In Trip
            </button>
          )}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Drivers Online"
          value={stats.drivers.online.toString()}
          subtitle={`${stats.drivers.approved} approved`}
          icon="👥"
          color="green"
        />
        <StatCard
          title="Active Trips"
          value={stats.trips.active.toString()}
          subtitle={`${stats.trips.completedToday} completed today`}
          icon="🏍️"
          color="blue"
        />
        <StatCard
          title="Call-In Trips"
          value={stats.trips.bySource?.call?.toString() || '0'}
          subtitle={`${stats.trips.bySource?.app || 0} from app`}
          icon="📞"
          color="purple"
          actionLabel="Create Trip"
          onAction={() => navigate('/call-in')}
        />
        <StatCard
          title="Pending Approval"
          value={stats.drivers.pending.toString()}
          subtitle={`${stats.drivers.total} total drivers`}
          icon="⏳"
          color="amber"
          actionLabel={stats && stats.drivers.pending > 0 ? 'Review Now' : undefined}
          onAction={() => navigate('/drivers')}
        />
      </div>

      <div className="card p-6">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-slate-900">
            Pilot operations
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Open the workflows most likely to need operator attention.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OperationButton
            label="New call-in trip"
            description="Book for a customer calling the operator."
            onClick={() => navigate('/call-in')}
          />
          <OperationButton
            label="Monitor trips"
            description="Review active, completed, and cancelled trips."
            onClick={() => navigate('/trips')}
          />
          <OperationButton
            label="Review drivers"
            description="Handle approvals and driver availability."
            onClick={() => navigate('/drivers')}
          />
          <OperationButton
            label="View deliveries"
            description="Inspect delivery trips and item details."
            onClick={() => navigate('/deliveries')}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
  actionLabel,
  onAction,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  color: 'green' | 'blue' | 'purple' | 'amber';
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colorClasses = {
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="stat-card flex flex-col">
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl ${colorClasses[color]}`}>
        {icon}
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-700">{title}</p>
      <p className="text-xs text-slate-400">{subtitle}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-3 inline-flex items-center gap-1 self-start text-sm font-semibold text-primary-600 transition hover:gap-1.5 hover:text-primary-700"
        >
          {actionLabel} <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}

function OperationButton({
  label,
  description,
  onClick,
}: {
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-primary-200 hover:bg-primary-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <span className="block text-sm font-semibold text-slate-900">
        {label}
      </span>
      <span className="mt-1 block text-xs leading-5 text-slate-500">
        {description}
      </span>
    </button>
  );
}
