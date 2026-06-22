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
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-gray-500">
          <span className="text-2xl block mb-2">⏳</span>
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-primary-600">AllGo Admin</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">Dashboard</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          A clean overview of trips, drivers, and service status with the key actions up front.
        </p>
      </div>

      {/* Section 20: Night/Call-In Service Status Banner */}
      {stats?.service && (
        <div className={`flex items-center gap-4 rounded-2xl border p-4 ${
          stats.service.isNightHours
            ? 'border-orange-200 bg-orange-50 text-slate-900'
            : 'border-green-200 bg-green-50 text-slate-900'
        }`}>
          <span className="text-3xl">{stats.service.isNightHours ? '🌙' : '☀️'}</span>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">
              {stats.service.isNightHours ? 'Night Service Active' : 'Daytime Service'}
            </h3>
            <p className="text-sm text-slate-600">
              {stats.service.isNightHours 
                ? `${stats.drivers.nightModeActive || 0} drivers with night mode enabled`
                : stats.service.isCallInHours 
                  ? 'Call-in booking available (7am-9pm)'
                  : 'Call-in booking closed for tonight'}
            </p>
          </div>
          {stats.service.isCallInHours && (
            <button
              onClick={() => navigate('/call-in')}
              className="ml-auto rounded-lg bg-primary-500 px-4 py-2 font-semibold text-white transition-colors hover:bg-primary-600"
            >
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
          color="yellow"
          actionLabel={stats && stats.drivers.pending > 0 ? 'Review Now' : undefined}
          onAction={() => navigate('/drivers')}
        />
      </div>

      {/* System Status */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">System Status</h3>
          <div className="space-y-3">
            <StatusItem label="Backend Server" status="operational" />
            <StatusItem label="Database" status="operational" />
            <StatusItem label="Socket Server" status="operational" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">MVP Features</h3>
          <div className="space-y-2 text-sm">
            <FeatureItem label="3 Vehicle Types (MOTO, KEKE, MOTOR_KING)" enabled />
            <FeatureItem label="Phone-based Communication" enabled />
            <FeatureItem label="Cash + Mobile Money Payments" enabled />
            <FeatureItem label="Driver Approval Workflow" enabled />
            <FeatureItem label="Simple Dispatch (2km→5km→8km)" enabled />
            <FeatureItem label="30-second Job Timeout" enabled />
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
  color: 'green' | 'blue' | 'purple' | 'yellow';
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colorClasses = {
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    yellow: 'bg-yellow-100 text-yellow-600',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${colorClasses[color]} text-2xl`}>
          {icon}
        </div>
      </div>
      <p className="mb-1 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mb-1 text-sm font-medium text-slate-900">{title}</p>
      <p className="text-xs text-slate-500">{subtitle}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-3 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          {actionLabel} →
        </button>
      )}
    </div>
  );
}

function StatusItem({ label, status }: { label: string; status: 'operational' | 'degraded' | 'down' }) {
  const statusConfig = {
    operational: { color: 'bg-green-500', text: 'Operational' },
    degraded: { color: 'bg-amber-500', text: 'Degraded' },
    down: { color: 'bg-red-500', text: 'Down' },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${config.color}`}></div>
        <span className="text-sm text-slate-500">{config.text}</span>
      </div>
    </div>
  );
}

function FeatureItem({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-lg">{enabled ? '✅' : '❌'}</span>
      <span className={enabled ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
    </div>
  );
}
