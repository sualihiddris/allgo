/**
 * AllGO MVP Drivers Management Page
 * 
 * Simplified: Driver approval workflow with isApproved flag
 */

import { useState, useEffect } from 'react';
import axios from 'axios';

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
  KEKE: { icon: '🛺', label: 'Keke' },
  MOTOR_KING: { icon: '🚚', label: 'Motor King' },
};

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [filteredDrivers, setFilteredDrivers] = useState<Driver[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'drivers' | 'feedback'>('drivers');
  const [feedbackSummary, setFeedbackSummary] = useState<DriverFeedbackSummary[]>([]);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(true);

  useEffect(() => {
    fetchDrivers();
    fetchFeedbackSummary();
  }, []);

  useEffect(() => {
    filterDrivers();
  }, [drivers, filter, searchQuery]);

  const fetchDrivers = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/drivers`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
        },
      });
      setDrivers(response.data.drivers || []);
    } catch (error) {
      console.error('Failed to fetch drivers:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Drivers</h2>
          <p className="text-gray-500">Manage driver accounts and approval</p>
        </div>
        <div className="flex gap-4">
          <select
            className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="all">All Drivers</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
          </select>
          <input
            type="search"
            placeholder="Search drivers..."
            className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total Drivers</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-2xl font-bold text-green-500">{stats.online}</p>
          <p className="text-sm text-gray-500">Online Now</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
          <p className="text-sm text-gray-500">Pending Approval</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-2xl font-bold text-blue-500">{stats.approved}</p>
          <p className="text-sm text-gray-500">Approved</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('drivers')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'drivers'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Drivers
        </button>
        <button
          onClick={() => setActiveTab('feedback')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'feedback'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Feedback
        </button>
      </div>

      {activeTab === 'feedback' ? (
        <div className="bg-white rounded-xl overflow-hidden shadow">
          {isLoadingFeedback ? (
            <div className="text-center py-12 text-gray-500">
              <span className="text-2xl block mb-2">⏳</span>
              Loading feedback...
            </div>
          ) : feedbackSummary.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <span className="text-4xl block mb-2">💬</span>
              No feedback submitted yet
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Driver</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Phone</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Avg Rating</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Feedback Count</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Fare Too High</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Fare Too Low</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {feedbackSummary.map((d) => (
                  <tr key={d.driverId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{d.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{d.phone}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">⭐ {d.avgRating.toFixed(1)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{d.totalFeedback}</td>
                    <td className="px-6 py-4">
                      {d.tooHighCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                          ⚠️ {d.tooHighCount}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {d.tooLowCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                          {d.tooLowCount}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
      <div className="bg-white rounded-xl overflow-hidden shadow">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">
            <span className="text-2xl block mb-2">⏳</span>
            Loading drivers...
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Driver</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Phone</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Vehicle</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Plate</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Status</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    <span className="text-4xl block mb-2">👥</span>
                    {searchQuery ? 'No drivers found' : 'No drivers registered yet'}
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((driver) => {
                  const vehicleInfo = VEHICLE_INFO[driver.vehicleType];
                  const isProcessing = processingIds.has(driver.id);

                  return (
                    <tr key={driver.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 font-semibold">
                            {driver.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{driver.name}</p>
                            <p className="text-xs text-gray-500">
                              Joined {new Date(driver.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{driver.phone}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-sm">
                          <span>{vehicleInfo.icon}</span>
                          <span>{vehicleInfo.label}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-gray-600">
                        {driver.vehiclePlate}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {driver.isApproved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full w-fit">
                              ✓ Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full w-fit">
                              ⏳ Pending
                            </span>
                          )}
                          {driver.isOnline && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full w-fit">
                              🟢 Online
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {!driver.isApproved ? (
                            <>
                              <button
                                onClick={() => handleApprove(driver.id)}
                                disabled={isProcessing}
                                className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50"
                              >
                                {isProcessing ? '...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleReject(driver.id)}
                                disabled={isProcessing}
                                className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 disabled:opacity-50"
                              >
                                {isProcessing ? '...' : 'Reject'}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleReject(driver.id)}
                              disabled={isProcessing}
                              className="px-3 py-1 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50"
                            >
                              {isProcessing ? '...' : 'Revoke'}
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
