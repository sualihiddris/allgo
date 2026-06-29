/**
 * AllGO MVP Drivers Management Page
 * 
 * Simplified: Driver approval workflow with isApproved flag
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BranchFilterSelect } from '../components';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicleType: 'MOTO' | 'KEKE' | 'MOTOR_KING';
  vehiclePlate: string;
  isApproved: boolean;
  isOnline: boolean;
  createdAt: string;
}

interface DriverFeedbackSummary {
  driverId: string;
  name: string;
  phone: string;
  avgRating: number;
  totalFeedback: number;
  tooHighCount: number;
  tooLowCount: number;
}

const VEHICLE_INFO = {
  MOTO: { icon: '🏍️', label: 'Motorbike' },
  KEKE: { icon: '🛺', label: 'Keke / Pragya' },
  MOTOR_KING: { icon: '🛻', label: 'Aboboya' },
};

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [filteredDrivers, setFilteredDrivers] = useState<Driver[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'drivers' | 'feedback'>('drivers');
  const [feedbackSummary, setFeedbackSummary] = useState<DriverFeedbackSummary[]>([]);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(true);

  const fetchDrivers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/drivers`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
        },
        params: branchFilter ? { branchId: branchFilter } : {},
      });
      setDrivers(response.data.drivers || []);
    } catch (error) {
      console.error('Failed to fetch drivers:', error);
    } finally {
      setIsLoading(false);
    }
  }, [branchFilter]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  useEffect(() => {
    fetchFeedbackSummary();
  }, []);

  useEffect(() => {
    filterDrivers();
  }, [drivers, filter, searchQuery]);

  const fetchFeedbackSummary = async () => {
    setIsLoadingFeedback(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/drivers/feedback`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
        },
      });
      setFeedbackSummary(response.data.drivers || []);
    } catch (error) {
      console.error('Failed to fetch feedback summary:', error);
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  const filterDrivers = () => {
    let filtered = [...drivers];

    // Apply status filter
    if (filter === 'pending') {
      filtered = filtered.filter(d => !d.isApproved);
    } else if (filter === 'approved') {
      filtered = filtered.filter(d => d.isApproved);
    }

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        d =>
          d.name.toLowerCase().includes(query) ||
          d.phone.includes(query) ||
          d.vehiclePlate.toLowerCase().includes(query)
      );
    }

    setFilteredDrivers(filtered);
  };

  const handleApprove = async (driverId: string) => {
    if (!confirm('Approve this driver? They will be able to accept rides.')) return;

    setProcessingIds(prev => new Set(prev).add(driverId));
    try {
      await axios.post(
        `${API_BASE_URL}/admin/drivers/${driverId}/approve`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
          },
        }
      );
      
      // Update local state
      setDrivers(prev =>
        prev.map(d => (d.id === driverId ? { ...d, isApproved: true } : d))
      );
    } catch (error) {
      console.error('Failed to approve driver:', error);
      alert('Failed to approve driver. Please try again.');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(driverId);
        return next;
      });
    }
  };

  const handleReject = async (driverId: string) => {
    const reason = prompt('Enter rejection reason (optional):');
    if (reason === null) return; // User cancelled

    setProcessingIds(prev => new Set(prev).add(driverId));
    try {
      await axios.post(
        `${API_BASE_URL}/admin/drivers/${driverId}/reject`,
        { reason },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
          },
        }
      );
      
      // Update local state
      setDrivers(prev =>
        prev.map(d => (d.id === driverId ? { ...d, isApproved: false } : d))
      );
    } catch (error) {
      console.error('Failed to reject driver:', error);
      alert('Failed to reject driver. Please try again.');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(driverId);
        return next;
      });
    }
  };

  const stats = {
    total: drivers.length,
    online: drivers.filter(d => d.isOnline).length,
    pending: drivers.filter(d => !d.isApproved).length,
    approved: drivers.filter(d => d.isApproved).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Drivers</h1>
          <p className="mt-1 text-sm text-slate-500">Manage driver accounts and approval</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BranchFilterSelect value={branchFilter} onChange={setBranchFilter} />
          <select
            className="input cursor-pointer w-auto"
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="all">All Drivers</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
          </select>
          <input
            type="search"
            placeholder="Search drivers…"
            className="input w-52"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-5">
          <p className="text-3xl font-bold tracking-tight text-slate-900">{stats.total}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Total Drivers</p>
        </div>
        <div className="card p-5">
          <p className="text-3xl font-bold tracking-tight text-green-600">{stats.online}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Online Now</p>
        </div>
        <div className="card p-5">
          <p className="text-3xl font-bold tracking-tight text-amber-600">{stats.pending}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Pending Approval</p>
        </div>
        <div className="card p-5">
          <p className="text-3xl font-bold tracking-tight text-blue-600">{stats.approved}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Approved</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['drivers', 'feedback'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold capitalize transition ${
              activeTab === tab
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'feedback' ? (
        <div className="card overflow-hidden">
          {isLoadingFeedback ? (
            <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
              <span className="text-sm font-medium">Loading feedback…</span>
            </div>
          ) : feedbackSummary.length === 0 ? (
            <div className="py-16 text-center">
              <span className="mb-2 block text-4xl">💬</span>
              <span className="text-sm text-slate-400">No feedback submitted yet</span>
            </div>
          ) : (
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Phone</th>
                  <th>Avg Rating</th>
                  <th>Feedback Count</th>
                  <th>Fare Too High</th>
                  <th>Fare Too Low</th>
                </tr>
              </thead>
              <tbody>
                {feedbackSummary.map((d) => (
                  <tr key={d.driverId}>
                    <td className="font-semibold text-slate-900">{d.name}</td>
                    <td className="text-slate-500">{d.phone}</td>
                    <td className="font-medium">⭐ {d.avgRating.toFixed(1)}</td>
                    <td className="text-slate-500">{d.totalFeedback}</td>
                    <td>
                      {d.tooHighCount > 0 ? (
                        <span className="badge-red">⚠️ {d.tooHighCount}</span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                    <td>
                      {d.tooLowCount > 0 ? (
                        <span className="badge-amber">{d.tooLowCount}</span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
              <span className="text-sm font-medium">Loading drivers…</span>
            </div>
          ) : (
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Phone</th>
                  <th>Vehicle</th>
                  <th>Plate</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <span className="mb-2 block text-4xl">👥</span>
                      <span className="text-sm text-slate-400">
                        {searchQuery ? 'No drivers found' : 'No drivers registered yet'}
                      </span>
                    </td>
                  </tr>
                ) : (
                  filteredDrivers.map((driver) => {
                    const vehicleInfo = VEHICLE_INFO[driver.vehicleType];
                    const isProcessing = processingIds.has(driver.id);

                    return (
                      <tr key={driver.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-600">
                              {driver.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{driver.name}</p>
                              <p className="text-xs text-slate-400">
                                Joined {new Date(driver.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="text-slate-500">{driver.phone}</td>
                        <td>
                          <span className="inline-flex items-center gap-1.5">
                            <span>{vehicleInfo.icon}</span>
                            <span className="font-medium">{vehicleInfo.label}</span>
                          </span>
                        </td>
                        <td className="font-mono text-xs text-slate-500">{driver.vehiclePlate}</td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            {driver.isApproved ? (
                              <span className="badge-green">✓ Approved</span>
                            ) : (
                              <span className="badge-amber">⏳ Pending</span>
                            )}
                            {driver.isOnline && (
                              <span className="badge-blue">
                                <span className="badge-dot bg-blue-500" /> Online
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="text-right">
                          <div className="flex justify-end gap-2">
                            {!driver.isApproved ? (
                              <>
                                <button
                                  onClick={() => handleApprove(driver.id)}
                                  disabled={isProcessing}
                                  className="btn btn-sm bg-green-500 text-white hover:bg-green-600"
                                >
                                  {isProcessing ? '…' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => handleReject(driver.id)}
                                  disabled={isProcessing}
                                  className="btn-danger btn-sm"
                                >
                                  {isProcessing ? '…' : 'Reject'}
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleReject(driver.id)}
                                disabled={isProcessing}
                                className="btn-secondary btn-sm"
                              >
                                {isProcessing ? '…' : 'Revoke'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
