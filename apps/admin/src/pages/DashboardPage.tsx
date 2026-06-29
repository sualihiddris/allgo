/**
 * AllGO MVP Dashboard Page
 * 
 * Simplified: Basic stats and quick access to driver approval
 * Section 18 & 20: Call-in stats, night service indicator
 */

import { useState, useEffect } from 'react';
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
    } catch (error) {
      console.error('Failed to fetch stats:', error);
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

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          A clean overview of trips, drivers, and service status with the key actions up front.
        </p>
      </div>

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
          value={stats?.drivers.online.toString() || '0'}
          subtitle={`${stats?.drivers.approved || 0} approved`}
          icon="👥"
          color="green"
        />
        <StatCard
          title="Active Trips"
          value={stats?.trips.active.toString() || '0'}
          subtitle={`${stats?.trips.completedToday || 0} completed today`}
          icon="🏍️"
          color="blue"
        />
        <StatCard
          title="Call-In Trips"
          value={stats?.trips.bySource?.call?.toString() || '0'}
          subtitle={`${stats?.trips.bySource?.app || 0} from app`}
          icon="📞"
          color="purple"
          actionLabel="Create Trip"
          onAction={() => navigate('/call-in')}
        />
        <StatCard
          title="Pending Approval"
          value={stats?.drivers.pending.toString() || '0'}
          subtitle={`${stats?.drivers.total || 0} total drivers`}
          icon="⏳"
          color="amber"
          actionLabel={stats && stats.drivers.pending > 0 ? 'Review Now' : undefined}
          onAction={() => navigate('/drivers')}
        />
      </div>

      {/* System Status */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-5 text-base font-semibold text-slate-900">System Status</h3>
          <div className="space-y-1">
            <StatusItem label="Backend Server" status="operational" />
            <StatusItem label="Database" status="operational" />
            <StatusItem label="Socket Server" status="operational" />
          </div>
        </div>

        <div className="card p-6">
          <h3 className="mb-5 text-base font-semibold text-slate-900">MVP Features</h3>
          <div className="space-y-2.5 text-sm">
            <FeatureItem label="3 Vehicle Types (MOTO, KEKE, MOTOR_KING)" enabled />
            <FeatureItem label="Phone-based Communication" enabled />
            <FeatureItem label="Driver Approval Workflow" enabled />
            <FeatureItem label="Simple Dispatch (2km→5km→8km)" enabled />
            <FeatureItem label="30-second Job Timeout" enabled />
            <FeatureItem label="Branch-scoped admin roles + audit log" enabled />
          </div>
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

function StatusItem({ label, status }: { label: string; status: 'operational' | 'degraded' | 'down' }) {
  const statusConfig = {
    operational: { dot: 'bg-green-500', ring: 'bg-green-500/20', text: 'Operational', color: 'text-green-600' },
    degraded: { dot: 'bg-amber-500', ring: 'bg-amber-500/20', text: 'Degraded', color: 'text-amber-600' },
    down: { dot: 'bg-red-500', ring: 'bg-red-500/20', text: 'Down', color: 'text-red-600' },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`relative flex h-2 w-2`}>
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${config.ring}`} />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dot}`} />
        </span>
        <span className={`text-sm font-medium ${config.color}`}>{config.text}</span>
      </div>
    </div>
  );
}

function FeatureItem({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
          enabled ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
        }`}
      >
        {enabled ? '✓' : '–'}
      </span>
      <span className={enabled ? 'text-slate-600' : 'text-slate-400'}>{label}</span>
    </div>
  );
}
