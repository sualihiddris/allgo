/**
 * AllGO Admin — Branches Page (Section 4B, super admin only)
 *
 * Create branches, create/deactivate branch admin accounts, reassign
 * drivers between branches.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface Branch {
  id: string;
  name: string;
  region: string;
  driverCount: number;
  adminCount: number;
}

interface BranchAdmin {
  adminId: string;
  name: string;
  phone: string;
  isActive: boolean;
  branch: { id: string; name: string } | null;
}

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [admins, setAdmins] = useState<BranchAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchRegion, setNewBranchRegion] = useState('');

  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminBranchId, setNewAdminBranchId] = useState('');

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('admin_access_token')}` });

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [branchesRes, adminsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/branches`, { headers: authHeader() }),
        axios.get(`${API_BASE_URL}/admin/branch-admins`, { headers: authHeader() }),
      ]);
      setBranches(branchesRes.data.branches || []);
      setAdmins(adminsRes.data.admins || []);
    } catch (err) {
      console.error('Failed to fetch branch data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreateBranch = async () => {
    if (!newBranchName.trim() || !newBranchRegion.trim()) return;
    try {
      await axios.post(
        `${API_BASE_URL}/admin/branches`,
        { name: newBranchName.trim(), region: newBranchRegion.trim() },
        { headers: authHeader() }
      );
      setNewBranchName('');
      setNewBranchRegion('');
      fetchAll();
    } catch (err) {
      console.error('Failed to create branch:', err);
      alert('Failed to create branch.');
    }
  };

  const handleCreateAdmin = async () => {
    if (!newAdminPhone.trim() || !newAdminName.trim() || !newAdminBranchId) return;
    try {
      await axios.post(
        `${API_BASE_URL}/admin/branch-admins`,
        { phone: newAdminPhone.trim(), name: newAdminName.trim(), branchId: newAdminBranchId },
        { headers: authHeader() }
      );
      setNewAdminPhone('');
      setNewAdminName('');
      setNewAdminBranchId('');
      fetchAll();
    } catch (err) {
      console.error('Failed to create branch admin:', err);
      alert('Failed to create branch admin account.');
    }
  };

  const handleDeactivate = async (adminId: string) => {
    if (!confirm('Deactivate this branch admin account? They will be unable to log in.')) return;
    try {
      await axios.post(`${API_BASE_URL}/admin/branch-admins/${adminId}/deactivate`, {}, { headers: authHeader() });
      fetchAll();
    } catch (err) {
      console.error('Failed to deactivate branch admin:', err);
      alert('Failed to deactivate branch admin.');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Branches</h2>
        <p className="text-gray-500">Manage branches and branch admin accounts (Section 4B)</p>
      </div>

      {/* Branches */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Branches</h3>
        <div className="flex gap-2 mb-4">
          <input
            placeholder="Branch name (e.g. Kumasi)"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <input
            placeholder="Region (e.g. Ashanti)"
            value={newBranchRegion}
            onChange={(e) => setNewBranchRegion(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={handleCreateBranch}
            className="px-4 py-2 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600"
          >
            Add Branch
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Region</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Drivers</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Admins</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {branches.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900">{b.name}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{b.region}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{b.driverCount}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{b.adminCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Branch Admins */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Branch Admin Accounts</h3>
        <div className="flex gap-2 mb-4">
          <input
            placeholder="Phone (e.g. 0244999888)"
            value={newAdminPhone}
            onChange={(e) => setNewAdminPhone(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <input
            placeholder="Name"
            value={newAdminName}
            onChange={(e) => setNewAdminName(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <select
            value={newAdminBranchId}
            onChange={(e) => setNewAdminBranchId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select branch...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button
            onClick={handleCreateAdmin}
            className="px-4 py-2 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600"
          >
            Add Admin
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : admins.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No branch admins yet</p>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Phone</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Branch</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map((a) => (
                <tr key={a.adminId}>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{a.phone}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{a.branch?.name || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {a.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {a.isActive && (
                      <button
                        onClick={() => handleDeactivate(a.adminId)}
                        className="px-3 py-1 bg-gray-500 text-white text-xs rounded-lg hover:bg-gray-600"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
